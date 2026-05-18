"""Create integration_api_tokens table

Revision ID: 20260501_integration_api_tokens
Revises: 20260425_user_onboarding_completed
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260501_integration_api_tokens"
down_revision = "20260425_user_onboarding_completed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_api_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("jti", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hospital_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.String(), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("ix_integration_api_tokens_jti", "integration_api_tokens", ["jti"], unique=True)
    op.create_index("ix_integration_api_tokens_user_id", "integration_api_tokens", ["user_id"])
    op.create_index("ix_integration_api_tokens_hospital_id", "integration_api_tokens", ["hospital_id"])
    op.create_index("ix_integration_api_tokens_revoked_at", "integration_api_tokens", ["revoked_at"])
    op.create_index(
        "idx_integration_token_hospital_purpose",
        "integration_api_tokens",
        ["hospital_id", "purpose"],
    )
    op.create_index(
        "idx_integration_token_active",
        "integration_api_tokens",
        ["revoked_at", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_integration_token_active", table_name="integration_api_tokens")
    op.drop_index("idx_integration_token_hospital_purpose", table_name="integration_api_tokens")
    op.drop_index("ix_integration_api_tokens_revoked_at", table_name="integration_api_tokens")
    op.drop_index("ix_integration_api_tokens_hospital_id", table_name="integration_api_tokens")
    op.drop_index("ix_integration_api_tokens_user_id", table_name="integration_api_tokens")
    op.drop_index("ix_integration_api_tokens_jti", table_name="integration_api_tokens")
    op.drop_table("integration_api_tokens")
