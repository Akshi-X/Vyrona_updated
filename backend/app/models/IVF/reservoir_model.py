from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship

from ...config.database import Base


class Reservoir(Base):
    __tablename__ = "reservoirs"

    # Primary Key
    reservoir_id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Reservoir Information
    reservoir_name = Column(String(255), nullable=False, comment="Reservoir name")

    # LN2 weight tracking (kg)
    max_weight = Column(Float, nullable=False, default=60.0, server_default="60", comment="Maximum LN2 capacity in kg")
    current_weight = Column(Float, nullable=False, default=60.0, server_default="60", comment="Current LN2 weight in kg")

    # Foreign Keys
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=True, index=True)

    # Relationships
    logs = relationship("ReservoirLog", back_populates="reservoir", cascade="all, delete-orphan")

    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
