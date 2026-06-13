"""drop fragmentation and symmetry from ivf_oocyte_grade

These are derivable from d3_grade / d3_symmetry on ivf_cycle_log.

Revision ID: 20260520_drop_grade_fragmentation_symmetry
Revises: 20260520_replace_d5d6_grade_with_grade
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa

revision = "20260520_drop_grade_fragmentation_symmetry"
down_revision = "20260520_replace_d5d6_grade_with_grade"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("ivf_oocyte_grade") as batch_op:
        batch_op.drop_column("fragmentation")
        batch_op.drop_column("symmetry")


def downgrade():
    with op.batch_alter_table("ivf_oocyte_grade") as batch_op:
        batch_op.add_column(sa.Column("fragmentation", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("symmetry",      sa.String(30), nullable=True))
