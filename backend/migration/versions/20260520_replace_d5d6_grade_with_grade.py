"""replace d5_grade and d6_grade with single grade column on ivf_cycle_log

Revision ID: 20260520_replace_d5d6_grade_with_grade
Revises: 20260525_create_ivf_grade_image_report_tables
Branch Labels: None
Depends On: None
"""
from alembic import op
import sqlalchemy as sa

revision = '20260520_replace_d5d6_grade_with_grade'
down_revision = '20260525_create_ivf_grade_image_report_tables'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ivf_cycle_log') as batch_op:
        batch_op.drop_column('d5_grade')
        batch_op.drop_column('d6_grade')
        batch_op.add_column(sa.Column('blast_grade', sa.String(10), nullable=True))


def downgrade():
    with op.batch_alter_table('ivf_cycle_log') as batch_op:
        batch_op.drop_column('blast_grade')
        batch_op.add_column(sa.Column('d5_grade', sa.String(10), nullable=True))
        batch_op.add_column(sa.Column('d6_grade', sa.String(10), nullable=True))
