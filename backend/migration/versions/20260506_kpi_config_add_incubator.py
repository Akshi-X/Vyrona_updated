"""kpi_config: add incubator_id, make tank_id nullable

Revision ID: 20260506_kpi_config_add_incubator
Revises: 20260506_create_incubators_table
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = '20260506_kpi_config_add_incubator'
down_revision = '20260506_create_incubators_table'
branch_labels = None
depends_on = None


def upgrade():
    # Make tank_id nullable
    op.alter_column('kpi_config', 'tank_id', existing_type=sa.Integer(), nullable=True)

    # Add incubator_id FK (nullable)
    op.add_column(
        'kpi_config',
        sa.Column(
            'incubator_id',
            sa.Integer(),
            sa.ForeignKey('incubators.incubator_id', ondelete='CASCADE'),
            nullable=True,
            index=True,
        )
    )
    op.create_index('ix_kpi_config_incubator_id', 'kpi_config', ['incubator_id'])
    op.add_column('kpi_config', sa.Column('chamber_id', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('kpi_config', 'chamber_id')
    op.drop_index('ix_kpi_config_incubator_id', table_name='kpi_config')
    op.drop_column('kpi_config', 'incubator_id')
    op.alter_column('kpi_config', 'tank_id', existing_type=sa.Integer(), nullable=False)
