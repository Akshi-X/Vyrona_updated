"""remove zone concept from refrigerator tracking

Revision ID: 20260525_remove_zone_from_refrigerator
Revises: 20260522_chat_read_status_refrigerator
Create Date: 2026-05-25

Refrigerators have no zone concept (unlike incubators with chambers).
This migration:
  1. Drops and recreates chat_read_status_refrigerator without zone_id in the PK.
  2. Clears zone_id for all refrigerator rows in shared tables.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260525_remove_zone_from_refrigerator'
down_revision = '20260522_chat_read_status_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Recreate chat_read_status_refrigerator without zone_id
    op.drop_table('chat_read_status_refrigerator')
    op.create_table(
        'chat_read_status_refrigerator',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.user_id'), primary_key=True, nullable=False),
        sa.Column('refrigerator_id', sa.Integer(), sa.ForeignKey('refrigerators.refrigerator_id'), primary_key=True, nullable=False),
        sa.Column('last_read_message_id', sa.Integer(), sa.ForeignKey('chat_messages.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    # 2. Clear zone_id for all refrigerator rows in shared tables
    op.execute("UPDATE readings SET zone_id = NULL WHERE refrigerator_id IS NOT NULL")
    op.execute("UPDATE kpi_config SET zone_id = NULL WHERE refrigerator_id IS NOT NULL")
    op.execute("UPDATE chat_messages SET zone_id = NULL WHERE refrigerator_id IS NOT NULL")
    op.execute("UPDATE critical_alerts SET zone_id = NULL WHERE refrigerator_id IS NOT NULL")
    op.execute("UPDATE tasks SET zone_id = NULL WHERE refrigerator_id IS NOT NULL")


def downgrade():
    op.drop_table('chat_read_status_refrigerator')
    op.create_table(
        'chat_read_status_refrigerator',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.user_id'), primary_key=True, nullable=False),
        sa.Column('refrigerator_id', sa.Integer(), sa.ForeignKey('refrigerators.refrigerator_id'), primary_key=True, nullable=False),
        sa.Column('zone_id', sa.String(255), primary_key=True, nullable=True),
        sa.Column('last_read_message_id', sa.Integer(), sa.ForeignKey('chat_messages.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
