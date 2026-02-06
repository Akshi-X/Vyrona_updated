from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFPatient(Base):
    __tablename__ = "patients"
    # Removed schema separation - using default schema

    # Primary Key
    patient_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to hospital_branches table
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=True, comment="Reference to hospital branch where patient is located")
    
    # Patient Information
    his_number = Column(String(255), nullable=True, comment="Hospital Information System number - unique patient identifier")
    
    # Relationships
    branch = relationship("HospitalBranch", back_populates="patients")
    embryos = relationship("Embryo", back_populates="patient", cascade="all, delete-orphan")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('his_number', name='uq_patients_his_number'),
    )
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

