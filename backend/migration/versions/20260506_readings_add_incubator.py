"""readings: add incubator_id, chamber_id; make tank_id nullable

Revision ID: 20260506_readings_add_incubator
Revises: 20260506_kpi_config_add_incubator
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = '20260506_readings_add_incubator'
down_revision = '20260506_kpi_config_add_incubator'
branch_labels = None
depends_on = None


def upgrade():
    # Make tank_id nullable (incubator readings have no tank_id)
    op.alter_column('readings', 'tank_id', existing_type=sa.Integer(), nullable=True)

    # Add incubator_id FK (nullable)
    op.add_column(
        'readings',
        sa.Column(
            'incubator_id',
            sa.Integer(),
            sa.ForeignKey('incubators.incubator_id', ondelete='CASCADE'),
            nullable=True,
        )
    )
    op.create_index('ix_readings_incubator_id', 'readings', ['incubator_id'])

    # Add chamber_id (nullable string)
    op.add_column('readings', sa.Column('chamber_id', sa.String(255), nullable=True))
    op.create_index('ix_readings_chamber_id', 'readings', ['chamber_id'])

    # Compound index for incubator+chamber time-series queries
    op.create_index(
        'idx_readings_incubator_chamber_ts',
        'readings',
        ['incubator_id', 'chamber_id', 'timestamp'],
    )


def downgrade():
    op.drop_index('idx_readings_incubator_chamber_ts', table_name='readings')
    op.drop_index('ix_readings_chamber_id', table_name='readings')
    op.drop_column('readings', 'chamber_id')
    op.drop_index('ix_readings_incubator_id', table_name='readings')
    op.drop_column('readings', 'incubator_id')
    op.alter_column('readings', 'tank_id', existing_type=sa.Integer(), nullable=False)
