from __future__ import annotations

import functools
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


@functools.lru_cache(maxsize=4)
def get_engine(url: str | None = None):
    return create_engine(url or get_settings().database_url, pool_pre_ping=True, future=True)


@functools.lru_cache(maxsize=4)
def _sessionmaker(url: str | None = None):
    return sessionmaker(bind=get_engine(url), expire_on_commit=False, future=True)


def get_session() -> Iterator[Session]:
    session = _sessionmaker()()
    try:
        yield session
    finally:
        session.close()


def session_scope(url: str | None = None) -> Session:
    return _sessionmaker(url)()
