"""Add unack escalation fields to kpi_config

Revision ID: 20260502_add_kpi_escalation_fields
Revises: 20260501_integration_api_tokens
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260502_add_kpi_escalation_fields"
down_revision = "20260501_integration_api_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "kpi_config",
        sa.Column(
            "unack_escalation_threshold",
            sa.Integer(),
            nullable=True,
            comment="N consecutive unacknowledged alerts before escalation email is sent to admins/managers. NULL disables escalation for this KPI.",
        ),
    )
    op.add_column(
        "kpi_config",
        sa.Column(
            "last_escalation_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp of the last escalation email sent for this KPI config. Used to prevent re-escalation spam.",
        ),
    )


def downgrade() -> None:
    op.drop_column("kpi_config", "last_escalation_sent_at")
    op.drop_column("kpi_config", "unack_escalation_threshold")
