"""V3 accounts: steward role, account status, role requests, revocable sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-18

Existing users keep their role and become ``status='active'``. No data is removed on upgrade; downgrade drops the
new tables and columns and maps any ``steward`` back to ``researcher`` (the closest v2 role).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("status", sa.String(length=24), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("affiliation", sa.String(length=300), nullable=True))
    op.add_column("users", sa.Column("preferences", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("registered_via", sa.String(length=20), nullable=False, server_default="admin"))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'suspended' END")
    op.create_index("ix_users_email_lower", "users", [sa.text("lower(email)")], unique=True)

    op.create_table(
        "role_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("requested_role", sa.String(length=20), nullable=False),
        sa.Column("statement", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("decided_by", sa.String(length=36), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("requested_role IN ('steward', 'reviewer')", name="ck_role_requests_privileged_only"),
    )
    op.create_index("ix_role_requests_user_id", "role_requests", ["user_id"])
    op.create_index("ix_role_requests_status", "role_requests", ["status"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(length=40), nullable=True),
        sa.Column("client", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index("ix_role_requests_status", table_name="role_requests")
    op.drop_index("ix_role_requests_user_id", table_name="role_requests")
    op.drop_table("role_requests")
    op.execute("UPDATE users SET role = 'researcher' WHERE role = 'steward'")
    op.drop_index("ix_users_email_lower", table_name="users")
    for col in ("password_changed_at", "last_login_at", "registered_via", "preferences", "affiliation", "status"):
        op.drop_column("users", col)
