"""Create ui_route_variants table

Revision ID: 20240615_ui_variants
Revises:
Create Date: 2024-06-15

This migration creates the ui_route_variants table for storing
hospital-specific UI component mappings. Each hospital can have
custom UI components for specific routes.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20240615_ui_variants"
down_revision = None  # Update this to the previous migration if exists
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create ui_route_variants table."""
    op.create_table(
        "ui_route_variants",
        # Primary key
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        # Hospital association
        sa.Column(
            "hospital_id",
            sa.Integer(),
            sa.ForeignKey("hospitals.hospital_id", ondelete="CASCADE"),
            nullable=False,
            comment="The hospital this variant belongs to",
        ),
        # Route and component mapping
        sa.Column(
            "route_path",
            sa.String(255),
            nullable=False,
            comment="Route path pattern (e.g., '/dashboard', '/track/:patientId')",
        ),
        sa.Column(
            "component_key",
            sa.String(255),
            nullable=False,
            comment="Key to look up component in frontend registry (e.g., 'DashboardHospital2')",
        ),
        # Status
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether this variant is currently active",
        ),
        # Metadata
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
            comment="Description of why this variant exists and what it does",
        ),
        # Audit fields
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="When this variant was created",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
            comment="When this variant was last updated",
        ),
        # Primary key constraint
        sa.PrimaryKeyConstraint("id"),
        # Unique constraint: each hospital can only have one variant per route
        sa.UniqueConstraint(
            "hospital_id", "route_path", name="uq_hospital_route_variant"
        ),
        comment="Stores hospital-specific UI component variant mappings",
    )

    # Create indexes for better query performance
    op.create_index(
        "ix_ui_route_variants_hospital_id",
        "ui_route_variants",
        ["hospital_id"],
    )
    op.create_index(
        "ix_ui_route_variants_hospital_active",
        "ui_route_variants",
        ["hospital_id", "is_active"],
    )
    op.create_index(
        "ix_ui_route_variants_component_key",
        "ui_route_variants",
        ["component_key"],
    )


def downgrade() -> None:
    """Drop ui_route_variants table."""
    # Drop indexes first
    op.drop_index("ix_ui_route_variants_component_key", table_name="ui_route_variants")
    op.drop_index(
        "ix_ui_route_variants_hospital_active", table_name="ui_route_variants"
    )
    op.drop_index("ix_ui_route_variants_hospital_id", table_name="ui_route_variants")

    # Drop the table
    op.drop_table("ui_route_variants")
