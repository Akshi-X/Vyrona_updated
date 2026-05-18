"""create chat_read_status_incubator table

Revision ID: 20260508_chat_read_status_incubator
Revises: 20260508_chat_messages_add_incubator
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa

revision = '20260508_chat_read_status_incubator'
down_revision = '20260508_chat_messages_add_incubator'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chat_read_status_incubator',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.user_id'), primary_key=True, nullable=False),
        sa.Column('incubator_id', sa.Integer(), sa.ForeignKey('incubators.incubator_id'), primary_key=True, nullable=False),
        # chamber_id=None means incubator-level (all chambers); mirrors kpi_config convention
        sa.Column('chamber_id', sa.String(255), primary_key=True, nullable=True),
        sa.Column('last_read_message_id', sa.Integer(), sa.ForeignKey('chat_messages.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('chat_read_status_incubator')
