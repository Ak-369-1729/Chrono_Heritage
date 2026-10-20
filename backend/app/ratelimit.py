"""Small in-process sliding-window rate limiter.

It protects sign-in, registration, password changes and role requests from brute force and bulk sign-ups. The
counters live in the API process, so with several API workers each worker counts separately (the effective limit is
multiplied by the worker count). A reverse proxy or a shared store should enforce limits in a multi-host deployment;
this is documented in the README.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

_lock = threading.Lock()
_buckets: dict[str, deque] = defaultdict(deque)


def hit(key: str, *, limit: int, window_s: int, message: str) -> None:
    """Record one attempt for ``key``; raise 429 once ``limit`` attempts fall inside the window."""
    now = time.monotonic()
    with _lock:
        q = _buckets[key]
        while q and q[0] < now - window_s:
            q.popleft()
        if len(q) >= limit:
            retry = int(window_s - (now - q[0])) + 1
            raise HTTPException(429, detail={"code": "rate_limited", "message": message, "retry_after_s": retry},
                                headers={"Retry-After": str(retry)})
        q.append(now)


def reset(prefix: str = "") -> None:
    """Clear counters (tests only)."""
    with _lock:
        for k in [k for k in _buckets if k.startswith(prefix)]:
            del _buckets[k]
