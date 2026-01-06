from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, Text, Numeric, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class HospitalBranch(Base):
    __tablename__ = "hospital_branches"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    branch_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to schema-qualified table
    hospital_id = Column(Integer, ForeignKey("ivf.hospitals.hospital_id"), nullable=False)
    
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
    
    # Relationships
    hospital = relationship("Hospital", back_populates="branches")
    tanks = relationship("Tank", back_populates="branch", cascade="all, delete-orphan")
    branch_logins = relationship("BranchLogin", back_populates="branch", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

