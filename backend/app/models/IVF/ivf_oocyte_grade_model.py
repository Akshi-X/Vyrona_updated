from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfOocyteGrade(Base):
    __tablename__ = "ivf_oocyte_grade"

    grade_id = Column(Integer, primary_key=True, autoincrement=True)
    log_id = Column(Integer, ForeignKey("ivf_cycle_log.log_id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("ivf_cycle.cycle_id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_best = Column(Boolean, default=False, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    grade = Column(String(10), nullable=True)
    # Backfilled once, on the first human override (see IvfCycleService.update_grade) —
    # `grade` itself gets overwritten on override, this is the permanent record
    # of what the AI originally said.
    ai_grade = Column(String(10), nullable=True)
    ai_score = Column(Float, nullable=True)
    hatching = Column(String(50), nullable=True)
    vacuolization = Column(String(50), nullable=True)
    multinucleation = Column(String(50), nullable=True)
    # Free-text descriptions from the grading service, not short enum-ish labels
    zona_pellucida = Column(Text, nullable=True)
    blastocoel = Column(Text, nullable=True)
    cytoplasmic_granularity = Column(String(50), nullable=True)
    bridge = Column(String(50), nullable=True)
    note = Column(Text, nullable=True)
    override_reason = Column(Text, nullable=True)  # why a human changed the AI-generated grade
    # Per-region clinical descriptions returned by the grading service
    icm_inference = Column(Text, nullable=True)
    te_inference = Column(Text, nullable=True)
    exp_inference = Column(Text, nullable=True)
    graded_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    log    = relationship("IvfCycleLog",    back_populates="grades")
    images = relationship("IvfOocyteImage", back_populates="grade", cascade="all, delete-orphan")
