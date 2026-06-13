"""readings: add refrigerator_id and zone_id columns

Revision ID: 20260522_readings_add_refrigerator
Revises: 20260522_kpi_config_add_refrigerator
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_readings_add_refrigerator'
down_revision = '20260522_kpi_config_add_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'readings',
        sa.Column(
            'refrigerator_id',
            sa.Integer(),
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='CASCADE'),
            nullable=True,
        )
    )
    op.create_index('ix_readings_refrigerator_id', 'readings', ['refrigerator_id'])
    op.add_column('readings', sa.Column('zone_id', sa.String(255), nullable=True))
    op.create_index('ix_readings_zone_id', 'readings', ['zone_id'])
    op.create_index(
        'idx_readings_refrigerator_zone_ts',
        'readings',
        ['refrigerator_id', 'zone_id', 'timestamp'],
    )


def downgrade():
    op.drop_index('idx_readings_refrigerator_zone_ts', table_name='readings')
    op.drop_index('ix_readings_zone_id', table_name='readings')
    op.drop_column('readings', 'zone_id')
    op.drop_index('ix_readings_refrigerator_id', table_name='readings')
    op.drop_column('readings', 'refrigerator_id')
