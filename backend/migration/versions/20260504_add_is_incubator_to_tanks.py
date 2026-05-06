"""add is_incubator to tanks

Revision ID: 20260504_add_is_incubator_to_tanks
Revises: 20260425_add_onboarding_completed_to_users
Create Date: 2026-05-04

"""
from alembic import op
import sqlalchemy as sa

revision = '20260504_add_is_incubator_to_tanks'
down_revision = '20260425_add_onboarding_completed_to_users'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'tanks',
        sa.Column('is_incubator', sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade():
    op.drop_column('tanks', 'is_incubator')
