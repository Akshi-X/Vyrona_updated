from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class IncubatorDevice(Base):
    """Maps an external IoT device to an incubator (one device reports every
    chamber of that incubator in a single telemetry payload — unlike
    RefrigeratorDevice, there is no per-chamber device_id)."""

    __tablename__ = "incubator_devices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    incubator_id = Column(
        Integer,
        ForeignKey("incubators.incubator_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
        comment="External device identifier sent in telemetry payloads (e.g. device_id)",
    )

    incubator = relationship("Incubator", back_populates="devices")
    chamber_map = relationship(
        "IncubatorChamberMap", back_populates="incubator_device", cascade="all, delete-orphan"
    )

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
