"""Add UI variants for hospital_id 6: control-tower, ivf-track-shipment, alert-setting

Revision ID: 20250312_h6_variants
Revises: 20250312_h3_dashboard
Create Date: 2025-03-12

Inserts UI route variants so hospital 6 (Yellow IVF) uses custom components
with pale yellow layout for control-tower, ivf-track-shipment (list + detail),
and alert-setting.
"""

import sqlalchemy as sa
from alembic import op

revision = "20250312_h6_variants"
down_revision = "20250312_h3_dashboard"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text("""
            INSERT INTO ui_route_variants
                (hospital_id, route_path, component_key, is_active, description)
            VALUES
                (6, '/control-tower', 'ControlTowerHospital6', true, 'Custom control tower for Yellow IVF (hospital 6)'),
                (6, '/ivf-track-shipment', 'IVFTrackShipmentHospital6', true, 'Custom IVF track shipment for Yellow IVF (hospital 6)'),
                (6, '/ivf-track-shipment/:tankId', 'IVFTrackShipmentHospital6', true, 'Custom IVF track shipment detail for Yellow IVF (hospital 6)'),
                (6, '/alert-setting', 'AlertSettingHospital6', true, 'Custom alert setting for Yellow IVF (hospital 6)')
        """)
    )


def downgrade() -> None:
    op.execute(
        sa.text("""
            DELETE FROM ui_route_variants
            WHERE hospital_id = 6 AND route_path IN (
                '/control-tower',
                '/ivf-track-shipment',
                '/ivf-track-shipment/:tankId',
                '/alert-setting'
            )
        """)
    )
