"""V3 accounts: registration with role requests, approval, sessions, logout, password changes, abuse limits."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app import ratelimit
from app.config import get_settings
from app.db import session_scope
from app.models import AuditEvent, AuthSession, User
from app.security import issue_token

API = "/api/v2"
GOOD_PW = "a-long-test-passphrase-91"
HDR = {"x-chronoheritage-client": "web"}


@pytest.fixture(autouse=True)
def _fresh_limits():
    ratelimit.reset()
    yield
    ratelimit.reset()


def _email(tag: str) -> str:
    return f"{tag}-{uuid.uuid4().hex[:8]}@example.org"


def _register(client, **over):
    body = {"email": _email("new"), "display_name": "New Person", "password": GOOD_PW,
            "requested_role": "researcher"} | over
    r = client.post(f"{API}/auth/register", json=body)
    client.cookies.clear()
    return r, body


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_registration_info_describes_roles_and_never_offers_admin(client):
    d = client.get(f"{API}/auth/registration").json()
    keys = [r["key"] for r in d["roles"]]
    assert keys == ["researcher", "steward", "reviewer"]
    assert "admin" not in keys
    assert {r["key"]: r["requires_approval"] for r in d["roles"]} == {"researcher": False, "steward": True,
                                                                       "reviewer": True}
    assert d["mode"] == "open" and d["password_min_length"] == 12


def test_register_researcher_signs_in_and_grants_only_researcher(client):
    r, body = _register(client)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["signed_in"] and d["user"]["role"] == "researcher" and d["role_request"] is None
    assert "password" not in r.text and "password_hash" not in r.text
    me = client.get(f"{API}/auth/me", headers=_bearer(d["token"])).json()
    assert me["user"]["email"] == body["email"] and me["role"] == "researcher"
    assert "analysis.run" in me["capabilities"] and "site.publish" not in me["capabilities"]
    assert "password_hash" not in me["user"]


def test_register_sets_httponly_session_cookie(client):
    r = client.post(f"{API}/auth/register", json={"email": _email("cookie"), "display_name": "Cookie",
                                                  "password": GOOD_PW})
    assert r.status_code == 201
    cookie = r.headers["set-cookie"].lower()
    assert "ch_token=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    client.cookies.clear()


def test_duplicate_email_is_rejected_case_insensitively(client):
    r, body = _register(client)
    assert r.status_code == 201
    dup, _ = _register(client, email=body["email"].upper())
    assert dup.status_code == 409 and dup.json()["detail"]["code"] == "email_taken"


@pytest.mark.parametrize("pw, fragment", [("short-pw", "at least 12"), ("aaaaaaaaaaaaaaa", "different characters")])
def test_weak_passwords_are_refused_with_reasons(client, pw, fragment):
    r, _ = _register(client, password=pw)
    assert r.status_code == 422
    assert any(fragment in e for e in r.json()["detail"]["errors"])


def test_password_containing_email_is_refused(client):
    email = _email("mallory")
    r, _ = _register(client, email=email, password=email.split("@")[0] + "-extra-123")
    assert r.status_code == 422 and any("email" in e for e in r.json()["detail"]["errors"])


def test_invalid_email_is_refused(client):
    r, _ = _register(client, email="not-an-email")
    assert r.status_code == 422


@pytest.mark.parametrize("extra", [{"role": "admin"}, {"requested_role": "admin"}, {"role": "reviewer"},
                                   {"is_active": True}, {"status": "active"}])
def test_public_registration_cannot_escalate(client, extra):
    r, _ = _register(client, **extra)
    assert r.status_code == 422, r.text


def test_privileged_role_request_needs_a_statement(client):
    r, _ = _register(client, requested_role="reviewer")
    assert r.status_code == 422
    assert any("why you need" in e for e in r.json()["detail"]["errors"])


def test_steward_request_is_pending_and_grants_nothing_until_approved(client, admin, researcher):
    r, body = _register(client, requested_role="steward",
                        statement="I curate the regional survey archive and maintain its source register.")
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["user"]["role"] == "researcher"
    assert d["role_request"]["status"] == "pending" and d["role_request"]["requested_role"] == "steward"
    assert "pending" in d["message"]
    me = _bearer(d["token"])
    # still a researcher: cannot publish to the public registry
    pub = client.post(f"{API}/sites", headers=me, json={"id": f"pend-{uuid.uuid4().hex[:6]}", "name": "Pending",
                                                         "visibility": "public"})
    assert pub.status_code == 403 and pub.json()["detail"]["code"] == "steward_required"
    # only administrators see and decide requests
    assert client.get(f"{API}/auth/role-requests", headers=researcher).status_code == 403
    assert client.get(f"{API}/auth/role-requests").status_code == 401
    rows = client.get(f"{API}/auth/role-requests", headers=admin).json()["requests"]
    req = next(x for x in rows if x["user"]["email"] == body["email"])
    assert client.post(f"{API}/auth/role-requests/{req['id']}/decision", headers=researcher,
                       json={"decision": "approve"}).status_code == 403
    ok = client.post(f"{API}/auth/role-requests/{req['id']}/decision", headers=admin,
                     json={"decision": "approve", "note": "Confirmed with the archive."})
    assert ok.status_code == 200 and ok.json()["user"]["role"] == "steward"
    again = client.post(f"{API}/auth/role-requests/{req['id']}/decision", headers=admin, json={"decision": "approve"})
    assert again.status_code == 409
    # the role is read from the database on every request, so the existing session now has steward rights
    sid = f"pub-{uuid.uuid4().hex[:6]}"
    pub = client.post(f"{API}/sites", headers=me, json={"id": sid, "name": "Published", "visibility": "public"})
    assert pub.status_code == 201, pub.text
    assert client.get(f"{API}/sites/{sid}").status_code == 200  # visible to anonymous visitors
    s = session_scope()
    acts = {e.action for e in s.scalars(select(AuditEvent).where(AuditEvent.entity_id == req["id"]))}
    s.close()
    assert "decision_approved" in acts


def test_declined_request_leaves_role_unchanged(client, admin):
    r, body = _register(client, requested_role="reviewer",
                        statement="I would like to review benchmark tolerances for my department.")
    rows = client.get(f"{API}/auth/role-requests", headers=admin).json()["requests"]
    req = next(x for x in rows if x["user"]["email"] == body["email"])
    d = client.post(f"{API}/auth/role-requests/{req['id']}/decision", headers=admin,
                    json={"decision": "decline", "note": "Not verifiable yet."}).json()
    assert d["status"] == "declined" and d["user"]["role"] == "researcher"


def test_role_request_from_account_page_and_withdraw(client):
    r, _ = _register(client)
    me = _bearer(r.json()["token"])
    short = client.post(f"{API}/auth/me/role-requests", headers=me, json={"requested_role": "steward",
                                                                         "statement": "short"})
    assert short.status_code == 422
    rr = client.post(f"{API}/auth/me/role-requests", headers=me, json={
        "requested_role": "steward", "statement": "I maintain the field survey source register for our team."})
    assert rr.status_code == 201
    dup = client.post(f"{API}/auth/me/role-requests", headers=me, json={
        "requested_role": "reviewer", "statement": "I maintain the field survey source register for our team."})
    assert dup.status_code == 409 and dup.json()["detail"]["code"] == "request_pending"
    assert client.get(f"{API}/auth/me", headers=me).json()["user"]["pending_role_request"]["requested_role"] == "steward"
    w = client.post(f"{API}/auth/me/role-requests/{rr.json()['id']}/withdraw", headers=me)
    assert w.status_code == 200 and w.json()["status"] == "withdrawn"
    assert client.post(f"{API}/auth/me/role-requests", headers=me, json={
        "requested_role": "admin", "statement": "I would like to administer everything please."}).status_code == 422


def test_logout_revokes_the_token_server_side(client):
    r, body = _register(client)
    tok = r.json()["token"]
    assert client.get(f"{API}/auth/me", headers=_bearer(tok)).json()["user"] is not None
    out = client.post(f"{API}/auth/logout", headers=_bearer(tok))
    assert out.status_code == 200 and out.json()["sessions_revoked"] == 1
    # the same token is now useless, even though it has not expired
    assert client.get(f"{API}/auth/me", headers=_bearer(tok)).json()["user"] is None
    w = client.post(f"{API}/sites", headers=_bearer(tok), json={"id": f"x-{uuid.uuid4().hex[:6]}", "name": "X"})
    assert w.status_code == 401


def test_logout_everywhere_and_cookie_logout_requires_client_header(client):
    r, body = _register(client)
    first = r.json()["token"]
    second = client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW}).json()["token"]
    # a cookie-only POST without the client header (what a cross-site form could send) revokes nothing
    client.cookies.set("ch_token", second)
    assert client.post(f"{API}/auth/logout").json()["sessions_revoked"] == 0
    client.cookies.clear()
    assert client.get(f"{API}/auth/me", headers=_bearer(second)).json()["user"] is not None
    out = client.post(f"{API}/auth/logout?everywhere=true", headers=_bearer(second)).json()
    assert out["sessions_revoked"] >= 2
    for t in (first, second):
        assert client.get(f"{API}/auth/me", headers=_bearer(t)).json()["user"] is None


def test_tokens_without_a_server_session_are_rejected(client):
    r, _ = _register(client)
    uid = r.json()["user"]["id"]
    legacy = issue_token(uid, "researcher")  # signed correctly but not bound to a session (v2 format)
    assert client.get(f"{API}/auth/me", headers=_bearer(legacy)).json()["user"] is None
    forged = issue_token(uid, "admin", session_id=str(uuid.uuid4()))  # unknown session id
    assert client.get(f"{API}/auth/users", headers=_bearer(forged)).status_code == 401


def test_password_change_revokes_other_sessions(client):
    r, body = _register(client)
    a = r.json()["token"]
    b = client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW}).json()["token"]
    client.cookies.clear()
    wrong = client.post(f"{API}/auth/me/password", headers=_bearer(a),
                        json={"current_password": "nope-nope-nope", "new_password": "another-long-passphrase-7"})
    assert wrong.status_code == 403
    ok = client.post(f"{API}/auth/me/password", headers=_bearer(a),
                     json={"current_password": GOOD_PW, "new_password": "another-long-passphrase-7"})
    assert ok.status_code == 200 and ok.json()["other_sessions_revoked"] >= 1
    assert client.get(f"{API}/auth/me", headers=_bearer(a)).json()["user"] is not None  # this session stays
    assert client.get(f"{API}/auth/me", headers=_bearer(b)).json()["user"] is None
    assert client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW}).status_code == 401
    client.cookies.clear()
    s = session_scope()
    for ev in s.scalars(select(AuditEvent).where(AuditEvent.action.in_(["password_change", "register"]))):
        assert "password" not in str(ev.changes).replace("password_change", "")
    s.close()


def test_profile_and_preferences(client):
    r, _ = _register(client)
    me = _bearer(r.json()["token"])
    ok = client.patch(f"{API}/auth/me", headers=me, json={"display_name": "Renamed", "affiliation": "Survey Lab",
                                                           "preferences": {"motion": "reduced", "landing": "static"}})
    assert ok.status_code == 200
    u = ok.json()["user"]
    assert u["display_name"] == "Renamed" and u["preferences"] == {"motion": "reduced", "landing": "static"}
    assert client.patch(f"{API}/auth/me", headers=me, json={"preferences": {"motion": "wild"}}).status_code == 422
    assert client.patch(f"{API}/auth/me", headers=me, json={"role": "admin"}).status_code == 422


def test_approval_mode_requires_activation(client, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_mode", "approval")
    r, body = _register(client)
    assert r.status_code == 201 and not r.json()["signed_in"] and r.json()["token"] is None
    assert r.json()["user"]["status"] == "pending_activation"
    login = client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW})
    assert login.status_code == 403 and login.json()["detail"]["code"] == "account_pending"
    bad = client.post(f"{API}/auth/login", json={"email": body["email"], "password": "wrong-password-xx"})
    assert bad.status_code == 401  # the account state is not revealed without the right password
    users = client.get(f"{API}/auth/users", headers=admin).json()["users"]
    uid = next(u["id"] for u in users if u["email"] == body["email"])
    act = client.patch(f"{API}/auth/users/{uid}", headers=admin, json={"status": "active"})
    assert act.status_code == 200 and act.json()["is_active"]
    assert client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW}).status_code == 200
    client.cookies.clear()


def test_closed_registration(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_mode", "closed")
    r, _ = _register(client)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "registration_closed"
    assert client.get(f"{API}/auth/registration").json()["open"] is False


def test_registration_rate_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "register_limit_per_hour", 5)
    codes = [_register(client)[0].status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_suspension_revokes_sessions_and_admin_guards(client, admin):
    r, body = _register(client)
    tok = r.json()["token"]
    uid = r.json()["user"]["id"]
    sus = client.patch(f"{API}/auth/users/{uid}", headers=admin, json={"status": "suspended", "note": "test"})
    assert sus.status_code == 200
    assert client.get(f"{API}/auth/me", headers=_bearer(tok)).json()["user"] is None
    login = client.post(f"{API}/auth/login", json={"email": body["email"], "password": GOOD_PW})
    assert login.status_code == 403 and login.json()["detail"]["code"] == "account_suspended"
    me = client.get(f"{API}/auth/me", headers=admin).json()["user"]
    assert client.patch(f"{API}/auth/users/{me['id']}", headers=admin, json={"role": "researcher"}).status_code == 409
    assert client.patch(f"{API}/auth/users/{me['id']}", headers=admin, json={"status": "suspended"}).status_code == 409


def test_only_admins_manage_users(client, researcher, reviewer, steward):
    for h in (researcher, reviewer, steward):
        assert client.get(f"{API}/auth/users", headers=h).status_code == 403
        assert client.post(f"{API}/auth/users", headers=h, json={
            "email": _email("x"), "display_name": "X", "password": GOOD_PW, "role": "admin"}).status_code == 403
    assert client.get(f"{API}/auth/users").status_code == 401


def test_admin_can_grant_roles_directly(client, admin):
    r, body = _register(client, requested_role="reviewer",
                        statement="Department reviewer for archaeoastronomy method audits.")
    uid = r.json()["user"]["id"]
    d = client.patch(f"{API}/auth/users/{uid}", headers=admin, json={"role": "reviewer"}).json()
    assert d["role"] == "reviewer" and d["pending_role_request"] is None  # superseded request closed


def test_steward_curates_public_records_but_cannot_review_or_archive_others(client, steward, reviewer, researcher):
    sid = f"stew-{uuid.uuid4().hex[:6]}"
    assert client.post(f"{API}/sites", headers=reviewer, json={"id": sid, "name": "Shared record",
                                                               "visibility": "public"}).status_code == 201
    d = client.get(f"{API}/sites/{sid}", headers=steward).json()
    assert d["permissions"]["can_edit"] and not d["permissions"]["can_archive"]
    assert client.patch(f"{API}/sites/{sid}", headers=steward, json={"region": "Upper valley"}).status_code == 200
    assert client.post(f"{API}/sites/{sid}/archive", headers=steward).status_code == 403
    assert client.post(f"{API}/sites/{sid}/review", headers=steward,
                       json={"decision": "approve", "note": "x"}).status_code == 403
    # a researcher who does not own it cannot edit it
    assert client.patch(f"{API}/sites/{sid}", headers=researcher, json={"region": "x"}).status_code == 403
    assert client.get(f"{API}/sites/{sid}", headers=researcher).json()["permissions"]["can_edit"] is False


def test_researcher_cannot_publish_by_patching_visibility(client, researcher):
    sid = f"priv-{uuid.uuid4().hex[:6]}"
    client.post(f"{API}/sites", headers=researcher, json={"id": sid, "name": "Draft"})
    p = client.patch(f"{API}/sites/{sid}", headers=researcher, json={"visibility": "public"})
    assert p.status_code == 403 and p.json()["detail"]["code"] == "steward_required"


def test_job_quota_refuses_excess_work(client, researcher, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_active_jobs_per_user", 0)
    body = {"site_id": "ill-aster-hill",
            "hypothesis": {"target_key": "sun_december_solstice_rise", "mode": "confirmatory",
                           "statement": "The passage axis was oriented toward December solstice sunrise."},
            "parameters": {"horizon_mode": "site_profile", "n_samples": 2000, "seed": 1}}
    r = client.post(f"{API}/analyses/single-site", headers=researcher, json=body)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_jobs"


def test_cookie_writes_still_require_the_client_header(client):
    r = client.post(f"{API}/auth/register", json={"email": _email("csrf"), "display_name": "C", "password": GOOD_PW})
    assert r.status_code == 201  # cookie now set on the client
    no_hdr = client.patch(f"{API}/auth/me", json={"display_name": "Changed"})
    assert no_hdr.status_code == 403 and no_hdr.json()["detail"]["code"] == "csrf"
    assert client.patch(f"{API}/auth/me", headers=HDR, json={"display_name": "Changed"}).status_code == 200
    client.cookies.clear()


def test_manage_cli_creates_and_resets_without_printing_secrets(client, monkeypatch, capsys):
    from app import manage

    email = _email("cli")
    monkeypatch.setenv("CLI_TEST_PW", "cli-created-passphrase-42")
    assert manage.main(["create-user", "--email", email, "--role", "steward", "--password-env", "CLI_TEST_PW"]) == 0
    out = capsys.readouterr().out
    assert "cli-created-passphrase-42" not in out and "steward" in out
    tok = client.post(f"{API}/auth/login", json={"email": email, "password": "cli-created-passphrase-42"}).json()["token"]
    client.cookies.clear()
    monkeypatch.setenv("CLI_TEST_PW", "cli-reset-passphrase-43")
    manage.main(["reset-password", "--email", email, "--password-env", "CLI_TEST_PW"])
    assert "cli-reset-passphrase-43" not in capsys.readouterr().out
    assert client.get(f"{API}/auth/me", headers=_bearer(tok)).json()["user"] is None  # signed out everywhere
    monkeypatch.setenv("CLI_TEST_PW", "short")
    with pytest.raises(SystemExit):
        manage.main(["reset-password", "--email", email, "--password-env", "CLI_TEST_PW"])


def test_sessions_are_persisted_and_password_hash_never_returned(client, admin):
    users = client.get(f"{API}/auth/users", headers=admin).json()["users"]
    assert users and all("password_hash" not in u for u in users)
    s = session_scope()
    assert s.scalars(select(AuthSession)).first() is not None
    assert all(u.password_hash.startswith("scrypt$") for u in s.scalars(select(User)))
    s.close()
