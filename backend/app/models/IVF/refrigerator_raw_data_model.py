"""
Refrigerator raw data: stores raw telemetry payloads from refrigerator (Tive) devices.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class RefrigeratorRawData(Base):
    """Raw IoT data for refrigerator zone monitoring"""
    __tablename__ = "refrigerator_raw_data"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Key - refrigerator this data relates to
    refrigerator_id = Column(Integer, ForeignKey("refrigerators.refrigerator_id", ondelete="CASCADE"), nullable=False, index=True)

    # Zone identifier, e.g. zone_1, zone_2
    zone_id = Column(String(50), nullable=False)

    # External device identifier from the telemetry payload
    device_code = Column(String(255), nullable=True)

    # Raw scalar values from sensor
    raw_temperature = Column(Numeric(10, 4), nullable=True)
    raw_humidity = Column(Numeric(10, 4), nullable=True)
    raw_battery_percentage = Column(Numeric(10, 4), nullable=True)

    # Full payload (JSON)
    payload = Column(JSONB, nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    refrigerator = relationship("Refrigerator", backref="raw_data")

    __table_args__ = (
        Index('idx_refrigerator_raw_data_refrigerator_zone_created', 'refrigerator_id', 'zone_id', 'created_at'),
        Index('idx_refrigerator_raw_data_device_created', 'device_code', 'created_at'),
        Index('idx_refrigerator_raw_data_payload_gin', 'payload', postgresql_using='gin'),
    )
