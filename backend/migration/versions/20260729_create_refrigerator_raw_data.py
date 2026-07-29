"""refrigerator: create refrigerator_raw_data raw telemetry archive table

Revision ID: 20260729_create_refrigerator_raw_data
Revises: 20260618_merge_refrigerator_devices
Create Date: 2026-07-29

Archives raw refrigerator (Tive) webhook payloads verbatim, mirroring the
ln2_iot_raw_data audit trail for LN2 devices. Scoped to refrigerator_id +
zone_id since refrigerators are independently sensored per zone.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260729_create_refrigerator_raw_data'
down_revision = '20260618_merge_refrigerator_devices'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refrigerator_raw_data',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            'refrigerator_id',
            sa.Integer,
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('zone_id', sa.String(50), nullable=False,
                  comment='Zone identifier, e.g. zone_1, zone_2'),
        sa.Column('device_code', sa.String(255), nullable=True,
                  comment='External device identifier from the telemetry payload'),
        sa.Column('raw_temperature', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_humidity', sa.Numeric(10, 4), nullable=True),
        sa.Column('raw_battery_percentage', sa.Numeric(10, 4), nullable=True),
        sa.Column('payload', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index(
        'idx_refrigerator_raw_data_refrigerator_zone_created',
        'refrigerator_raw_data',
        ['refrigerator_id', 'zone_id', 'created_at'],
    )
    op.create_index(
        'idx_refrigerator_raw_data_device_created',
        'refrigerator_raw_data',
        ['device_code', 'created_at'],
    )
    op.create_index(
        'idx_refrigerator_raw_data_payload_gin',
        'refrigerator_raw_data',
        ['payload'],
        postgresql_using='gin',
    )


def downgrade():
    op.drop_index('idx_refrigerator_raw_data_payload_gin', table_name='refrigerator_raw_data')
    op.drop_index('idx_refrigerator_raw_data_device_created', table_name='refrigerator_raw_data')
    op.drop_index('idx_refrigerator_raw_data_refrigerator_zone_created', table_name='refrigerator_raw_data')
    op.drop_table('refrigerator_raw_data')
