from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class IncubatorChamberMap(Base):
    """Explicit override for a device's reported chamber_id when it doesn't
    match the row-major position telemetry ingestion assumes by default
    (see process_custom_incubator_iot in telemetry-service). Absence of a row
    here for a given (incubator_device_id, device_chamber_id) means "trust
    the row-major default" — this table only exists to correct hardware that
    numbers its chambers differently than our chamber_r x chamber_c grid
    order."""

    __tablename__ = "incubator_chamber_map"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    incubator_device_id = Column(
        Integer,
        ForeignKey("incubator_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_chamber_id = Column(
        String(50),
        nullable=False,
        comment="chamber_id exactly as this device reports it in telemetry payloads (e.g. '1')",
    )
    internal_chamber_id = Column(
        String(50),
        nullable=False,
        comment="Our chamber_id — matches readings.chamber_id / kpi_config.chamber_id",
    )

    incubator_device = relationship("IncubatorDevice", back_populates="chamber_map")

    __table_args__ = (
        UniqueConstraint(
            "incubator_device_id", "device_chamber_id",
            name="uq_incubator_chamber_map_device_chamber",
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
