"""tasks: add incubator_id and chamber_id columns

Revision ID: 20260508_tasks_add_incubator
Revises: 20260506_readings_add_incubator
Create Date: 2026-05-08

"""
from alembic import op
import sqlalchemy as sa

revision = '20260508_tasks_add_incubator'
down_revision = '20260506_readings_add_incubator'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'tasks',
        sa.Column(
            'incubator_id',
            sa.Integer(),
            sa.ForeignKey('incubators.incubator_id', ondelete='SET NULL'),
            nullable=True,
        )
    )
    op.create_index('ix_tasks_incubator_id', 'tasks', ['incubator_id'])
    op.add_column('tasks', sa.Column('chamber_id', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('tasks', 'chamber_id')
    op.drop_index('ix_tasks_incubator_id', table_name='tasks')
    op.drop_column('tasks', 'incubator_id')
