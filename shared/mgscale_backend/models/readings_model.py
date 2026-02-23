from sqlalchemy import Column, Integer, Numeric, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import Base


class Readings(Base):
    """
    Individual sensor reading for a KPI, scoped to a specific tank/device.
    Written exclusively by telemetry-service on every webhook received.
    Read by backend for dashboards, history views, and alert evaluation.

    Table: readings

    Note on cross-Base FK columns: hospital_id, branch_id, device_id, and tank_id
    reference tables registered under the local backend Base (different SQLAlchemy
    MetaData). Declaring ForeignKey() on these columns causes a NoReferencedTableError
    at create_all time because SharedBase.metadata cannot resolve tables from the local
    Base. These columns are plain Integer — referential integrity for them is enforced
    via database-level constraints added by the local Base's create_all / migrations.
    kpi_config_id references kpi_config which is in SharedBase — ForeignKey is safe there.
    """
    __tablename__ = "readings"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Cross-Base FK columns — plain Integer; FK constraints live in local Base / migrations
    hospital_id = Column(Integer, nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    device_id = Column(
        Integer,
        nullable=True,
        index=True,
        comment="Device that produced this reading (nullable: reading may arrive before device record exists)",
    )
    tank_id = Column(Integer, nullable=False, index=True)

    # Intra-SharedBase FK — safe to declare ForeignKey
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
    alert_id = Column(Integer, index=True, nullable=True, comment="Alert object created for the deviation")
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

    # Relationship to KpiConfig (intra-SharedBase — safe to declare)
    kpi_config = relationship("KpiConfig", back_populates="readings")

    # Note: relationships to Hospital, HospitalBranch, Device, Tank are intentionally
    # omitted. Those classes live in the local backend Base (different mapper registry).
    # Access them via plain FK queries: db.query(Tank).filter(Tank.tank_id == r.tank_id)

    # Composite indexes for the most common query patterns
    __table_args__ = (
        # Time-series query: all readings for a tank ordered by time
        Index("idx_readings_tank_timestamp", "tank_id", "timestamp"),
        # Alert review: unsent deviation alerts for a branch
        Index("idx_readings_branch_deviation", "branch_id", "deviation", "deviation_alert_sent"),
        # KPI history for a specific config
        Index("idx_readings_kpi_config_timestamp", "kpi_config_id", "timestamp"),
    )
