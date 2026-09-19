"""incubator: create incubator_chamber_map override table

Revision ID: 20260825_incubator_chamber_map
Revises: 20260825_incubator_devices
Create Date: 2026-08-25

Telemetry ingestion assumes a device's reported chamber_id ("1", "2", ...)
equals its row-major position within the incubator's chamber_r x chamber_c
grid. This table lets an installer override that default per-device when
hardware numbers its chambers differently — a row here wins; no row means
"trust the row-major default".
"""

from alembic import op
import sqlalchemy as sa

revision = '20260825_incubator_chamber_map'
down_revision = '20260825_incubator_devices'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incubator_chamber_map',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            'incubator_device_id',
            sa.Integer,
            sa.ForeignKey('incubator_devices.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('device_chamber_id', sa.String(50), nullable=False,
                  comment="chamber_id exactly as this device reports it in telemetry payloads"),
        sa.Column('internal_chamber_id', sa.String(50), nullable=False,
                  comment="Our chamber_id — matches readings.chamber_id / kpi_config.chamber_id"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('incubator_device_id', 'device_chamber_id',
                            name='uq_incubator_chamber_map_device_chamber'),
    )


def downgrade():
    op.drop_table('incubator_chamber_map')
