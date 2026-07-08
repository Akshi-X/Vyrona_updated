from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class RefrigeratorDevice(Base):
    """Maps an external sensor device to a specific zone of a refrigerator (one device per zone)."""

    __tablename__ = "refrigerator_devices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    refrigerator_id = Column(
        Integer,
        ForeignKey("refrigerators.refrigerator_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    zone_id = Column(
        String(50),
        nullable=False,
        comment="Zone identifier, e.g. zone_1, zone_2",
    )
    device_code = Column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
        comment="External device identifier sent in telemetry payloads (e.g. EntityName)",
    )

    refrigerator = relationship("Refrigerator", back_populates="devices")

    __table_args__ = (
        UniqueConstraint(
            "refrigerator_id", "zone_id", name="uq_refrigerator_device_zone"
        ),
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
