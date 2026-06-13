"""create refrigerators table

Revision ID: 20260522_create_refrigerators_table
Revises: 20260512_critical_alerts_ack_fields
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_create_refrigerators_table'
down_revision = '20260512_critical_alerts_ack_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refrigerators',
        sa.Column('refrigerator_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('hospital_id', sa.Integer(), sa.ForeignKey('hospitals.hospital_id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('hospital_branches.branch_id'), nullable=False),
        sa.Column('refrigerator_code', sa.String(255), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True, comment='External device/system identifier'),
        sa.Column('type', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.UniqueConstraint('refrigerator_code', 'branch_id', name='uq_refrigerators_code_branch'),
    )
    op.create_index('ix_refrigerators_refrigerator_id', 'refrigerators', ['refrigerator_id'])


def downgrade():
    op.drop_index('ix_refrigerators_refrigerator_id', table_name='refrigerators')
    op.drop_table('refrigerators')
