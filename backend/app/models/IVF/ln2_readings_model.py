"""
LN2 (Liquid Nitrogen) telemetry readings from devices.
Stores device-level readings: mass, evaporation rate, level, and timestamp.
Schema: device_id, tank_id, timestamp, raw_weight_kg, ln2_mass_kg, ln2_level_pct,
ln2_volume_l, sensor_status, evaporation_rate_kg_per_h, lid_state, refill_detected, quality_status.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, ForeignKey, DateTime, Numeric, Boolean, String, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class Ln2Reading(Base):
    """LN2 telemetry readings from IoT devices (e.g. tank sensors)"""
    __tablename__ = "ln2_readings"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=True, index=True)

    # Relationships
    device = relationship("Device", backref="ln2_readings")

    # Core metrics (new schema)
    raw_weight_kg = Column(Numeric(12, 4), nullable=True)
    ln2_mass_kg = Column(Numeric(12, 4), nullable=True)
    ln2_level_pct = Column(Numeric(6, 2), nullable=True)
    ln2_volume_l = Column(Numeric(12, 4), nullable=True)
    evaporation_rate_kg_per_h = Column(Numeric(12, 6), nullable=True)
    sensor_status = Column(String(50), nullable=True)
    lid_state = Column(String(50), nullable=True)
    refill_detected = Column(Boolean, nullable=True)
    quality_status = Column(String(50), nullable=True)

    # When the sensor recorded this reading (device timestamp)
    reading_timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    @property
    def timestamp(self) -> datetime:
        """Alias for reading_timestamp (API exposes as timestamp)"""
        return self.reading_timestamp

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_ln2_readings_device_timestamp', 'device_id', 'reading_timestamp'),
        Index('idx_ln2_readings_tank_timestamp', 'tank_id', 'reading_timestamp'),
    )
