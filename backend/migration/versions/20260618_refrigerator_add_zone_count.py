"""refrigerator: add zone_count column

Revision ID: 20260618_refrigerator_add_zone_count
Revises: 20260617_kpi_config_add_zone_name
Create Date: 2026-06-18

Adds zone_count (INT, nullable) to the refrigerators table so that the number of
independently-sensored zones is declared on the device row rather than inferred
from kpi_config rows.  zone_id on linked tables continues to use the fixed convention
"zone_1", "zone_2", ... "zone_N".  zone_name on kpi_config stores the user-assigned
display label for each zone (e.g. "Fridge", "Freezer", "Zone A").
"""
from alembic import op
import sqlalchemy as sa

revision = '20260618_refrigerator_add_zone_count'
down_revision = '20260617_kpi_config_add_zone_name'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('refrigerators', sa.Column('zone_count', sa.Integer, nullable=True))


def downgrade():
    op.drop_column('refrigerators', 'zone_count')
