"""Authentication, registration, account self-service and administrator user management.

Contract notes (V3):
* ``POST /auth/login`` and ``GET /auth/me`` keep their v2 response keys (``user``, ``token``, ``token_type``,
  ``role``); new keys are additive.
* ``POST /auth/register`` now accepts ``requested_role`` (researcher | steward | reviewer). Only researcher can be
  granted by the public form; steward/reviewer create a pending role request for an administrator.
* Every token is bound to a server-side session; ``POST /auth/logout`` revokes it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import ratelimit
from ...config import get_settings
from ...deps import COOKIE_NAME, CSRF_HEADER, Actor, current_actor, db, require
from ...models import RoleRequest, User
from ...schemas import (
    AdminUserPatch,
    LoginIn,
    PasswordChangeIn,
    ProfilePatch,
    RegisterIn,
    RoleDecisionIn,
    RoleRequestIn,
    UserCreateIn,
)
from ...security import ROLE_RANK, hash_password, read_token, verify_password
from ...services import accounts as acc
from ...services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

SENSITIVE_LIMIT = (10, 900)  # password changes / role requests per user per 15 minutes


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def user_dict(u: User) -> dict:  # kept for v2 callers
    return acc.user_dict(u)


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", secure=s.cookie_secure,
                        max_age=3600 * s.token_ttl_hours, path="/")


def _err(status: int, code: str, message: str, errors: list[str] | None = None):
    raise HTTPException(status, detail={"code": code, "message": message, "errors": errors or []})


# --------------------------------------------------------------------------------------------- public


@router.get("/registration")
def registration_info():
    """What the sign-up form needs: whether sign-up is open, the roles and what each can do."""
    mode = get_settings().registration_mode
    return {
        "mode": mode,
        "open": mode != "closed",
        "requires_activation": mode == "approval",
        "password_min_length": acc.PASSWORD_MIN,
        "roles": [{"key": k, **v} for k, v in acc.ROLE_INFO.items()],
        "note": "Choosing Data Steward or Reviewer sends a request to an administrator. Until it is approved you "
                "have researcher access. Administrator accounts cannot be created by sign-up.",
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, session: Session = Depends(db)):
    mode = get_settings().registration_mode
    if mode == "closed":
        _err(403, "registration_closed", "Self-registration is disabled on this server. Ask an administrator.")
    ratelimit.hit(f"register:{_client(request)}", limit=get_settings().register_limit_per_hour, window_s=3600,
                  message="Too many sign-ups from this network. Try again later.")
    email = acc.normalise_email(body.email)
    problems = []
    if e := acc.validate_email(email):
        problems.append(e)
    problems += acc.password_problems(body.password, email=email, display_name=body.display_name)
    if body.requested_role != "researcher" and not (body.statement and len(body.statement.strip()) >= 20):
        problems.append("Explain in at least 20 characters why you need the requested role.")
    if problems:
        _err(422, "validation_error", "Please correct the highlighted fields.", problems)
    if acc.find_user(session, email):
        _err(409, "email_taken", "An account with this email already exists. Sign in instead, or ask an "
                                 "administrator to reset the password.")

    pending_activation = mode == "approval"
    u = User(email=email, display_name=body.display_name, role="researcher", affiliation=body.affiliation,
             password_hash=hash_password(body.password), is_active=not pending_activation,
             status="pending_activation" if pending_activation else "active", registered_via="self",
             password_changed_at=datetime.now(UTC))
    session.add(u)
    session.flush()
    rr = None
    if body.requested_role in acc.REQUESTABLE:
        rr = RoleRequest(user_id=u.id, requested_role=body.requested_role, statement=body.statement)
        session.add(rr)
    actor = Actor(u)
    audit.record(session, entity_type="user", entity_id=u.id, action="register", actor=actor,
                 changes={"granted_role": "researcher", "requested_role": body.requested_role,
                          "status": u.status})
    issued = None
    if not pending_activation:
        issued = acc.start_session(session, u, request.headers.get("user-agent"))
        _set_cookie(response, issued.token)
    session.commit()
    msg = ("Your account is waiting for an administrator to activate it. You can sign in once it is active."
           if pending_activation else "Your account is ready and you are signed in.")
    if rr is not None:
        msg += (f" Your request for the {acc.ROLE_INFO[rr.requested_role]['label']} role is pending review by an "
                "administrator; until then you have researcher access.")
    return {"user": acc.user_dict(u, session, full=True), "signed_in": issued is not None,
            "token": issued.token if issued else None, "token_type": "bearer" if issued else None,
            "role_request": acc.request_dict(rr), "message": msg}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, session: Session = Depends(db)):
    ratelimit.hit(f"login:{_client(request)}:{body.email.lower()}", limit=get_settings().login_limit_per_5min, window_s=300,
                  message="Too many sign-in attempts. Try later.")
    user = acc.find_user(session, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        _err(401, "invalid_credentials", "Email or password is incorrect.")
    if not user.is_active:
        # Only reached with the correct password, so the account state is not disclosed to guessers.
        if user.status == "pending_activation":
            _err(403, "account_pending", "Your account is waiting for an administrator to activate it.")
        _err(403, "account_suspended", "This account is suspended. Contact an administrator.")
    issued = acc.start_session(session, user, request.headers.get("user-agent"))
    _set_cookie(response, issued.token)
    audit.record(session, entity_type="user", entity_id=user.id, action="login", actor=Actor(user))
    session.commit()
    return {"user": acc.user_dict(user), "token": issued.token, "token_type": "bearer",
            "expires_at": issued.expires_at.isoformat()}


@router.post("/logout")
def logout(request: Request, response: Response, everywhere: bool = False, session: Session = Depends(db)):
    """Revoke the presented session (or every session of the user with ``everywhere=true``) and clear the cookie."""
    token, from_cookie = None, False
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
    elif request.cookies.get(COOKIE_NAME):
        token, from_cookie = request.cookies[COOKIE_NAME], True
    revoked = 0
    data = read_token(token) if token else None
    # A cross-site page cannot add the client header, so it cannot sign a user out (CSRF).
    if data and data.get("sid") and (not from_cookie or CSRF_HEADER in request.headers):
        if everywhere:
            revoked = acc.revoke_all(session, data["sub"], "logout_everywhere")
        else:
            acc.revoke(session, data["sid"], "logout")
            revoked = 1
        u = session.get(User, data["sub"])
        if u is not None:
            audit.record(session, entity_type="user", entity_id=u.id, action="logout", actor=Actor(u),
                         changes={"sessions_revoked": revoked})
        session.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True, "sessions_revoked": revoked}


@router.get("/me")
def me(actor: Actor = Depends(current_actor), session: Session = Depends(db)):
    if actor.user is None:
        return {"user": None, "role": "viewer", "capabilities": acc.capabilities("viewer")}
    return {"user": acc.user_dict(actor.user, session, full=True), "role": actor.role,
            "capabilities": acc.capabilities(actor.role)}


# ------------------------------------------------------------------------------------------ self-service


@router.patch("/me")
def update_me(body: ProfilePatch, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    u = actor.user
    changes = body.model_dump(exclude_unset=True)
    if "preferences" in changes and changes["preferences"] is not None:
        u.preferences = {**(u.preferences or {}), **changes.pop("preferences")}
    else:
        changes.pop("preferences", None)
    before = {k: getattr(u, k) for k in changes}
    for k, v in changes.items():
        setattr(u, k, v)
    if changes:
        audit.record(session, entity_type="user", entity_id=u.id, action="profile_update", actor=actor,
                     changes=audit.diff(before, changes))
    session.commit()
    return {"user": acc.user_dict(u, session, full=True)}


@router.post("/me/password")
def change_password(body: PasswordChangeIn, session: Session = Depends(db),
                    actor: Actor = Depends(require("researcher"))):
    u = actor.user
    ratelimit.hit(f"pw:{u.id}", limit=SENSITIVE_LIMIT[0], window_s=SENSITIVE_LIMIT[1],
                  message="Too many attempts. Try again later.")
    if not verify_password(body.current_password, u.password_hash):
        _err(403, "invalid_credentials", "The current password is incorrect.")
    problems = acc.password_problems(body.new_password, email=u.email, display_name=u.display_name)
    if body.new_password == body.current_password:
        problems.append("Choose a password different from the current one.")
    if problems:
        _err(422, "validation_error", "Please choose a different password.", problems)
    u.password_hash = hash_password(body.new_password)
    u.password_changed_at = datetime.now(UTC)
    n = acc.revoke_all(session, u.id, "password_changed", except_id=actor.session_id)
    audit.record(session, entity_type="user", entity_id=u.id, action="password_change", actor=actor,
                 changes={"other_sessions_revoked": n})
    session.commit()
    return {"ok": True, "other_sessions_revoked": n}


@router.post("/me/role-requests", status_code=201)
def request_role(body: RoleRequestIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    u = actor.user
    ratelimit.hit(f"rr:{u.id}", limit=SENSITIVE_LIMIT[0], window_s=SENSITIVE_LIMIT[1],
                  message="Too many requests. Try again later.")
    if ROLE_RANK[u.role] >= ROLE_RANK[body.requested_role]:
        _err(409, "already_granted", f"You already have {acc.ROLE_INFO.get(u.role, {}).get('label', u.role)} "
                                     "access or higher.")
    if acc.pending_request(session, u.id):
        _err(409, "request_pending", "You already have a pending role request. Withdraw it first to change it.")
    if not (body.statement and len(body.statement.strip()) >= 20):
        _err(422, "validation_error", "Explain in at least 20 characters why you need this role.")
    rr = RoleRequest(user_id=u.id, requested_role=body.requested_role, statement=body.statement)
    session.add(rr)
    session.flush()
    audit.record(session, entity_type="role_request", entity_id=rr.id, action="create", actor=actor,
                 changes={"requested_role": body.requested_role})
    session.commit()
    return acc.request_dict(rr)


@router.post("/me/role-requests/{request_id}/withdraw")
def withdraw_role_request(request_id: str, session: Session = Depends(db),
                          actor: Actor = Depends(require("researcher"))):
    rr = session.get(RoleRequest, request_id)
    if rr is None or rr.user_id != actor.id:
        _err(404, "not_found", "Role request not found.")
    if rr.status != "pending":
        _err(409, "not_pending", "Only a pending request can be withdrawn.")
    rr.status, rr.decided_at = "withdrawn", datetime.now(UTC)
    audit.record(session, entity_type="role_request", entity_id=rr.id, action="withdraw", actor=actor)
    session.commit()
    return acc.request_dict(rr)


# ------------------------------------------------------------------------------------ administrators only


@router.post("/users", status_code=201)
def create_user(body: UserCreateIn, session: Session = Depends(db), actor: Actor = Depends(require("admin"))):
    email = acc.normalise_email(body.email)
    problems = ([e] if (e := acc.validate_email(email)) else []) + acc.password_problems(
        body.password, email=email, display_name=body.display_name)
    if problems:
        _err(422, "validation_error", "Please correct the highlighted fields.", problems)
    if acc.find_user(session, email):
        _err(409, "email_taken", "A user with that email exists.")
    u = User(email=email, display_name=body.display_name, role=body.role, affiliation=body.affiliation,
             password_hash=hash_password(body.password), registered_via="admin",
             password_changed_at=datetime.now(UTC))
    session.add(u)
    session.flush()
    audit.record(session, entity_type="user", entity_id=u.id, action="create", actor=actor, changes={"role": body.role})
    session.commit()
    return acc.user_dict(u)


@router.get("/users")
def list_users(session: Session = Depends(db), actor: Actor = Depends(require("admin"))):
    users = session.scalars(select(User).order_by(User.created_at)).all()
    return {"users": [acc.user_dict(u, session, full=True) for u in users], "count": len(users)}


@router.patch("/users/{user_id}")
def admin_update_user(user_id: str, body: AdminUserPatch, session: Session = Depends(db),
                      actor: Actor = Depends(require("admin"))):
    u = session.get(User, user_id)
    if u is None:
        _err(404, "not_found", "User not found.")
    if u.id == actor.id and (body.role not in (None, "admin") or body.status == "suspended"):
        _err(409, "self_change", "You cannot remove your own administrator access or suspend yourself.")
    if u.role == "admin" and (body.role not in (None, "admin") or body.status == "suspended") \
            and acc.active_admin_count(session) <= 1:
        _err(409, "last_admin", "At least one active administrator must remain.")
    changes: dict = {}
    if body.role is not None and body.role != u.role:
        changes["role"] = {"from": u.role, "to": body.role}
        u.role = body.role
        # A direct role decision supersedes any pending request for a role the user now has.
        for rr in session.scalars(select(RoleRequest).where(RoleRequest.user_id == u.id,
                                                            RoleRequest.status == "pending")):
            if ROLE_RANK[u.role] >= ROLE_RANK[rr.requested_role]:
                rr.status, rr.decided_by, rr.decided_at = "approved", actor.id, datetime.now(UTC)
                rr.decision_note = "Superseded by a direct role change."
    if body.status is not None and body.status != u.status:
        changes["status"] = {"from": u.status, "to": body.status}
        u.status, u.is_active = body.status, body.status == "active"
        if body.status == "suspended":
            changes["sessions_revoked"] = acc.revoke_all(session, u.id, "suspended")
    if changes:
        audit.record(session, entity_type="user", entity_id=u.id, action="admin_update", actor=actor,
                     changes=changes, note=body.note)
    session.commit()
    return acc.user_dict(u, session, full=True)


@router.get("/role-requests")
def list_role_requests(status: str | None = "pending", session: Session = Depends(db),
                       actor: Actor = Depends(require("admin"))):
    q = select(RoleRequest).order_by(RoleRequest.created_at)
    if status:
        q = q.where(RoleRequest.status == status)
    rows = []
    for rr in session.scalars(q):
        u = session.get(User, rr.user_id)
        rows.append(acc.request_dict(rr) | {"user": acc.user_dict(u) | {"affiliation": u.affiliation,
                                                                         "status": u.status}})
    return {"requests": rows, "count": len(rows)}


@router.post("/role-requests/{request_id}/decision")
def decide_role_request(request_id: str, body: RoleDecisionIn, session: Session = Depends(db),
                        actor: Actor = Depends(require("admin"))):
    rr = session.get(RoleRequest, request_id)
    if rr is None:
        _err(404, "not_found", "Role request not found.")
    if rr.status != "pending":
        _err(409, "not_pending", f"This request is already {rr.status}.")
    u = session.get(User, rr.user_id)
    rr.status = "approved" if body.decision == "approve" else "declined"
    rr.decided_by, rr.decided_at, rr.decision_note = actor.id, datetime.now(UTC), body.note
    changes = {"requested_role": rr.requested_role, "decision": rr.status}
    if body.decision == "approve" and ROLE_RANK[rr.requested_role] > ROLE_RANK[u.role]:
        changes["role"] = {"from": u.role, "to": rr.requested_role}
        u.role = rr.requested_role
    audit.record(session, entity_type="role_request", entity_id=rr.id, action=f"decision_{rr.status}", actor=actor,
                 changes=changes, note=body.note)
    session.commit()
    return acc.request_dict(rr) | {"user": acc.user_dict(u)}
