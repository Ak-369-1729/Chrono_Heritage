"""Accounts: roles and capabilities, registration, role requests and revocable sessions.

Security rules (V3, brief §7):
* Public registration never creates an administrator, steward or reviewer. Choosing a privileged role at sign-up
  records a *request*; only an administrator (API or the ``app.manage`` CLI run by an operator) can grant it.
* Every issued token is bound to an ``auth_sessions`` row, so sign-out, password changes and suspensions revoke
  tokens server-side instead of relying on the browser deleting a cookie.
* Passwords are hashed with scrypt (``app.security``) and are never logged, returned or stored in audit events.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AuthSession, RoleRequest, User
from ..security import ROLE_RANK, issue_token

PASSWORD_MIN = 12
PASSWORD_MAX = 200
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")

# What each role is for, shown on the registration page and returned by /auth/registration.
ROLE_INFO: dict[str, dict] = {
    "researcher": {
        "label": "Researcher",
        "summary": "Investigates archaeological or historical sites, celestial alignments and hypotheses.",
        "can": ["Record private draft site records and sources", "Register hypotheses and run single-site analyses",
                "Explore the historical sky", "Generate PDF, CSV and JSON reports of your own work"],
        "requires_approval": False,
    },
    "steward": {
        "label": "Data Steward",
        "summary": "Contributes site records, sources, provenance and uncertainty information to the shared registry.",
        "can": ["Everything a researcher can do", "Publish site records to the public registry",
                "Curate and extend other contributors' public records (every change is audited)"],
        "requires_approval": True,
    },
    "reviewer": {
        "label": "Reviewer",
        "summary": "Evaluates evidence, methods, benchmark results and scientific claims.",
        "can": ["Everything a data steward can do", "Approve or reject site records, analyses and feasibility reports",
                "Review benchmark tolerances and evidence-gate conditions", "Read the full audit history"],
        "requires_approval": True,
    },
}
REQUESTABLE = ("steward", "reviewer")

CAPABILITIES: dict[str, list[str]] = {
    "viewer": ["browse.public"],
    "researcher": ["browse.public", "site.create_private", "source.create", "analysis.run", "report.create",
                   "evidence.record", "benchmark.run"],
    "steward": ["site.publish", "site.curate_registry"],
    "reviewer": ["review.records", "review.analyses", "review.gates", "audit.read"],
    "admin": ["users.manage", "roles.grant", "illustrative.edit"],
}


def capabilities(role: str) -> list[str]:
    rank = ROLE_RANK.get(role, 0)
    out: list[str] = []
    for r, caps in CAPABILITIES.items():
        if ROLE_RANK[r] <= rank:
            out.extend(c for c in caps if c not in out)
    return out


def normalise_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> str | None:
    return None if EMAIL_RE.match(email) else "Enter a valid email address, such as name@example.org."


def password_problems(password: str, *, email: str = "", display_name: str = "") -> list[str]:
    """Server-side minimum rules. These are a floor, not a claim that a password is strong."""
    problems = []
    if len(password) < PASSWORD_MIN:
        problems.append(f"Use at least {PASSWORD_MIN} characters.")
    if len(password) > PASSWORD_MAX:
        problems.append(f"Use at most {PASSWORD_MAX} characters.")
    if password and len(set(password)) < 4:
        problems.append("Use more than three different characters.")
    low = password.lower()
    local = email.split("@")[0].lower() if email else ""
    if local and len(local) >= 4 and local in low:
        problems.append("Do not include your email address in the password.")
    if display_name and len(display_name) >= 4 and display_name.lower() in low:
        problems.append("Do not include your name in the password.")
    return problems


def find_user(session: Session, email: str) -> User | None:
    return session.scalars(select(User).where(func.lower(User.email) == normalise_email(email))).first()


def pending_request(session: Session, user_id: str) -> RoleRequest | None:
    return session.scalars(select(RoleRequest).where(RoleRequest.user_id == user_id, RoleRequest.status == "pending")
                           .order_by(RoleRequest.created_at.desc())).first()


def request_dict(r: RoleRequest | None) -> dict | None:
    if r is None:
        return None
    return {"id": r.id, "requested_role": r.requested_role, "status": r.status, "statement": r.statement,
            "created_at": r.created_at.isoformat(), "decided_at": r.decided_at.isoformat() if r.decided_at else None,
            "decision_note": r.decision_note}


def user_dict(u: User, session: Session | None = None, *, full: bool = False) -> dict:
    """Public shape of a user. ``full`` adds account details for the user themself or an administrator."""
    d = {"id": u.id, "email": u.email, "display_name": u.display_name, "role": u.role}
    if full:
        d |= {"status": u.status, "is_active": u.is_active, "affiliation": u.affiliation,
              "preferences": u.preferences or {}, "registered_via": u.registered_via,
              "created_at": u.created_at.isoformat() if u.created_at else None,
              "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
              "capabilities": capabilities(u.role)}
        if session is not None:
            d["pending_role_request"] = request_dict(pending_request(session, u.id))
    return d


# ------------------------------------------------------------------------------------------------- sessions


@dataclass
class IssuedSession:
    token: str
    session_id: str
    expires_at: datetime


def start_session(session: Session, user: User, client: str | None = None) -> IssuedSession:
    s = get_settings()
    expires = datetime.now(UTC) + timedelta(hours=s.token_ttl_hours)
    row = AuthSession(user_id=user.id, expires_at=expires, client=(client or "")[:120] or None)
    session.add(row)
    session.flush()
    user.last_login_at = datetime.now(UTC)
    return IssuedSession(issue_token(user.id, user.role, session_id=row.id), row.id, expires)


def session_valid(session: Session, session_id: str | None, user_id: str) -> bool:
    if not session_id:
        return False  # tokens without a server-side session (pre-V3) are no longer accepted
    row = session.get(AuthSession, session_id)
    return (row is not None and row.user_id == user_id and row.revoked_at is None
            and row.expires_at > datetime.now(UTC))


def revoke(session: Session, session_id: str, reason: str) -> None:
    row = session.get(AuthSession, session_id)
    if row is not None and row.revoked_at is None:
        row.revoked_at, row.revoke_reason = datetime.now(UTC), reason


def revoke_all(session: Session, user_id: str, reason: str, *, except_id: str | None = None) -> int:
    stmt = (update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC), revoke_reason=reason))
    if except_id:
        stmt = stmt.where(AuthSession.id != except_id)
    return session.execute(stmt).rowcount or 0


def active_admin_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active)) or 0
