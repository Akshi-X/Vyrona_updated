"""Add UI variant: dashboard for hospital_id 6 (Yellow IVF)

Revision ID: 20250312_h3_dashboard
Revises: 20240615_ui_variants
Create Date: 2025-03-12

Inserts a UI route variant so hospital 6 (Yellow IVF) uses the custom
dashboard component (DashboardHospital6) for route /dashboard.
"""

import sqlalchemy as sa
from alembic import op

revision = "20250312_h3_dashboard"
down_revision = "20240615_ui_variants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text("""
            INSERT INTO ui_route_variants
                (hospital_id, route_path, component_key, is_active, description)
            VALUES
                (6, '/dashboard', 'DashboardHospital6', true, 'Custom dashboard for Yellow IVF (hospital 6)')
        """)
    )


def downgrade() -> None:
    op.execute(
        sa.text("""
            DELETE FROM ui_route_variants
            WHERE hospital_id = 6 AND route_path = '/dashboard'
        """)
    )
