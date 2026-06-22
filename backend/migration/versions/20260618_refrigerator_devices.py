"""refrigerator: create refrigerator_devices mapping table

Revision ID: 20260618_refrigerator_devices
Revises: 20260618_refrigerator_tive_devices
Create Date: 2026-06-18

Maps external sensor device codes to refrigerator zones (one device per zone).
Each device_code can belong to at most one refrigerator zone; each zone can
have at most one device.  device_code matches the identifier sent in telemetry
payloads (e.g. EntityName for Tive, or equivalent for other vendors).
"""

from alembic import op
import sqlalchemy as sa

revision = '20260618_refrigerator_devices'
down_revision = '20260618_refrigerator_add_zone_count'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refrigerator_devices',
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
        sa.Column('device_code', sa.String(255), nullable=False, unique=True,
                  comment='External device identifier sent in telemetry payloads (e.g. EntityName)'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('refrigerator_id', 'zone_id',
                            name='uq_refrigerator_device_zone'),
    )
    op.create_index(
        'idx_refrigerator_devices_device_code',
        'refrigerator_devices',
        ['device_code'],
    )


def downgrade():
    op.drop_index('idx_refrigerator_devices_device_code',
                  table_name='refrigerator_devices')
    op.drop_table('refrigerator_devices')
