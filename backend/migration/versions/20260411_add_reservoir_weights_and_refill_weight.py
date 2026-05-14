"""Add max_weight/current_weight to reservoirs and refill_weight to canister_ln2_logs

Revision ID: 20260411_reservoir_weights
Revises: 20260316_hospital_notify_flags
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260411_reservoir_weights"
down_revision = "20260316_hospital_notify_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add LN2 weight tracking columns to reservoirs (default 60 kg)
    op.add_column(
        "reservoirs",
        sa.Column(
            "max_weight",
            sa.Float(),
            nullable=False,
            server_default=sa.text("60"),
        ),
    )
    op.add_column(
        "reservoirs",
        sa.Column(
            "current_weight",
            sa.Float(),
            nullable=False,
            server_default=sa.text("60"),
        ),
    )

    # Add refill weight (kg) to canister LN2 logs
    op.add_column(
        "canister_ln2_logs",
        sa.Column(
            "refill_weight",
            sa.Float(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("canister_ln2_logs", "refill_weight")
    op.drop_column("reservoirs", "current_weight")
    op.drop_column("reservoirs", "max_weight")
