"""add blast_grade to ivf_cycle_log

Revision ID: 20260901_add_blast_grade_to_ivf_cycle_log
Revises: 20260825_incubator_raw_data
Create Date: 2026-09-01

ivf_cycle_log.blast_grade is used by the current model but was missing from
this table (legacy d5_grade/d6_grade columns from before the split-to-single
blast grade change were left in place instead). Add-only: it does not drop
d5_grade/d6_grade, unlike 20260520_replace_d5d6_grade_with_grade, which
covers that separately and was never applied here.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260901_add_blast_grade_to_ivf_cycle_log'
down_revision = '20260825_incubator_raw_data'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_cycle_log', sa.Column('blast_grade', sa.String(10), nullable=True))


def downgrade():
    op.drop_column('ivf_cycle_log', 'blast_grade')
