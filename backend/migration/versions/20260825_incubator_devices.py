"""incubator: create incubator_devices mapping table

Revision ID: 20260825_incubator_devices
Revises: 20260820_add_quality_flag_reasons_to_ivf_oocyte_grade
Create Date: 2026-08-25

Maps an external IoT device_id to an incubator. Unlike refrigerator_devices
(one device per zone), one incubator device reports every chamber of that
incubator in a single telemetry payload, so this table has no chamber/zone
column — the chamber-level identity comes from the payload itself, resolved
against the incubator's chamber_r x chamber_c grid at ingestion time.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260825_incubator_devices'
down_revision = '20260820_add_quality_flag_reasons_to_ivf_oocyte_grade'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incubator_devices',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            'incubator_id',
            sa.Integer,
            sa.ForeignKey('incubators.incubator_id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('device_id', sa.String(255), nullable=False, unique=True,
                  comment='External device identifier sent in telemetry payloads'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index(
        'idx_incubator_devices_device_id',
        'incubator_devices',
        ['device_id'],
    )


def downgrade():
    op.drop_index('idx_incubator_devices_device_id',
                  table_name='incubator_devices')
    op.drop_table('incubator_devices')
