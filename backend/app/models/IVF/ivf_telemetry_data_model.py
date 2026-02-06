from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFTelemetryData(Base):
    """Model to store raw IoT telemetry data from Tive for IVF canisters"""
    __tablename__ = "ivf_telemetry_data"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to canisters table
    canister_id = Column(Integer, ForeignKey("canisters.canister_id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Optional device identifier (if provided by IoT system)
    device_id = Column(String, nullable=True, index=True)
    
    # Telemetry data stored as JSONB for efficient querying and indexing
    telemetry_data = Column(JSONB, nullable=False, comment="Raw telemetry data from Tive webhook")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Relationships
    canister = relationship("Canister", backref="ivf_telemetry_data")
