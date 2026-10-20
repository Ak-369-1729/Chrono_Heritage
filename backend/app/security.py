"""Password hashing (scrypt) and signed bearer tokens (HMAC-SHA256)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import get_settings

# Ordered from least to most privileged. ``steward`` (V3) sits between researcher and reviewer: it may publish
# records to the shared registry and curate other contributors' public records, but cannot review or approve.
ROLES = ("viewer", "researcher", "steward", "reviewer", "admin")
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, dig_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p),
                                dklen=32)
        return hmac.compare_digest(digest, base64.b64decode(dig_b64))
    except (ValueError, TypeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(user_id: str, role: str, ttl_hours: int | None = None, session_id: str | None = None) -> str:
    """Sign a token. ``session_id`` binds it to a revocable server-side session (always set by the API)."""
    settings = get_settings()
    exp = int(time.time() + 3600 * (ttl_hours or settings.token_ttl_hours))
    claims = {"sub": user_id, "role": role, "exp": exp}
    if session_id:
        claims["sid"] = session_id
    payload = _b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = _b64(hmac.new(settings.resolved_secret().encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_token(token: str) -> dict | None:
    try:
        payload, sig = token.split(".")
    except ValueError:
        return None
    expected = _b64(hmac.new(get_settings().resolved_secret().encode(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data
