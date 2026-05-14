from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFGeolocation(Base):
    """
    Model to store geolocation coordinates for IVF tank monitoring.
    Motion from Tive Solo 5G refers to location data (latitude/longitude).
    Supports tracking shipment routes and patient associations.
    """
    __tablename__ = "ivf_geolocation"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    # Tank-level monitoring
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True, comment="Tank ID for tank-level monitoring")
    ivf_telemetry_data_id = Column(Integer, ForeignKey("ivf_telemetry_data.id", ondelete="CASCADE"), nullable=False, index=True, comment="IVF telemetry data ID for IVF monitoring")
    
    # Shipment References (optional - for IVF shipments)
    shipment_id = Column(String, nullable=True, index=True, comment="Shipment ID if tank is part of a shipment")
    # Note: patient_id removed - patient data is now in PatientCrylockInfo table
    
    # Current Location Coordinates
    current_latitude = Column(Float, nullable=False, comment="Current latitude coordinate")
    current_longitude = Column(Float, nullable=False, comment="Current longitude coordinate")
    
    # Shipment Route Coordinates (optional - for tracking shipment origin and destination)
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
    ivf_telemetry_data = relationship("IVFTelemetryData", backref="geolocations")
    tank = relationship("Tank", backref="ivf_geolocations")

    # Composite indexes for common query patterns
    __table_args__ = (
        # Index for filtering by tank and timestamp
        Index('idx_ivf_geolocation_tank_timestamp', 'tank_id', 'reading_timestamp'),
        # Index for filtering by IVF telemetry_data and timestamp
        Index('idx_ivf_geolocation_telemetry_timestamp', 'ivf_telemetry_data_id', 'reading_timestamp'),
        # Index for filtering by shipment and timestamp
        Index('idx_ivf_geolocation_shipment_timestamp', 'shipment_id', 'reading_timestamp'),
        # Note: patient_id index removed - patient data is now in PatientCrylockInfo table
        # Index for spatial queries (current location)
        Index('idx_ivf_geolocation_current_location', 'current_latitude', 'current_longitude'),
        # Index for filtering by shipment route
        Index('idx_ivf_geolocation_shipment_route', 'shipment_id', 'shipment_from_latitude', 'shipment_to_latitude'),
    )
