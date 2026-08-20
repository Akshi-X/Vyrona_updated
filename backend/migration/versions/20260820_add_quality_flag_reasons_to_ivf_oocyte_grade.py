"""add quality_flag_reasons to ivf_oocyte_grade

Revision ID: 20260820_add_quality_flag_reasons_to_ivf_oocyte_grade
Revises: 20260820_consolidate_quality_flags_to_json
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260820_add_quality_flag_reasons_to_ivf_oocyte_grade'
down_revision = '20260820_consolidate_quality_flags_to_json'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('quality_flag_reasons', postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column('ivf_oocyte_grade', 'quality_flag_reasons')
