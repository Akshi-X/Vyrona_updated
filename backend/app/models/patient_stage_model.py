import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Boolean
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import PatientStage


class PatientStage(Base):
    """Model to store patient stage history"""
    __tablename__ = "process_phase"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Patient Reference (Foreign Key)
    patient_id = Column(String, ForeignKey("patient.id"), nullable=False)
    
    # Stage Information
    stage = Column(SQLEnum(PatientStage, values_callable=lambda obj: [e.value for e in obj]), nullable=False)
    
    # Timing Information
    start_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    end_time = Column(DateTime, nullable=True)  # Null for active stages
    
    # Status Information
    is_active = Column(Boolean, default=False, nullable=False)  # Only one stage per patient should be active
    is_success = Column(Boolean, nullable=True)  # Null for active stages, True/False for completed stages
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    patient = relationship("Patient", back_populates="stage_history")
