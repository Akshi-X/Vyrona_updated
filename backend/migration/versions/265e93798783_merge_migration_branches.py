"""merge migration branches

Revision ID: 265e93798783
Revises: 20260502_add_kpi_escalation_fields, 20260520_replace_d5d6_grade_with_grade, 20260522_critical_alerts_add_refrigerator, 20260617_readings_tank_ts_covering_index, 20260618_refrigerator_add_zone_count
Create Date: 2026-06-18 09:20:44.012357

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '265e93798783'
down_revision: Union[str, None] = ('20260502_add_kpi_escalation_fields', '20260520_replace_d5d6_grade_with_grade', '20260522_critical_alerts_add_refrigerator', '20260617_readings_tank_ts_covering_index', '20260618_refrigerator_add_zone_count')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

