import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, LargeBinary, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class Patient(Base):
    __tablename__ = "patient"

    # Primary Key
    id = Column(String, primary_key=True, index=True)
    
    # Patient Information
    patient_name = Column(String, nullable=False)
    condition = Column(String, nullable=True)
    
    # Insurance Information
    insurance_provider = Column(String, nullable=True)
    insurance_type = Column(String, nullable=True)
    
    # Documents
    docs_report = Column(LargeBinary, nullable=True)
    
    # Hospital and Location
    hospital_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    
    # References (Foreign Keys)
    provider_id = Column(String, ForeignKey("provider.id"), nullable=True)
    pharma_id = Column(Integer, ForeignKey("pharma.id"), nullable=True)

    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    pharma = relationship("Pharma", back_populates="patients")
    provider = relationship("Provider", back_populates="patients", lazy="select")
    stage_history = relationship("PatientStage", back_populates="patient", cascade="all, delete-orphan")
    
    # Other relationships (already defined in other models via backref)
    # tasks = relationship("Tasks", back_populates="patient")
