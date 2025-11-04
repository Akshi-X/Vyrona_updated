import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import RouteStatus


class ShipmentLeg(Base):
    """Model to store individual legs/stages of shipment transportation"""
    __tablename__ = "shipment_leg"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    shipment_id = Column(Integer, ForeignKey("shipment.id", ondelete="CASCADE"), nullable=False)
    provider_id = Column(String, ForeignKey("provider.id", ondelete="CASCADE"), nullable=False)
    carrier_id = Column(Integer, ForeignKey("carrier.id", ondelete="SET NULL"), nullable=True)
    
    # Leg Information
    leg_order = Column(Integer, nullable=False)
    mode_of_transport = Column(String, nullable=False)
    from_location = Column(String, nullable=False)
    to_location = Column(String, nullable=False)
    
    # Coordinates for mapping (latitude, longitude)
    latitude = Column(Float, nullable=True)  # Latitude of current location
    longitude = Column(Float, nullable=True)  # Longitude of current location
   
    # Timing Information
    departure_time = Column(DateTime, nullable=True)
    arrival_time = Column(DateTime, nullable=True)
    handover_time = Column(DateTime, nullable=True)
    scheduled_time = Column(DateTime, nullable=True)
    
    # Quality and Status (Primary storage for each leg)
    leg_quality_loss = Column(Float, nullable=True)  # Quality loss for this leg
    leg_status = Column(SQLEnum(RouteStatus, values_callable=lambda obj: [e.value for e in obj], name="route_status"), 
                       default=RouteStatus.SAFE, nullable=False)
    
    # Success tracking for this leg
    leg_success = Column(Boolean, nullable=True)  # True/False/None (pending)
    leg_completion_time = Column(DateTime, nullable=True)
    
    # Additional Information
    ln2_refill = Column(String, nullable=True)
    warehouse = Column(String, nullable=True)
    
    # Document Count
    doc_count_actual = Column(Integer, nullable=True)
    doc_count_needed = Column(Integer, nullable=True)
    
    # # SLA Tracking (relationship-level details live elsewhere; quick reference here)
    # provider_sla_breached = Column(Boolean, default=False, nullable=False)
    
    # # Loss/Physical Damage Tracking
    # physical_damage_reported = Column(Boolean, default=False, nullable=False)
    # damage_type = Column(String, nullable=True)
    # damage_severity = Column(String, nullable=True)
    # damage_description = Column(Text, nullable=True)
    # damage_location = Column(String, nullable=True)
    # damage_reported_at = Column(DateTime, nullable=True)
    # damage_reported_by = Column(String, nullable=True)
    
    # # Digital & Communication Tracking
    # tracking_coverage_percentage = Column(Float, nullable=True)
    # real_time_data_gaps = Column(Integer, default=0, nullable=False)
    # connectivity_issues_count = Column(Integer, default=0, nullable=False)
    # last_tracking_update = Column(DateTime, nullable=True)
    # tracking_status = Column(String, nullable=True)
    # tracking_gap_minutes = Column(Integer, default=0, nullable=False)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    shipment = relationship("Shipment", back_populates="shipment_legs")
    provider = relationship("Provider", backref="shipment_legs")
    carrier = relationship("Carrier", backref="shipment_legs")


