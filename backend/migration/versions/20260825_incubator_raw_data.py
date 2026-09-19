"""incubator: create incubator_raw_data audit table

Revision ID: 20260825_incubator_raw_data
Revises: 20260825_incubator_chamber_map
Create Date: 2026-08-25

Archives every CUSTOM_INCUBATOR_IOT chamber reading (full payload + scalars),
mirroring refrigerator_raw_data, so ingestion has an audit trail independent
of whether KPI extraction/deviation-checking succeeded for that reading.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260825_incubator_raw_data'
down_revision = '20260825_incubator_chamber_map'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incubator_raw_data',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            'incubator_id',
            sa.Integer,
            sa.ForeignKey('incubators.incubator_id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('chamber_id', sa.String(50), nullable=False),
        sa.Column('device_id', sa.String(255), nullable=True),
        sa.Column('raw_temperature', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_humidity', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_tvoc', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_o2', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_co2', sa.Numeric(10, 4), nullable=True),
        sa.Column('payload', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index(
        'idx_incubator_raw_data_incubator_chamber_created',
        'incubator_raw_data',
        ['incubator_id', 'chamber_id', 'created_at'],
    )
    op.create_index(
        'idx_incubator_raw_data_device_created',
        'incubator_raw_data',
        ['device_id', 'created_at'],
    )
    op.create_index(
        'idx_incubator_raw_data_payload_gin',
        'incubator_raw_data',
        ['payload'],
        postgresql_using='gin',
    )


def downgrade():
    op.drop_index('idx_incubator_raw_data_payload_gin', table_name='incubator_raw_data')
    op.drop_index('idx_incubator_raw_data_device_created', table_name='incubator_raw_data')
    op.drop_index('idx_incubator_raw_data_incubator_chamber_created', table_name='incubator_raw_data')
    op.drop_table('incubator_raw_data')
