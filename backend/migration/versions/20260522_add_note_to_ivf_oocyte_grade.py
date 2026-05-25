"""add stage and note columns to ivf_oocyte_grade

Revision ID: 20260522_add_note_to_ivf_oocyte_grade
Revises: 20260520_replace_d5d6_grade_with_grade
Branch Labels: None
Depends On: None
"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_add_note_to_ivf_oocyte_grade'
down_revision = '20260520_replace_d5d6_grade_with_grade'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ivf_oocyte_grade') as batch_op:
        batch_op.add_column(sa.Column('stage',        sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('is_best',      sa.Boolean(), nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('is_completed', sa.Boolean(), nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('note',         sa.Text(),    nullable=True))


def downgrade():
    with op.batch_alter_table('ivf_oocyte_grade') as batch_op:
        batch_op.drop_column('note')
        batch_op.drop_column('is_completed')
        batch_op.drop_column('is_best')
        batch_op.drop_column('stage')
