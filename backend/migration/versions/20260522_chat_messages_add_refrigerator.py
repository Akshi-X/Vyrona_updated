"""chat_messages: add refrigerator_id and zone_id columns

Revision ID: 20260522_chat_messages_add_refrigerator
Revises: 20260522_tasks_add_refrigerator
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_chat_messages_add_refrigerator'
down_revision = '20260522_tasks_add_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'chat_messages',
        sa.Column(
            'refrigerator_id',
            sa.Integer(),
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_chat_messages_refrigerator_id', 'chat_messages', ['refrigerator_id'])
    op.add_column('chat_messages', sa.Column('zone_id', sa.String(255), nullable=True))
    op.create_index(
        'idx_chat_messages_refrigerator_created',
        'chat_messages',
        ['refrigerator_id', 'created_at'],
    )


def downgrade():
    op.drop_index('idx_chat_messages_refrigerator_created', table_name='chat_messages')
    op.drop_column('chat_messages', 'zone_id')
    op.drop_index('ix_chat_messages_refrigerator_id', table_name='chat_messages')
    op.drop_column('chat_messages', 'refrigerator_id')
