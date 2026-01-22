from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Boolean, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFQualityLog(Base):
    """
    Model to store IVF container quality log entries from IoT devices.
    """
    __tablename__ = "ivf_quality_log"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    canister_id = Column(Integer, ForeignKey("canisters.canister_id", ondelete="CASCADE"), nullable=False, index=True)

    # Optional device identifier (if provided by IoT system)
    device_id = Column(String, nullable=True, index=True)

    # Telemetry Data
    temperature = Column(Float, nullable=True, comment="Temperature in °C")
    humidity = Column(Float, nullable=True, comment="Humidity in %")
    agitation = Column(Float, nullable=True, comment="Agitation in %")

    # Quality Loss Tracking
    quality_loss = Column(Float, nullable=True, comment="Amount of quality loss (percentage)")

    # Boolean flags indicating which parameter(s) caused quality loss
    is_temp_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if temperature violation caused quality loss")
    is_humidity_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if humidity violation caused quality loss")
    is_agitation_loss = Column(Boolean, default=False, nullable=False, index=True, comment="True if agitation violation caused quality loss")

    # Timestamp of the telemetry reading
    reading_timestamp = Column(DateTime, nullable=False, index=True, comment="Timestamp when telemetry data was recorded")

    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    canister = relationship("Canister", backref="quality_logs")

    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_ivf_quality_log_canister_timestamp', 'canister_id', 'reading_timestamp'),
        Index('idx_ivf_quality_log_device_timestamp', 'device_id', 'reading_timestamp'),
        Index('idx_ivf_quality_log_canister_loss', 'canister_id', 'quality_loss'),
        Index('idx_ivf_quality_log_violations', 'is_temp_loss', 'is_humidity_loss', 'is_agitation_loss'),
    )
