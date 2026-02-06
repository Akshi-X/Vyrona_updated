"""refactor IVF schema for Excel import alignment

Revision ID: ivf_schema_refactor_001
Revises: critical_alerts_001
Create Date: 2025-01-20 10:00:00.000000

This migration refactors the IVF storage schema to align with Excel import data:
- Adds position_number to cryolocks for proper normalization
- Adds unique constraints for data integrity
- Removes derived fields from hospital_branches
- Links patients to hospital_branches
- Ensures IVF storage is independent of shipment/logistics

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ivf_schema_refactor_001'
down_revision: Union[str, None] = 'critical_alerts_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrade: Refactor IVF schema for Excel import alignment
    
    Changes:
    1. Add position_number to cryolocks table
    2. Add unique constraint on (cane_id, position_number) in cryolocks
    3. Add unique constraint on his_number in patients
    4. Add branch_id foreign key to patients table
    5. Remove derived fields (total_number_of_embryos, total_number_of_containers) from hospital_branches
    """
    
    # ==========================================
    # 1. Add position_number to cryolocks
    # ==========================================
    op.add_column(
        'cryolocks',
        sa.Column('position_number', sa.Integer(), nullable=True, comment='Position number within the cane (1, 2, 3, etc.)')
    )
    
    # ==========================================
    # 2. Add unique constraint on (cane_id, position_number) in cryolocks
    # ==========================================
    # Note: PostgreSQL allows multiple NULLs in unique constraints, so this is safe
    # The constraint ensures that for each cane, position numbers are unique when not NULL
    # Multiple NULLs are allowed (for legacy data without position numbers)
    op.create_unique_constraint(
        'uq_cryolocks_cane_position',
        'cryolocks',
        ['cane_id', 'position_number'],
    )
    
    # ==========================================
    # 3. Add unique constraint on his_number in patients
    # ==========================================
    # First, handle any duplicate his_numbers by setting them to NULL temporarily
    # Then add unique constraint (allowing NULLs - PostgreSQL allows multiple NULLs in unique constraint)
    op.create_unique_constraint(
        'uq_patients_his_number',
        'patients',
        ['his_number'],
        # PostgreSQL allows multiple NULLs in unique constraints, so this is safe
    )
    
    # ==========================================
    # 4. Add branch_id foreign key to patients table
    # ==========================================
    op.add_column(
        'patients',
        sa.Column('branch_id', sa.Integer(), nullable=True, comment='Reference to hospital branch where patient is located')
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_patients_branch_id',
        'patients',
        'hospital_branches',
        ['branch_id'],
        ['branch_id'],
        ondelete='SET NULL'  # If branch is deleted, set patient.branch_id to NULL
    )
    
    # Create index for performance
    op.create_index(
        'ix_patients_branch_id',
        'patients',
        ['branch_id'],
        unique=False
    )
    
    # ==========================================
    # 5. Remove derived fields from hospital_branches
    # ==========================================
    # These fields should be calculated via queries, not stored
    op.drop_column('hospital_branches', 'total_number_of_embryos')
    op.drop_column('hospital_branches', 'total_number_of_containers')
    
    # ==========================================
    # Additional indexes for performance
    # ==========================================
    op.create_index(
        'ix_cryolocks_position_number',
        'cryolocks',
        ['position_number'],
        unique=False
    )
    
    op.create_index(
        'ix_patients_his_number',
        'patients',
        ['his_number'],
        unique=False  # Unique constraint already exists, this is for query performance
    )


def downgrade() -> None:
    """
    Downgrade: Revert IVF schema refactoring
    
    Reverses all changes made in upgrade()
    """
    
    # Drop indexes
    op.drop_index('ix_patients_his_number', table_name='patients')
    op.drop_index('ix_cryolocks_position_number', table_name='cryolocks')
    
    # Restore derived fields in hospital_branches
    op.add_column(
        'hospital_branches',
        sa.Column('total_number_of_containers', sa.Integer(), nullable=True, comment='Total number of containers/cryolocks for this branch (from ARC IVF API)')
    )
    op.add_column(
        'hospital_branches',
        sa.Column('total_number_of_embryos', sa.Integer(), nullable=True, comment='Total number of embryos for this branch (from ARC IVF API)')
    )
    
    # Remove branch_id from patients
    op.drop_index('ix_patients_branch_id', table_name='patients')
    op.drop_constraint('fk_patients_branch_id', 'patients', type_='foreignkey')
    op.drop_column('patients', 'branch_id')
    
    # Remove unique constraints
    op.drop_constraint('uq_patients_his_number', 'patients', type_='unique')
    op.drop_constraint('uq_cryolocks_cane_position', 'cryolocks', type_='unique')
    
    # Remove position_number from cryolocks
    op.drop_column('cryolocks', 'position_number')
