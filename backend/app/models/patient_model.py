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
    
    # Therapy and Treatment (soft reference - no FK constraint until therapy table exists)
    therapy_id = Column(String, nullable=True)
    
    # Insurance Information
    insurance_provider = Column(String, nullable=True)
    insurance_type = Column(String, nullable=True)
    
    # Documents
    docs_report = Column(LargeBinary, nullable=True)
    
    # Hospital and Location
    hospital_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    
    # References (soft references - no FK constraints until those tables exist)
    provider_id = Column(String, nullable=True)
    pharma_id = Column(String, ForeignKey("pharma.id"), nullable=True)  # FK to pharma table
    stage_id = Column(Integer, nullable=True)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    pharma = sqlalchemy.orm.relationship("Pharma", backref="patients")
    
    # Other relationships (commented out until those models are created)
    # therapy = relationship("Therapy", back_populates="patients")
    # provider = relationship("Provider", back_populates="patients")
    # stage = relationship("Stage", back_populates="patients")
    # shipments = relationship("Shipment", back_populates="patient")
    # iot_data = relationship("IOTData", back_populates="patient")
    # geolocations = relationship("Geolocation", back_populates="patient")
    # historic_lane_risks = relationship("HistoricLaneRisk", back_populates="patient")
    # tasks = relationship("Tasks", back_populates="patient")

