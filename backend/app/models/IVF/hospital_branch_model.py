from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, Text, Numeric, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class HospitalBranch(Base):
    __tablename__ = "hospital_branches"
    # Removed schema separation - using default schema for authentication models

    # Primary Key
    branch_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to hospitals table (no schema prefix)
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False)
    
    # Branch Information
    branch_name = Column(String(20), nullable=True)
    district_name = Column(String(20), nullable=True)
    state_name = Column(String(20), nullable=True)
    country_name = Column(String(50), nullable=True)
    area = Column(Text, nullable=True)
    pincode = Column(String(10), nullable=True)
    
    # Location Coordinates
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    
    # Note: total_number_of_embryos and total_number_of_containers removed
    # These should be calculated via queries, not stored as derived fields
    
    # Relationships
    hospital = relationship("Hospital", back_populates="branches")
    tanks = relationship("Tank", back_populates="branch", cascade="all, delete-orphan")
    incubators = relationship("Incubator", back_populates="branch", cascade="all, delete-orphan")
    refrigerators = relationship("Refrigerator", back_populates="branch", cascade="all, delete-orphan")
    patient_crylocks = relationship("PatientCrylockInfo", back_populates="branch", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

