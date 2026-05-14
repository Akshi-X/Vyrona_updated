"""Add hospital notification flags for alert settings

Revision ID: 20260316_hospital_notify_flags
Revises: 20250312_h6_variants
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20260316_hospital_notify_flags"
down_revision = "20250312_h6_variants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hospitals",
        sa.Column(
            "is_email_notifify",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "hospitals",
        sa.Column(
            "is_whatsapp_notify",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("hospitals", "is_whatsapp_notify")
    op.drop_column("hospitals", "is_email_notifify")
