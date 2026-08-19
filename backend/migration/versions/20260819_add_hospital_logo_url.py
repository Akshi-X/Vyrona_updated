"""Add hospital logo_url column for report branding

Revision ID: 20260819_hospital_logo_url
Revises: 20260808_cryocan_route
Create Date: 2026-08-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260819_hospital_logo_url"
down_revision = "20260808_cryocan_route"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hospitals",
        sa.Column("logo_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("hospitals", "logo_url")
