"""Test fixtures: a dedicated PostgreSQL/PostGIS database migrated with Alembic.

Set CHRONO_TEST_DATABASE_URL to point elsewhere; defaults to the local dev cluster's
``chronoheritage_test`` database.  JPL Horizons is disabled so tests never depend on
network access (the live adapter is tested with a mocked transport).
"""

from __future__ import annotations

import os
import shutil
import tempfile

TEST_DB = os.environ.get("CHRONO_TEST_DATABASE_URL",
                         "postgresql+psycopg://chrono:chrono_dev@localhost:5432/chronoheritage_test")
os.environ["CHRONO_DATABASE_URL"] = TEST_DB
os.environ["CHRONO_ENV"] = "test"
os.environ["CHRONO_SECRET_KEY"] = "test-secret-key-not-for-production-0123456789"
os.environ["CHRONO_HORIZONS_ENABLED"] = "false"
os.environ["CHRONO_RUN_JOBS_INLINE"] = "true"
_ART = tempfile.mkdtemp(prefix="chrono-test-artifacts-")
os.environ["CHRONO_ARTIFACT_DIR"] = _ART

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.db import session_scope  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

PASSWORDS = {"admin": "admin-password-123", "reviewer": "reviewer-password-123",
             "steward": "steward-password-123",
             "researcher": "researcher-password-123", "researcher2": "researcher2-password-123"}


def _alembic_cfg():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.attributes["database_url"] = TEST_DB
    return cfg


def _reset_schema():
    eng = create_engine(TEST_DB)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    eng.dispose()


@pytest.fixture(scope="session", autouse=True)
def database():
    _reset_schema()
    command.upgrade(_alembic_cfg(), "head")
    s = session_scope()
    for role, pw in PASSWORDS.items():
        s.add(User(email=f"{role}@test.local", display_name=role.title(),
                   role="researcher" if role == "researcher2" else role, password_hash=hash_password(pw)))
    s.commit()
    from app.seed import seed_demo
    seed_demo(s)
    s.commit()
    s.close()
    yield
    shutil.rmtree(_ART, ignore_errors=True)


@pytest.fixture(scope="session")
def client(database):
    from app.main import app

    with TestClient(app) as c:
        yield c


def _token(client, role):
    r = client.post("/api/v2/auth/login", json={"email": f"{role}@test.local", "password": PASSWORDS[role]})
    assert r.status_code == 200, r.text
    client.cookies.clear()  # use bearer tokens explicitly in tests
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def researcher(client):
    return _token(client, "researcher")


@pytest.fixture(scope="session")
def researcher2(client):
    return _token(client, "researcher2")


@pytest.fixture(scope="session")
def steward(client):
    return _token(client, "steward")


@pytest.fixture(scope="session")
def reviewer(client):
    return _token(client, "reviewer")


@pytest.fixture(scope="session")
def admin(client):
    return _token(client, "admin")
