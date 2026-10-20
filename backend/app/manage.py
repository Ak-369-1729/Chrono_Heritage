"""Operator commands for local development and administration.

    python -m app.manage create-user  --email E [--name N] [--role researcher|steward|reviewer|admin]
    python -m app.manage reset-password --email E
    python -m app.manage set-role     --email E --role ROLE
    python -m app.manage set-status   --email E --status active|suspended
    python -m app.manage list-users

Passwords are read from a hidden terminal prompt (typed twice) or, for scripts and CI, from the environment variable
named by ``--password-env``. They are never accepted on the command line (shell history), never printed and never
logged. Running these commands requires access to the server and its database, which is what makes this the trusted
path for granting privileged roles.

In Docker Compose:  docker compose exec api python -m app.manage create-user --email you@example.org --role admin
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from .db import session_scope
from .models import User
from .security import ROLES, hash_password
from .services import accounts as acc
from .services import audit

OPERATOR = type("Operator", (), {"id": None, "label": "operator (app.manage)"})()


def _password(args, email: str, name: str) -> str:
    if args.password_env:
        pw = os.environ.get(args.password_env)
        if not pw:
            sys.exit(f"Environment variable {args.password_env} is empty or not set.")
    else:
        if not sys.stdin.isatty():
            sys.exit("No terminal for a hidden prompt. Use --password-env VAR (or 'docker compose exec' with a TTY).")
        pw = getpass.getpass(f"New password for {email} (min {acc.PASSWORD_MIN} characters, hidden): ")
        if getpass.getpass("Repeat the password: ") != pw:
            sys.exit("The two passwords do not match. Nothing was changed.")
    problems = acc.password_problems(pw, email=email, display_name=name)
    if problems:
        sys.exit("Password rejected: " + " ".join(problems))
    return pw


def _user(session, email: str) -> User:
    u = acc.find_user(session, email)
    if u is None:
        sys.exit(f"No account with email {email}.")
    return u


def cmd_create(args) -> None:
    email = acc.normalise_email(args.email)
    if err := acc.validate_email(email):
        sys.exit(err)
    session = session_scope()
    try:
        if acc.find_user(session, email):
            sys.exit(f"An account with email {email} already exists. Use reset-password or set-role instead.")
        name = args.name or email.split("@")[0]
        pw = _password(args, email, name)
        u = User(email=email, display_name=name, role=args.role, password_hash=hash_password(pw),
                 registered_via="operator", password_changed_at=datetime.now(UTC))
        session.add(u)
        session.flush()
        audit.record(session, entity_type="user", entity_id=u.id, action="create", actor=OPERATOR,
                     changes={"role": args.role, "via": "app.manage"})
        session.commit()
        print(f"Created {args.role} account {email}.")
    finally:
        session.close()


def cmd_reset(args) -> None:
    session = session_scope()
    try:
        u = _user(session, args.email)
        pw = _password(args, u.email, u.display_name)
        u.password_hash, u.password_changed_at = hash_password(pw), datetime.now(UTC)
        n = acc.revoke_all(session, u.id, "password_reset")
        audit.record(session, entity_type="user", entity_id=u.id, action="password_reset", actor=OPERATOR,
                     changes={"sessions_revoked": n})
        session.commit()
        print(f"Password reset for {u.email}; {n} active session(s) signed out.")
    finally:
        session.close()


def cmd_set_role(args) -> None:
    session = session_scope()
    try:
        u = _user(session, args.email)
        if u.role == "admin" and args.role != "admin" and acc.active_admin_count(session) <= 1:
            sys.exit("Refusing: this is the last active administrator.")
        before, u.role = u.role, args.role
        audit.record(session, entity_type="user", entity_id=u.id, action="admin_update", actor=OPERATOR,
                     changes={"role": {"from": before, "to": args.role}, "via": "app.manage"})
        session.commit()
        print(f"{u.email}: role {before} → {args.role}.")
    finally:
        session.close()


def cmd_set_status(args) -> None:
    session = session_scope()
    try:
        u = _user(session, args.email)
        before = u.status
        u.status, u.is_active = args.status, args.status == "active"
        n = acc.revoke_all(session, u.id, "suspended") if args.status == "suspended" else 0
        audit.record(session, entity_type="user", entity_id=u.id, action="admin_update", actor=OPERATOR,
                     changes={"status": {"from": before, "to": args.status}, "sessions_revoked": n})
        session.commit()
        print(f"{u.email}: status {before} → {args.status}.")
    finally:
        session.close()


def cmd_list(_args) -> None:
    session = session_scope()
    try:
        rows = session.scalars(select(User).order_by(User.created_at)).all()
        print(f"{'email':40} {'role':11} {'status':19} pending request")
        for u in rows:
            rr = acc.pending_request(session, u.id)
            print(f"{u.email:40} {u.role:11} {u.status:19} {rr.requested_role if rr else '-'}")
    finally:
        session.close()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.manage", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user", help="create an account (any role; operator path)")
    c.add_argument("--email", required=True)
    c.add_argument("--name")
    c.add_argument("--role", choices=[r for r in ROLES if r != "viewer"], default="researcher")
    c.add_argument("--password-env", help="read the password from this environment variable instead of a prompt")
    c.set_defaults(fn=cmd_create)
    r = sub.add_parser("reset-password", help="set a new password and sign out every session")
    r.add_argument("--email", required=True)
    r.add_argument("--password-env")
    r.set_defaults(fn=cmd_reset)
    s = sub.add_parser("set-role", help="change an account's role")
    s.add_argument("--email", required=True)
    s.add_argument("--role", choices=[r for r in ROLES if r != "viewer"], required=True)
    s.set_defaults(fn=cmd_set_role)
    st = sub.add_parser("set-status", help="activate a pending account or suspend one")
    st.add_argument("--email", required=True)
    st.add_argument("--status", choices=["active", "suspended"], required=True)
    st.set_defaults(fn=cmd_set_status)
    sub.add_parser("list-users", help="list accounts (no secrets)").set_defaults(fn=cmd_list)
    args = ap.parse_args(argv)
    args.fn(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
