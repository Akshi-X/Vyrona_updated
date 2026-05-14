"""Create ln2_refill_detections table

Revision ID: 20260411_ln2_refill_detections
Revises: 20260411_reservoir_weights
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260411_ln2_refill_detections"
down_revision = "20260411_reservoir_weights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ln2_refill_detections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "tank_id",
            sa.Integer(),
            sa.ForeignKey("tanks.tank_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "hospital_id",
            sa.Integer(),
            sa.ForeignKey("hospitals.hospital_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "branch_id",
            sa.Integer(),
            sa.ForeignKey("hospital_branches.branch_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refill_weight", sa.Numeric(12, 4), nullable=False),
        sa.Column("is_confirmed", sa.Boolean(), nullable=True, default=None),
        sa.Column("acknowledged_by", sa.String(255), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("idx_refill_det_tank_detected", "ln2_refill_detections", ["tank_id", "detected_at"])
    op.create_index("idx_refill_det_branch_detected", "ln2_refill_detections", ["branch_id", "detected_at"])
    op.create_index("idx_refill_det_confirmed", "ln2_refill_detections", ["is_confirmed"])
    op.create_index("idx_refill_det_hospital", "ln2_refill_detections", ["hospital_id"])


def downgrade() -> None:
    op.drop_index("idx_refill_det_hospital", table_name="ln2_refill_detections")
    op.drop_index("idx_refill_det_confirmed", table_name="ln2_refill_detections")
    op.drop_index("idx_refill_det_branch_detected", table_name="ln2_refill_detections")
    op.drop_index("idx_refill_det_tank_detected", table_name="ln2_refill_detections")
    op.drop_table("ln2_refill_detections")
