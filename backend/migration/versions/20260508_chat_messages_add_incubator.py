"""chat_messages: add incubator_id and chamber_id columns

Revision ID: 20260508_chat_messages_add_incubator
Revises: 20260508_tasks_add_incubator
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa

revision = '20260508_chat_messages_add_incubator'
down_revision = '20260508_tasks_add_incubator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'chat_messages',
        sa.Column(
            'incubator_id',
            sa.Integer(),
            sa.ForeignKey('incubators.incubator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_chat_messages_incubator_id', 'chat_messages', ['incubator_id'])
    op.add_column('chat_messages', sa.Column('chamber_id', sa.String(255), nullable=True))
    op.create_index(
        'idx_chat_messages_incubator_created',
        'chat_messages',
        ['incubator_id', 'created_at'],
    )


def downgrade():
    op.drop_index('idx_chat_messages_incubator_created', table_name='chat_messages')
    op.drop_column('chat_messages', 'chamber_id')
    op.drop_index('ix_chat_messages_incubator_id', table_name='chat_messages')
    op.drop_column('chat_messages', 'incubator_id')
