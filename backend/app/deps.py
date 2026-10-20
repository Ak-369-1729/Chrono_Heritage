"""FastAPI dependencies: database session, current user, role checks, CSRF guard."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .db import get_session
from .models import User
from .security import ROLE_RANK, read_token
from .services.accounts import session_valid

COOKIE_NAME = "ch_token"
CSRF_HEADER = "x-chronoheritage-client"


@dataclass
class Actor:
    user: User | None
    session_id: str | None = None

    @property
    def id(self) -> str | None:
        return self.user.id if self.user else None

    @property
    def role(self) -> str:
        return self.user.role if self.user else "viewer"

    @property
    def label(self) -> str:
        return self.user.display_name if self.user else "anonymous"

    def at_least(self, role: str) -> bool:
        return self.user is not None and ROLE_RANK[self.role] >= ROLE_RANK[role]


def db(session: Session = Depends(get_session)) -> Session:
    return session


def current_actor(request: Request, session: Session = Depends(db),
                  authorization: str | None = Header(default=None)) -> Actor:
    token = None
    from_cookie = False
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif request.cookies.get(COOKIE_NAME):
        token = request.cookies[COOKIE_NAME]
        from_cookie = True
    if not token:
        return Actor(None)
    data = read_token(token)
    if not data:
        return Actor(None)
    user = session.get(User, data["sub"])
    if not user or not user.is_active:
        return Actor(None)
    # V3: the token must belong to a live server-side session (revoked on sign-out, password change, suspension).
    if not session_valid(session, data.get("sid"), user.id):
        return Actor(None)
    # Cookie-authenticated state-changing requests must carry the client header (CSRF guard):
    # browsers cannot add custom headers cross-site without a CORS preflight.
    if from_cookie and request.method not in ("GET", "HEAD", "OPTIONS") and CSRF_HEADER not in request.headers:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={"code": "csrf", "message": "Missing client header."})
    return Actor(user, data.get("sid"))


def require(role: str):
    def checker(actor: Actor = Depends(current_actor)) -> Actor:
        if actor.user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                                detail={"code": "auth_required", "message": "Sign in required."})
        if not actor.at_least(role):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                detail={"code": "forbidden", "message": f"Requires role '{role}' or higher."})
        return actor

    return checker
