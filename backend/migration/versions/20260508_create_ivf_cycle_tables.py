"""create ivf_cycle and ivf_cycle_log tables

Revision ID: 20260508_create_ivf_cycle_tables
Revises: 20260506_create_incubators_table
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '20260508_create_ivf_cycle_tables'
down_revision = '20260506_create_incubators_table'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ivf_cycle',
        sa.Column('cycle_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('hospital_id', sa.Integer(), sa.ForeignKey('hospitals.hospital_id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('hospital_branches.branch_id'), nullable=True),
        sa.Column('his_id', sa.String(50), nullable=False),
        sa.Column('patient_name', sa.String(200), nullable=True),
        sa.Column('incubator_id', sa.Integer(), sa.ForeignKey('incubators.incubator_id'), nullable=True),
        sa.Column('chamber_position', sa.String(20), nullable=True),
        sa.Column('injection_method', sa.String(20), nullable=True),
        sa.Column('sperm_quality', sa.String(30), nullable=True),
        sa.Column('oocyte_quality', sa.String(30), nullable=True),
        sa.Column('cycle_type', sa.String(30), nullable=True),
        sa.Column('oocyte_m2', sa.Integer(), nullable=True),
        sa.Column('oocyte_m1', sa.Integer(), nullable=True),
        sa.Column('oocyte_gv', sa.Integer(), nullable=True),
        sa.Column('oocyte_others', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=True),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_ivf_cycle_hospital_id', 'ivf_cycle', ['hospital_id'])
    op.create_index('ix_ivf_cycle_his_id', 'ivf_cycle', ['his_id'])
    op.create_index('ix_ivf_cycle_branch_id', 'ivf_cycle', ['branch_id'])

    op.create_table(
        'ivf_cycle_log',
        sa.Column('log_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('cycle_id', sa.Integer(), sa.ForeignKey('ivf_cycle.cycle_id', ondelete='CASCADE'), nullable=False),
        sa.Column('oocyte_no', sa.Integer(), nullable=False),
        sa.Column('oocyte_comments', sa.Text(), nullable=True),
        # Day 0
        sa.Column('d0_maturity', sa.String(10), nullable=True),
        sa.Column('d0_drop_no', sa.String(20), nullable=True),
        # Day 1
        sa.Column('d1_pn', sa.String(20), nullable=True),
        sa.Column('d1_zygote_status', sa.String(20), nullable=True),
        # Day 3
        sa.Column('d3_drop_no', sa.String(20), nullable=True),
        sa.Column('d3_grade', sa.String(10), nullable=True),
        sa.Column('d3_symmetry', sa.String(30), nullable=True),
        # Day 5
        sa.Column('d5_stage', sa.String(30), nullable=True),
        sa.Column('d5_grade', sa.String(10), nullable=True),
        # Day 6
        sa.Column('d6_stage', sa.String(30), nullable=True),
        sa.Column('d6_grade', sa.String(10), nullable=True),
        sa.Column('d6_progression', sa.String(50), nullable=True),
        # Final
        sa.Column('fate', sa.String(20), nullable=True),
        sa.Column('freeze_no', sa.String(20), nullable=True),
        sa.Column('meta', JSONB(), nullable=True),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('cycle_id', 'oocyte_no', name='uq_ivf_cycle_log_oocyte'),
    )
    op.create_index('ix_ivf_cycle_log_cycle_id', 'ivf_cycle_log', ['cycle_id'])


def downgrade():
    op.drop_table('ivf_cycle_log')
    op.drop_table('ivf_cycle')
