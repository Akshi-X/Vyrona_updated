"""merge refrigerator_devices branch into main head

Revision ID: 20260618_merge_refrig_devices
Revises: 265e93798783, 20260618_refrigerator_devices
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260618_merge_refrig_devices'
down_revision: Union[str, None] = ('265e93798783', '20260618_refrigerator_devices')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
