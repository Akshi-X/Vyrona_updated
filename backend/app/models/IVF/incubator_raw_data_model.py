"""
Incubator raw data: stores raw telemetry payloads from incubator IoT devices.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class IncubatorRawData(Base):
    """Raw IoT data for incubator chamber monitoring. One row per chamber per
    reading — payload is the full multi-chamber webhook payload as received,
    so the audit trail shows exactly what the device sent even though the
    scalar columns are scoped to this one chamber."""
    __tablename__ = "incubator_raw_data"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    incubator_id = Column(Integer, ForeignKey("incubators.incubator_id", ondelete="CASCADE"), nullable=False, index=True)
    chamber_id = Column(String(50), nullable=False)
    device_id = Column(String(255), nullable=True)

    raw_temperature = Column(Numeric(10, 4), nullable=True)
    raw_humidity = Column(Numeric(10, 4), nullable=True)
    raw_tvoc = Column(Numeric(10, 4), nullable=True)
    raw_o2 = Column(Numeric(10, 4), nullable=True)
    raw_co2 = Column(Numeric(10, 4), nullable=True)

    payload = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    incubator = relationship("Incubator", backref="raw_data")

    __table_args__ = (
        Index('idx_incubator_raw_data_incubator_chamber_created', 'incubator_id', 'chamber_id', 'created_at'),
        Index('idx_incubator_raw_data_device_created', 'device_id', 'created_at'),
        Index('idx_incubator_raw_data_payload_gin', 'payload', postgresql_using='gin'),
    )
