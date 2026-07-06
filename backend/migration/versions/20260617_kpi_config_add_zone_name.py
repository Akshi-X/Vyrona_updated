"""kpi_config: add zone_name column for named refrigerator zones

Revision ID: 20260617_kpi_config_add_zone_name
Revises: 20260525_remove_zone_from_refrigerator
Create Date: 2026-06-17

Adds zone_name to kpi_config so each refrigerator zone (identified by zone_id) can
carry a human-readable display label (e.g. "Fridge", "Freezer", "Zone A").
No changes to any other table — zone_id already exists on kpi_config, readings,
tasks, critical_alerts, and chat_messages from prior migrations.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260617_kpi_config_add_zone_name'
down_revision = '20260525_remove_zone_from_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('kpi_config', sa.Column('zone_name', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('kpi_config', 'zone_name')
