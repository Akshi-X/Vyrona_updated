from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFTelemetryData(Base):
    """Model to store raw IoT telemetry data from Tive for IVF tanks"""
    __tablename__ = "ivf_telemetry_data"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - tank-level monitoring
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True, comment="Tank ID for tank-level monitoring")
    
    # Optional device identifier (if provided by IoT system)
    device_id = Column(String, nullable=True, index=True)
    
    # Telemetry data stored as JSONB for efficient querying and indexing
    telemetry_data = Column(JSONB, nullable=False, comment="Raw telemetry data from Tive webhook")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Relationships
    tank = relationship("Tank", backref="ivf_telemetry_data")
