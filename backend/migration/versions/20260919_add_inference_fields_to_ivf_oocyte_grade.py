"""add per-region AI inference text fields to ivf_oocyte_grade

Revision ID: 20260919_add_inference_fields_to_ivf_oocyte_grade
Revises: 20260918_add_ph_calibration_to_incubators
Create Date: 2026-09-19

icm_inference/te_inference/exp_inference hold the grading service's
per-region clinical descriptions, separate from the numeric grade/ai_score.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260919_add_inference_fields_to_ivf_oocyte_grade'
down_revision = '20260918_add_ph_calibration_to_incubators'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('icm_inference', sa.Text(), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('te_inference', sa.Text(), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('exp_inference', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('ivf_oocyte_grade', 'exp_inference')
    op.drop_column('ivf_oocyte_grade', 'te_inference')
    op.drop_column('ivf_oocyte_grade', 'icm_inference')
