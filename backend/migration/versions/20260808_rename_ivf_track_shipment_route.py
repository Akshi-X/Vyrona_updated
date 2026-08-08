"""Rename /ivf-track-shipment UI variant routes to /cryocan-tracking

Revision ID: 20260808_cryocan_route
Revises: 20260729_create_refrigerator_raw_data
Create Date: 2026-08-08

The frontend route was renamed to /cryocan-tracking, so the variant lookup
keys in ui_route_variants must match or hospital-specific variants stop
resolving.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260808_cryocan_route"
down_revision = "20260729_create_refrigerator_raw_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text("""
            UPDATE ui_route_variants
            SET route_path = REPLACE(route_path, '/ivf-track-shipment', '/cryocan-tracking')
            WHERE route_path LIKE '/ivf-track-shipment%'
        """)
    )


def downgrade() -> None:
    op.execute(
        sa.text("""
            UPDATE ui_route_variants
            SET route_path = REPLACE(route_path, '/cryocan-tracking', '/ivf-track-shipment')
            WHERE route_path LIKE '/cryocan-tracking%'
        """)
    )
