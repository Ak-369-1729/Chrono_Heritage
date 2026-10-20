import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from tests.conftest import TEST_DB


def test_migration_roundtrip_on_scratch_database():
    """Upgrade → downgrade → upgrade on a throw-away database to prove migrations are reversible."""
    base = make_url(TEST_DB)
    scratch = base.set(database=f"{base.database}_migcheck")
    admin = create_engine(base, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{scratch.database}"'))
            c.execute(text(f'CREATE DATABASE "{scratch.database}"'))
    except Exception as exc:  # pragma: no cover - environment without CREATEDB
        pytest.skip(f"cannot create scratch database: {exc}")
    url = scratch.render_as_string(hide_password=False)
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.attributes["database_url"] = url
    try:
        command.upgrade(cfg, "head")
        eng = create_engine(url)
        tables = set(inspect(eng).get_table_names())
        assert {"sites", "orientations", "analysis_runs", "benchmark_results", "dataset_feasibility_reports",
                "audit_events", "generated_reports", "workflow_comparisons", "horizon_profiles"} <= tables
        assert not any(t.startswith("model_") or "prediction" in t for t in tables)  # ML omitted
        assert {"role_requests", "auth_sessions"} <= tables  # V3 accounts
        _assert_models_match_migrations(eng)
        # v2 → v3 upgrade keeps existing accounts and marks them active
        command.downgrade(cfg, "0001")
        assert "role_requests" not in set(inspect(eng).get_table_names())
        with eng.begin() as c:
            c.execute(text("INSERT INTO users (id, email, display_name, role, password_hash, is_active, created_at) "
                           "VALUES ('u-v2', 'v2@example.org', 'V2 user', 'reviewer', 'scrypt$x', true, now()), "
                           "('u-v2b', 'off@example.org', 'Off', 'researcher', 'scrypt$x', false, now())"))
        command.upgrade(cfg, "head")
        with eng.connect() as c:
            rows = dict(c.execute(text("SELECT email, status FROM users")).all())
            assert rows == {"v2@example.org": "active", "off@example.org": "suspended"}
            assert c.execute(text("SELECT role FROM users WHERE id='u-v2'")).scalar() == "reviewer"
        command.downgrade(cfg, "base")
        assert "sites" not in set(inspect(eng).get_table_names())
        command.upgrade(cfg, "head")
        assert "sites" in set(inspect(eng).get_table_names())
        eng.dispose()
    finally:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{scratch.database}" WITH (FORCE)'))
        admin.dispose()


def _assert_models_match_migrations(engine):
    """Autogenerate comparison: the SQLAlchemy models and the migrated schema must not drift."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    import app.models  # noqa: F401  (registers tables)
    from app.db import Base

    def include(obj, name, type_, reflected, compare_to):
        # PostGIS/tiger tables and the spatial index managed by geoalchemy2 are not part of the app metadata
        return not (type_ == "table" and reflected and compare_to is None) and name != "idx_sites_geom"

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": False, "include_object": include})
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == [], f"models and migrations differ: {diff}"
