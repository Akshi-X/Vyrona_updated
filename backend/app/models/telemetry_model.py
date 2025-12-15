import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from ..config.database import Base


class TelemetryData(Base):
    """Model to store IoT telemetry data from providers"""
    __tablename__ = "telemetry_data"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Shipment ID - indexed for fast lookups
    shipment_id = Column(String, nullable=False, index=True)
    
    # Telemetry data stored as JSONB for efficient querying and indexing
    telemetry_data = Column(JSONB, nullable=False)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

