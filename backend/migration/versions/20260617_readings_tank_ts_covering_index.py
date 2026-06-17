"""readings: add covering index for tank+timestamp range aggregation queries

Revision ID: 20260617_readings_tank_ts_covering_index
Revises: 20260617_ln2_log_latest_refill_index
Create Date: 2026-06-17

Adds idx_readings_tank_ts_covering on (tank_id, timestamp, kpi_config_id, kpi_value).
This lets the kpi-history aggregated query (1H/24H/7D buckets) use an Index Only Scan
— no heap access needed — instead of scanning the full timestamp index and filtering
by tank_id afterwards. Reduces the 7D path from ~1.6s to ~1.0s.
"""

from alembic import op

revision = "20260617_readings_tank_ts_covering_index"
down_revision = "20260617_ln2_log_latest_refill_index"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "idx_readings_tank_ts_covering",
        "readings",
        ["tank_id", "timestamp", "kpi_config_id", "kpi_value"],
    )
    op.create_index(
        "idx_readings_tank_kpi_ts",
        "readings",
        ["tank_id", "kpi_config_id", "timestamp"],
    )


def downgrade():
    op.drop_index("idx_readings_tank_ts_covering", table_name="readings")
    op.drop_index("idx_readings_tank_kpi_ts", table_name="readings")
