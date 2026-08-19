"""merge migration branches 2

Revision ID: 20260819_merge_migration_branches_2
Revises: 20260727_web_push_notifications, 20260808_cryocan_route
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260819_merge_migration_branches_2'
down_revision: Union[str, None] = ('20260727_web_push_notifications', '20260808_cryocan_route')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
