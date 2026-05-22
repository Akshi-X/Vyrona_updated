from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfCycleLog(Base):
    __tablename__ = "ivf_cycle_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    cycle_id = Column(Integer, ForeignKey("ivf_cycle.cycle_id", ondelete="CASCADE"), nullable=False, index=True)
    oocyte_no = Column(Integer, nullable=False)
    oocyte_comments = Column(Text, nullable=True)

    # Day 0 — Fertilization
    d0_maturity = Column(String(10), nullable=True)       # MII, MI, GV
    d0_drop_no = Column(String(20), nullable=True)

    # Day 1 — PN Check
    d1_pn = Column(String(20), nullable=True)             # 2PN, 1PN, 3PN, 0PN, Degenerated
    d1_zygote_status = Column(String(20), nullable=True)  # Normal, Abnormal

    # Day 3 — Cleavage
    d3_drop_no = Column(String(20), nullable=True)
    d3_grade = Column(String(10), nullable=True)          # e.g. 8C1
    d3_symmetry = Column(String(30), nullable=True)

    # Day 5 — Blastocyst
    d5_stage = Column(String(30), nullable=True)          # Cleavage, Morula, Early Blast, Blastocyst

    # Day 6 — Late Blast
    d6_stage = Column(String(30), nullable=True)
    d6_progression = Column(String(50), nullable=True)

    # Final blastocyst grade — updated whenever a grade is recorded (D5 or D6)
    blast_grade = Column(String(10), nullable=True)       # e.g. 4AA

    # Final
    fate = Column(String(20), nullable=True)              # Freeze, Transfer, Discard
    freeze_no = Column(String(20), nullable=True)

    # All per-day notes and extra fields
    meta = Column(JSONB, nullable=True)

    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    cycle      = relationship("IvfCycle",           back_populates="logs")
    grades = relationship("IvfOocyteGrade", back_populates="log", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("cycle_id", "oocyte_no", name="uq_ivf_cycle_log_oocyte"),
    )
