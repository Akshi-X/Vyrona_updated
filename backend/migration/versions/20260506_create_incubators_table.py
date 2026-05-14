"""create incubators table and remove is_incubator from tanks

Revision ID: 20260506_create_incubators_table
Revises: 20260504_add_is_incubator_to_tanks
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = '20260506_create_incubators_table'
down_revision = '20260504_add_is_incubator_to_tanks'
branch_labels = None
depends_on = None


def upgrade():
    # Create the dedicated incubators table
    op.create_table(
        'incubators',
        sa.Column('incubator_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('hospital_id', sa.Integer(), sa.ForeignKey('hospitals.hospital_id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('hospital_branches.branch_id'), nullable=False),
        sa.Column('incubator_code', sa.String(255), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True, comment='External device/system identifier'),
        sa.Column('type', sa.String(255), nullable=True),
        sa.Column('chamber_r', sa.Integer(), nullable=True),
        sa.Column('chamber_c', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.UniqueConstraint('incubator_code', 'branch_id', name='uq_incubators_code_branch'),
    )
    op.create_index('ix_incubators_incubator_id', 'incubators', ['incubator_id'])

    # Migrate existing incubator rows from tanks → incubators
    op.execute("""
        INSERT INTO incubators (
            hospital_id, branch_id, incubator_code,
            external_id, is_active,
            created_at, updated_at, created_by, updated_by
        )
        SELECT
            hb.hospital_id, t.branch_id, t.tank_code,
            t.tank_id_arc, t.is_active,
            t.created_at, t.updated_at, t.created_by, t.updated_by
        FROM tanks t
        JOIN hospital_branches hb ON hb.branch_id = t.branch_id
        WHERE t.is_incubator = TRUE
    """)

    # Drop the is_incubator column from tanks
    op.drop_column('tanks', 'is_incubator')


def downgrade():
    # Re-add is_incubator column to tanks
    op.add_column(
        'tanks',
        sa.Column('is_incubator', sa.Boolean(), nullable=False, server_default=sa.false())
    )

    # Restore incubator rows back into tanks (best-effort; no status/capacity to restore)
    op.execute("""
        INSERT INTO tanks (
            branch_id, tank_code, tank_id_arc,
            is_active, is_incubator,
            created_at, updated_at, created_by, updated_by
        )
        SELECT
            branch_id, incubator_code, external_id,
            is_active, TRUE,
            created_at, updated_at, created_by, updated_by
        FROM incubators
    """)

    # Drop the incubators table
    op.drop_index('ix_incubators_incubator_id', table_name='incubators')
    op.drop_table('incubators')
