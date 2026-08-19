"""add override_reason to ivf_oocyte_grade

Revision ID: 20260819_add_override_reason_to_ivf_oocyte_grade
Revises: 20260819_merge_migration_branches_2
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = '20260819_add_override_reason_to_ivf_oocyte_grade'
down_revision = '20260819_merge_migration_branches_2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('override_reason', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('ivf_oocyte_grade', 'override_reason')
