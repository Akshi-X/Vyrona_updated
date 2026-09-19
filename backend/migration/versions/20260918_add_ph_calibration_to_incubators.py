"""add pH calibration constants to incubators

Revision ID: 20260918_add_ph_calibration_to_incubators
Revises: 20260901_add_blast_grade_to_ivf_cycle_log
Create Date: 2026-09-18

pressure_mmhg and hco3_mm are the two fixed inputs the culture-media pH
derivation (Henderson-Hasselbalch from live CO2%/temperature) needs per
incubator. Both nullable — an incubator without these calibrated yet simply
gets no computed incubator_ph reading, never a defaulted/guessed one.
See telemetry-service/shared/publisher_logic.py compute_incubator_ph().
"""

from alembic import op
import sqlalchemy as sa

revision = '20260918_add_ph_calibration_to_incubators'
down_revision = '20260901_add_blast_grade_to_ivf_cycle_log'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('incubators', sa.Column('pressure_mmhg', sa.Numeric(6, 2), nullable=True,
                   comment="Local atmospheric pressure at the site (mmHg)"))
    op.add_column('incubators', sa.Column('hco3_mm', sa.Numeric(6, 2), nullable=True,
                   comment="Clinic's calibrated bicarbonate constant for the media brand in use (mM)"))


def downgrade():
    op.drop_column('incubators', 'hco3_mm')
    op.drop_column('incubators', 'pressure_mmhg')
