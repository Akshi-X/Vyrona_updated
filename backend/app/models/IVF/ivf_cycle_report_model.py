from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfCycleReport(Base):
    __tablename__ = "ivf_cycle_report"

    report_id   = Column(Integer, primary_key=True, autoincrement=True)
    cycle_id    = Column(Integer, ForeignKey("ivf_cycle.cycle_id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(50), nullable=True)    # e.g. "cycle_report", "grading_summary"
    file_url    = Column(String(500), nullable=False)  # served via /uploads/ivf/reports/...
    file_name   = Column(String(255), nullable=True)   # original or generated filename
    file_size   = Column(Integer, nullable=True)       # bytes
    generated_by = Column(String(50), nullable=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    cycle = relationship("IvfCycle", back_populates="reports")
