from sqlalchemy import Column, String, Integer, DateTime, LargeBinary
from sqlalchemy.sql import func
from ..config.database import Base


class Patient(Base):
    __tablename__ = "patient"

    id = Column(String, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    therapy_id = Column(String, nullable=True)  # Removed ForeignKey constraint
    insurance_provider = Column(String, nullable=True)
    insurance_type = Column(String, nullable=True)
    docs_report = Column(LargeBinary, nullable=True)
    hospital_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    provider_id = Column(String, nullable=True)  # Removed ForeignKey constraint
    pharma_id = Column(String, nullable=True)    # Removed ForeignKey constraint
    stage_id = Column(Integer, nullable=True)    # Fixed typo: was "tage_id"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Note: Foreign key relationships can be added later when the referenced tables exist
    # For now, these are just string/integer fields for storing IDs
