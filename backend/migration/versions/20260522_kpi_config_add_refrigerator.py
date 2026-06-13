"""kpi_config: add refrigerator_id and zone_id columns

Revision ID: 20260522_kpi_config_add_refrigerator
Revises: 20260522_create_refrigerators_table
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_kpi_config_add_refrigerator'
down_revision = '20260522_create_refrigerators_table'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'kpi_config',
        sa.Column(
            'refrigerator_id',
            sa.Integer(),
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='CASCADE'),
            nullable=True,
        )
    )
    op.create_index('ix_kpi_config_refrigerator_id', 'kpi_config', ['refrigerator_id'])
    op.add_column('kpi_config', sa.Column('zone_id', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('kpi_config', 'zone_id')
    op.drop_index('ix_kpi_config_refrigerator_id', table_name='kpi_config')
    op.drop_column('kpi_config', 'refrigerator_id')
