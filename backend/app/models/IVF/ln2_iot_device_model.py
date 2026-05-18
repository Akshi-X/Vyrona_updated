"""
LN2 IoT Device mapping: links a tank to an IoT device with min/max capacity thresholds.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Index, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class Ln2IotDevice(Base):
    """Maps a tank to an IoT device with capacity reading thresholds"""
    __tablename__ = "ln2_iot_devices"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Key - tank this device monitors
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True)

    # Foreign Key - device from devices table
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)

    # Capacity thresholds for alerts/display
    tank_max_capacity_reading = Column(Numeric(10, 4), nullable=True)
    tank_min_capacity_reading = Column(Numeric(10, 4), nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    tank = relationship("Tank", backref="ln2_iot_devices")
    device = relationship("Device", backref="ln2_iot_devices")

    __table_args__ = (
        UniqueConstraint('tank_id', 'device_id', name='uq_ln2_iot_device_tank_device'),
    )
