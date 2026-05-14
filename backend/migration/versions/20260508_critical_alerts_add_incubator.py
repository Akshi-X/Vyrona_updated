"""critical_alerts: add incubator_id and chamber_id columns

Revision ID: 20260508_critical_alerts_add_incubator
Revises: 20260508_chat_read_status_incubator
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa

revision = '20260508_critical_alerts_add_incubator'
down_revision = '20260508_chat_read_status_incubator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'critical_alerts',
        sa.Column(
            'incubator_id',
            sa.Integer(),
            sa.ForeignKey('incubators.incubator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_critical_alerts_incubator_id', 'critical_alerts', ['incubator_id'])
    op.add_column('critical_alerts', sa.Column('chamber_id', sa.String(255), nullable=True))

    # tank_id was already NOT NULL; make it nullable now that incubator alerts need no tank
    op.alter_column('critical_alerts', 'tank_id', existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.alter_column('critical_alerts', 'tank_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('critical_alerts', 'chamber_id')
    op.drop_index('ix_critical_alerts_incubator_id', table_name='critical_alerts')
    op.drop_column('critical_alerts', 'incubator_id')
