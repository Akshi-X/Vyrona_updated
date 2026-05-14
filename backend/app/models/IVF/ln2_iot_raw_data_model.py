"""
LN2 IoT raw data: stores raw telemetry from IoT devices.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class Ln2IotRawData(Base):
    """Raw IoT data for LN2 tank monitoring"""
    __tablename__ = "ln2_iot_raw_data"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Key - tank this data relates to
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True)

    # Foreign Key - device from devices table (like ln2_iot_device_model)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)

    # Raw numeric value from sensor
    raw_data = Column(Numeric(10, 4), nullable=True)

    # Full payload (JSON)
    payload = Column(JSONB, nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    tank = relationship("Tank", backref="ln2_iot_raw_data")
    device = relationship("Device", backref="ln2_iot_raw_data")

    __table_args__ = (
        Index('idx_ln2_iot_raw_data_tank_created', 'tank_id', 'created_at'),
        Index('idx_ln2_iot_raw_data_device_created', 'device_id', 'created_at'),
    )
