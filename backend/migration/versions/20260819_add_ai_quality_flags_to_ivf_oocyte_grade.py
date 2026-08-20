"""add ai_quality_flags to ivf_oocyte_grade

Revision ID: 20260819_add_ai_quality_flags_to_ivf_oocyte_grade
Revises: 20260819_add_ai_grade_to_ivf_oocyte_grade
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260819_add_ai_quality_flags_to_ivf_oocyte_grade'
down_revision = '20260819_add_ai_grade_to_ivf_oocyte_grade'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('ai_quality_flags', postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column('ivf_oocyte_grade', 'ai_quality_flags')
