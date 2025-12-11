import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Index
from sqlalchemy.orm import relationship

from ..config.database import Base


class Geolocation(Base):
    """
    Model to store geolocation coordinates tracking current location
    and shipment route coordinates
    """
    __tablename__ = "geolocation"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    shipment_id = Column(String, nullable=False, index=True)
    patient_id = Column(String, ForeignKey("patient.id", ondelete="CASCADE"), nullable=False, index=True)
    telemetry_data_id = Column(Integer, ForeignKey("telemetry_data.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Current Location Coordinates
    current_latitude = Column(Float, nullable=False, comment="Current latitude coordinate")
    current_longitude = Column(Float, nullable=False, comment="Current longitude coordinate")
    
    # Shipment Route Coordinates
    shipment_from_latitude = Column(Float, nullable=True, comment="Shipment origin latitude")
    shipment_from_longitude = Column(Float, nullable=True, comment="Shipment origin longitude")
    shipment_to_latitude = Column(Float, nullable=True, comment="Shipment destination latitude")
    shipment_to_longitude = Column(Float, nullable=True, comment="Shipment destination longitude")
    
    # Timestamp of the location reading
    reading_timestamp = Column(DateTime, nullable=False, index=True, comment="Timestamp when location data was recorded")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    telemetry_data = relationship("TelemetryData", backref="geolocations")
    shipment = relationship("Shipment", backref="geolocations")
    patient = relationship("Patient", backref="geolocations")
    
    # Composite indexes for common query patterns
    __table_args__ = (
        # Index for filtering by shipment and timestamp
        Index('idx_geolocation_shipment_timestamp', 'shipment_id', 'reading_timestamp'),
        # Index for filtering by patient and timestamp
        Index('idx_geolocation_patient_timestamp', 'patient_id', 'reading_timestamp'),
        # Index for filtering by telemetry_data and timestamp
        Index('idx_geolocation_telemetry_timestamp', 'telemetry_data_id', 'reading_timestamp'),
        # Index for spatial queries (current location)
        Index('idx_geolocation_current_location', 'current_latitude', 'current_longitude'),
        # Index for filtering by shipment route
        Index('idx_geolocation_shipment_route', 'shipment_id', 'shipment_from_latitude', 'shipment_to_latitude'),
    )

