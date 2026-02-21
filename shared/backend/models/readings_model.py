from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Numeric, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import Base


class Readings(Base):
    """
    Individual sensor reading for a KPI, scoped to a specific tank/device.
    Written exclusively by telemetry-service on every webhook received.
    Read by backend for dashboards, history views, and alert evaluation.

    Table: readings
    """
    __tablename__ = "readings"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys — scope the reading to its origin
    hospital_id = Column(
        Integer,
        ForeignKey("hospitals.hospital_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id = Column(
        Integer,
        ForeignKey("hospital_branches.branch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(
        Integer,
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Device that produced this reading (nullable: reading may arrive before device record exists)",
    )
    tank_id = Column(
        Integer,
        ForeignKey("tanks.tank_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kpi_config_id = Column(
        Integer,
        ForeignKey("kpi_config.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Measured value
    kpi_value = Column(Numeric(10, 4), nullable=False, comment="Raw sensor value for this KPI")

    # When the reading was recorded by the IoT device / webhook
    timestamp = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        comment="Timestamp of the sensor reading (from device, not insert time)",
    )

    # Alert state
    deviation_alert_sent = Column(
        Boolean,
        nullable=False,
        default=False,
        comment="True once an out-of-threshold alert has been dispatched for this reading",
    )
    deviation = Column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="True if kpi_value violates the min/max bounds in kpi_config",
    )

    # Relationships
    hospital = relationship("Hospital", backref="readings")
    branch = relationship("HospitalBranch", backref="readings")
    device = relationship("Device", backref="readings")
    tank = relationship("Tank", backref="readings")
    kpi_config = relationship("KpiConfig", back_populates="readings")

    # Composite indexes for the most common query patterns
    __table_args__ = (
        # Time-series query: all readings for a tank ordered by time
        Index("idx_readings_tank_timestamp", "tank_id", "timestamp"),
        # Alert review: unsent deviation alerts for a branch
        Index("idx_readings_branch_deviation", "branch_id", "deviation", "deviation_alert_sent"),
        # KPI history for a specific config
        Index("idx_readings_kpi_config_timestamp", "kpi_config_id", "timestamp"),
    )
