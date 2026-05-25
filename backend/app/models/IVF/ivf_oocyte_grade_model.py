from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Numeric, Text, Boolean
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfOocyteGrade(Base):
    __tablename__ = "ivf_oocyte_grade"

    grade_id = Column(Integer, primary_key=True, autoincrement=True)
    log_id   = Column(Integer, ForeignKey("ivf_cycle_log.log_id",      ondelete="CASCADE"),  nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("ivf_cycle.cycle_id",         ondelete="CASCADE"),  nullable=False, index=True)

    # Grade result
    grade    = Column(String(10),      nullable=True)             # e.g. 4AA, 4AB, 3BB
    ai_score = Column(Numeric(5, 2),   nullable=True)             # 0.00 – 10.00

    # Quality flags
    hatching                = Column(String(30), nullable=True)   # Not Hatching | Hatching | Partially Hatching
    vacuolization           = Column(String(30), nullable=True)   # None | Mild | Moderate | Severe
    multinucleation         = Column(String(30), nullable=True)   # None | Minimal | Present

    # Morphology metrics
    zona_pellucida          = Column(String(30), nullable=True)   # Intact | Good | Thinning
    blastocoel              = Column(String(30), nullable=True)   # Excellent | Good | Fair | Poor
    cytoplasmic_granularity = Column(String(30), nullable=True)   # Fine | Coarse
    bridge                  = Column(String(30), nullable=True)   # None | Minimal | Present

    stage        = Column(Integer,     nullable=True)   # wizard step: 1=upload, 2=select-best, 3=result
    is_active    = Column(Boolean,     nullable=False, default=True)   # False = soft-deleted by user
    is_best      = Column(Boolean,     nullable=False, default=False)  # selected in Select Best Grade step
    is_completed = Column(Boolean,     nullable=False, default=False)
    note         = Column(Text,        nullable=True)

    graded_by  = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    log    = relationship("IvfCycleLog",    back_populates="grades")
    images = relationship("IvfOocyteImage", back_populates="grade", cascade="all, delete-orphan")
