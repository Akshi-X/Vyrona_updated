"""canister_ln2_logs: add covering index for latest-refill DISTINCT ON query

Revision ID: 20260617_ln2_log_latest_refill_index
Revises: 20260617_kpi_config_add_zone_name
Create Date: 2026-06-17

Adds idx_ln2_log_tank_latest_refill on (tank_id, refill_date DESC, refill_time DESC,
created_at DESC) to support the DISTINCT ON pattern used by the active_canisters
endpoint when fetching the most recent refill per tank.
"""
from alembic import op

revision = '20260617_ln2_log_latest_refill_index'
down_revision = '20260617_kpi_config_add_zone_name'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'idx_ln2_log_tank_latest_refill',
        'canister_ln2_logs',
        ['tank_id', 'refill_date', 'refill_time', 'created_at'],
        postgresql_ops={
            'refill_date': 'DESC NULLS LAST',
            'refill_time': 'DESC NULLS LAST',
            'created_at': 'DESC',
        },
    )


def downgrade():
    op.drop_index('idx_ln2_log_tank_latest_refill', table_name='canister_ln2_logs')
