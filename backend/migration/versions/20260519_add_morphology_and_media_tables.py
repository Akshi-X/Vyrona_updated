"""create ivf_oocyte_grade, ivf_oocyte_image, ivf_cycle_report tables

Revision ID: 20260519_add_morphology_and_media_tables
Revises: 20260508_create_ivf_cycle_tables
Branch Labels: None
Depends On: None
"""
from alembic import op
import sqlalchemy as sa

revision = '20260519_add_morphology_and_media_tables'
down_revision = '20260508_create_ivf_cycle_tables'
branch_labels = None
depends_on = None


def upgrade():
    # ── ivf_oocyte_grade ─────────────────────────────────────────────────────
    # Created first — ivf_oocyte_image has a FK into this table.
    op.create_table(
        'ivf_oocyte_grade',
        sa.Column('grade_id',                sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('log_id',                  sa.Integer(), sa.ForeignKey('ivf_cycle_log.log_id',  ondelete='CASCADE'), nullable=False),
        sa.Column('cycle_id',                sa.Integer(), sa.ForeignKey('ivf_cycle.cycle_id',    ondelete='CASCADE'), nullable=False),
        sa.Column('hatching',                sa.String(30), nullable=True),
        sa.Column('vacuolization',           sa.String(30), nullable=True),
        sa.Column('multinucleation',         sa.String(30), nullable=True),
        sa.Column('fragmentation',           sa.String(20), nullable=True),
        sa.Column('symmetry',                sa.String(30), nullable=True),
        sa.Column('zona_pellucida',          sa.String(30), nullable=True),
        sa.Column('blastocoel',              sa.String(30), nullable=True),
        sa.Column('cytoplasmic_granularity', sa.String(30), nullable=True),
        sa.Column('bridge',                  sa.String(30), nullable=True),
        sa.Column('graded_by',               sa.String(50), nullable=True),
        sa.Column('created_at',              sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',              sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_ivf_oocyte_grade_log_id',   'ivf_oocyte_grade', ['log_id'])
    op.create_index('ix_ivf_oocyte_grade_cycle_id', 'ivf_oocyte_grade', ['cycle_id'])

    # ── ivf_oocyte_image ─────────────────────────────────────────────────────
    # Images belong to a grade row; one record per upload session with named slots.
    op.create_table(
        'ivf_oocyte_image',
        sa.Column('image_id',     sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('grade_id',     sa.Integer(), sa.ForeignKey('ivf_oocyte_grade.grade_id', ondelete='CASCADE'), nullable=False),
        sa.Column('cycle_id',     sa.Integer(), sa.ForeignKey('ivf_cycle.cycle_id',        ondelete='CASCADE'), nullable=False),
        sa.Column('day',          sa.Integer(), nullable=True),
        sa.Column('upload_image_url', sa.String(500), nullable=False),
        sa.Column('exp_img_url',      sa.String(500), nullable=True),
        sa.Column('te_img_url',       sa.String(500), nullable=True),
        sa.Column('icm_img_url',      sa.String(500), nullable=True),
        sa.Column('file_name',    sa.String(255), nullable=True),
        sa.Column('file_size',    sa.Integer(), nullable=True),
        sa.Column('uploaded_by',  sa.String(50), nullable=True),
        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_ivf_oocyte_image_grade_id', 'ivf_oocyte_image', ['grade_id'])
    op.create_index('ix_ivf_oocyte_image_cycle_id', 'ivf_oocyte_image', ['cycle_id'])

    # ── ivf_cycle_report ─────────────────────────────────────────────────────
    op.create_table(
        'ivf_cycle_report',
        sa.Column('report_id',    sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('cycle_id',     sa.Integer(), sa.ForeignKey('ivf_cycle.cycle_id', ondelete='CASCADE'), nullable=False),
        sa.Column('report_type',  sa.String(50), nullable=True),
        sa.Column('file_url',     sa.String(500), nullable=False),
        sa.Column('file_name',    sa.String(255), nullable=True),
        sa.Column('file_size',    sa.Integer(), nullable=True),
        sa.Column('generated_by', sa.String(50), nullable=True),
        sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_ivf_cycle_report_cycle_id', 'ivf_cycle_report', ['cycle_id'])


def downgrade():
    op.drop_table('ivf_oocyte_image')   # drop before grade (FK dependency)
    op.drop_table('ivf_oocyte_grade')
    op.drop_table('ivf_cycle_report')
