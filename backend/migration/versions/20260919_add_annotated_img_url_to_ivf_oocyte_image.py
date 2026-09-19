"""add annotated_img_url to ivf_oocyte_image

Revision ID: 20260919_add_annotated_img_url_to_ivf_oocyte_image
Revises: 20260919_add_inference_fields_to_ivf_oocyte_grade
Create Date: 2026-09-19

"""

from alembic import op
import sqlalchemy as sa

revision = '20260919_add_annotated_img_url_to_ivf_oocyte_image'
down_revision = '20260919_add_inference_fields_to_ivf_oocyte_grade'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('ivf_oocyte_image', sa.Column('annotated_img_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('ivf_oocyte_image', 'annotated_img_url')
