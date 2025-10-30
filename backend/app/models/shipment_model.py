import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import RouteStatus


class Shipment(Base):
    """Model to store shipment information"""
    __tablename__ = "shipment"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Shipment Information
    mode_of_transport = Column(String, nullable=False)
    source_location = Column(String, nullable=False)
    destination_location = Column(String, nullable=False)
    
    # Timing Information
    departure_time = Column(DateTime, nullable=True)
    arrival_time = Column(DateTime, nullable=True)
    handover_time = Column(DateTime, nullable=True)
    
    # Quality and Status (Aggregated from legs)
    overall_quality_loss = Column(Float, nullable=True)  # Aggregated from all legs
    routes_status = Column(SQLEnum(RouteStatus, values_callable=lambda obj: [e.value for e in obj], name="route_status"), 
                          default=RouteStatus.SAFE, nullable=False)
    # Note: stage is tracked in PatientStage model (process_phase table), not here
    
    # Success tracking for transportation phase
    transportation_success = Column(Boolean, nullable=True)  # True/False/None (pending)
    
    # Loss/Physical Damage Tracking (Shipment Level)
    physical_damage_reported = Column(Boolean, default=False, nullable=False)
    damage_incidents_count = Column(Integer, default=0, nullable=False)  # Total damage incidents
    lost_shipment = Column(Boolean, default=False, nullable=False)
    theft_incident = Column(Boolean, default=False, nullable=False)
    
    # Lane Complexity Tracking
    total_carrier_handovers = Column(Integer, nullable=True)  # Number of legs/handovers
    complexity_score = Column(Float, nullable=True)  # Calculated complexity score
    
    # Regulatory Clearance Status
    regulatory_clearance_required = Column(Boolean, default=False, nullable=False)
    regulatory_clearance_status = Column(String, nullable=True)  # pending, approved, rejected
    
    # Foreign Keys
    patient_id = Column(String, ForeignKey("patient.id", ondelete="CASCADE"), nullable=False)
    pharma_id = Column(Integer, ForeignKey("pharma.id", ondelete="CASCADE"), nullable=False)
    # Logistics Provider and Carrier references
    provider_id = Column(String, ForeignKey("provider.id", ondelete="SET NULL"), nullable=True)  # Logistics Provider (3PL)
    carrier_id = Column(Integer, ForeignKey("carrier.id", ondelete="SET NULL"), nullable=True)  # Actual carrier (FedEx, Maersk, etc.)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    patient = relationship("Patient", backref="shipments")
    pharma = relationship("Pharma", backref="shipments")
    provider = relationship("Provider", backref="shipments")  # Logistics Provider
    carrier = relationship("Carrier", back_populates="shipments")  # Actual carrier
    shipment_legs = relationship("ShipmentLeg", back_populates="shipment", cascade="all, delete-orphan")
    