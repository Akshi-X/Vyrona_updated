"""tasks: add refrigerator_id and zone_id columns

Revision ID: 20260522_tasks_add_refrigerator
Revises: 20260522_readings_add_refrigerator
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = '20260522_tasks_add_refrigerator'
down_revision = '20260522_readings_add_refrigerator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'tasks',
        sa.Column(
            'refrigerator_id',
            sa.Integer(),
            sa.ForeignKey('refrigerators.refrigerator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_tasks_refrigerator_id', 'tasks', ['refrigerator_id'])
    op.add_column('tasks', sa.Column('zone_id', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('tasks', 'zone_id')
    op.drop_index('ix_tasks_refrigerator_id', table_name='tasks')
    op.drop_column('tasks', 'refrigerator_id')
