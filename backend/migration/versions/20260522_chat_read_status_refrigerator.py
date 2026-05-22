"""create chat_read_status_refrigerator table

Revision ID: 20260522_chat_read_status_refrigerator
Revises: 20260522_chat_messages_add_refrigerator
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_chat_read_status_refrigerator'
down_revision = '20260522_chat_messages_add_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chat_read_status_refrigerator',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.user_id'), primary_key=True, nullable=False),
        sa.Column('refrigerator_id', sa.Integer(), sa.ForeignKey('refrigerators.refrigerator_id'), primary_key=True, nullable=False),
        # zone_id=None means refrigerator-level (all zones); mirrors kpi_config convention
        sa.Column('zone_id', sa.String(255), primary_key=True, nullable=True),
        sa.Column('last_read_message_id', sa.Integer(), sa.ForeignKey('chat_messages.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('chat_read_status_refrigerator')
