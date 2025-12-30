from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    # Primary Key
    hospital_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Hospital Information
    hospital_name = Column(String(255), nullable=False)
    hospital_type = Column(String(10), nullable=True)
    hospital_head_email = Column(String(10), nullable=True)
    
    # Relationships
    branches = relationship("HospitalBranch", back_populates="hospital", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

