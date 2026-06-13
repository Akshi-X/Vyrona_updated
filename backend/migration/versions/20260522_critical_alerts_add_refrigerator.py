"""critical_alerts: add refrigerator_id and zone_id columns

Revision ID: 20260522_critical_alerts_add_refrigerator
Revises: 20260522_chat_read_status_refrigerator
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_critical_alerts_add_refrigerator'
down_revision = '20260522_chat_read_status_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'critical_alerts',
        sa.Column(
            'refrigerator_id',
            sa.Integer(),
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_critical_alerts_refrigerator_id', 'critical_alerts', ['refrigerator_id'])
    op.add_column('critical_alerts', sa.Column('zone_id', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('critical_alerts', 'zone_id')
    op.drop_index('ix_critical_alerts_refrigerator_id', table_name='critical_alerts')
    op.drop_column('critical_alerts', 'refrigerator_id')
