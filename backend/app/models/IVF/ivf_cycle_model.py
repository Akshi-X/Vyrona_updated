from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ...config.database import Base


class IvfCycle(Base):
    __tablename__ = "ivf_cycle"

    cycle_id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=True, index=True)
    his_id = Column(String(50), nullable=False, index=True)
    patient_name = Column(String(200), nullable=True)
    incubator_id = Column(Integer, ForeignKey("incubators.incubator_id"), nullable=True)
    chamber_position = Column(String(20), nullable=True)
    injection_method = Column(String(20), nullable=True)
    sperm_quality = Column(String(30), nullable=True)
    oocyte_quality = Column(String(30), nullable=True)
    cycle_type = Column(String(30), nullable=True)
    oocyte_m2 = Column(Integer, nullable=True)
    oocyte_m1 = Column(Integer, nullable=True)
    oocyte_gv = Column(Integer, nullable=True)
    oocyte_others = Column(Integer, nullable=True)
    status = Column(String(30), nullable=True)
    created_by = Column(String(50), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    logs = relationship("IvfCycleLog", back_populates="cycle", cascade="all, delete-orphan")
