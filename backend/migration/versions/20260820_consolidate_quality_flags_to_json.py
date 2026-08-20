"""consolidate the quality-flag columns into one quality_flags jsonb column

Revision ID: 20260820_consolidate_quality_flags_to_json
Revises: 20260819_add_ai_quality_flags_to_ivf_oocyte_grade
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260820_consolidate_quality_flags_to_json'
down_revision = '20260819_add_ai_quality_flags_to_ivf_oocyte_grade'
branch_labels = None
depends_on = None

# vacuolization, multinucleation, cytoplasmic_granularity are dropped outright,
# not carried into quality_flags — nothing in the app ever read or wrote them.
DROPPED_FIELDS = ["hatching", "vacuolization", "multinucleation", "zona_pellucida",
                   "blastocoel", "cytoplasmic_granularity", "bridge"]


def upgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('quality_flags', postgresql.JSONB(), nullable=True))

    # Backfill quality_flags from the columns worth keeping, before dropping them all.
    op.execute("""
        UPDATE ivf_oocyte_grade
        SET quality_flags = jsonb_build_object(
            'hatching', hatching,
            'zona_pellucida', zona_pellucida,
            'blastocoel', blastocoel,
            'bridge', bridge,
            'blackspot', NULL,
            'early_blast', NULL
        )
        WHERE hatching IS NOT NULL OR zona_pellucida IS NOT NULL
           OR blastocoel IS NOT NULL OR bridge IS NOT NULL
    """)

    for field in DROPPED_FIELDS:
        op.drop_column('ivf_oocyte_grade', field)


def downgrade():
    op.add_column('ivf_oocyte_grade', sa.Column('hatching', sa.String(length=50), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('vacuolization', sa.String(length=50), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('multinucleation', sa.String(length=50), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('zona_pellucida', sa.Text(), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('blastocoel', sa.Text(), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('cytoplasmic_granularity', sa.String(length=50), nullable=True))
    op.add_column('ivf_oocyte_grade', sa.Column('bridge', sa.String(length=50), nullable=True))

    op.execute("""
        UPDATE ivf_oocyte_grade
        SET hatching = quality_flags->>'hatching',
            zona_pellucida = quality_flags->>'zona_pellucida',
            blastocoel = quality_flags->>'blastocoel',
            bridge = quality_flags->>'bridge'
        WHERE quality_flags IS NOT NULL
    """)

    op.drop_column('ivf_oocyte_grade', 'quality_flags')
