"""Add onboarding_completed flag to users table

Revision ID: 20260425_user_onboarding_completed
Revises: 20260411_ln2_refill_detections
Create Date: 2026-04-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260425_user_onboarding_completed"
down_revision = "20260411_ln2_refill_detections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed")
