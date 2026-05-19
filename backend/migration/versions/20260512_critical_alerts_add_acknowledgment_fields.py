"""Add acknowledgment_reason and is_lid_state to critical_alerts

Revision ID: 20260512_critical_alerts_ack_fields
Revises: 20260508_critical_alerts_add_incubator
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = '20260512_critical_alerts_ack_fields'
down_revision = '20260508_critical_alerts_add_incubator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'critical_alerts',
        sa.Column(
            'acknowledgment_reason',
            sa.String(500),
            nullable=True,
            comment="Reason provided by user when acknowledging the alert",
        ),
    )


def downgrade():
    op.drop_column('critical_alerts', 'acknowledgment_reason')
