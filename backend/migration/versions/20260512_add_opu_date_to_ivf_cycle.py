"""add opu_date to ivf_cycle

Revision ID: 20260512_add_opu_date_to_ivf_cycle
Revises: 20260508_create_ivf_cycle_tables
Create Date: 2026-05-12

"""
from alembic import op
import sqlalchemy as sa

revision = '20260512_add_opu_date_to_ivf_cycle'
down_revision = '20260508_create_ivf_cycle_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_cycle', sa.Column('opu_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('ivf_cycle', 'opu_date')
