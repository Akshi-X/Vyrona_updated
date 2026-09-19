"""create ml_jobs table

Revision ID: 20260919_create_ml_jobs
Revises: 20260919_add_annotated_img_url_to_ivf_oocyte_image
Create Date: 2026-09-19

Tracks embryo analysis jobs created and advanced by the grading-service
Azure Functions app; the backend reads rows here to resolve a job that
finished before the SSE client subscribed (see app/models/IVF/ml_job_model.py).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260919_create_ml_jobs'
down_revision = '20260919_add_annotated_img_url_to_ivf_oocyte_image'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ml_jobs',
        sa.Column('job_id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('kind', sa.String(32), nullable=False),
        sa.Column('input_image_id', sa.Text(), nullable=False),
        sa.Column('status', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('output', postgresql.JSONB(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
                   onupdate=sa.func.now()),
    )


def downgrade():
    op.drop_table('ml_jobs')
