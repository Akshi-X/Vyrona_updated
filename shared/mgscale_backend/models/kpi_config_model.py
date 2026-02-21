from sqlalchemy import Column, Integer, String, Numeric, Boolean, Index
from sqlalchemy.orm import relationship

from .base import Base


class KpiConfig(Base):
    """
    KPI configuration per tank — defines the monitored metric, its alert thresholds,
    and the alert type. Written by the admin/setup flow, read by telemetry-service
    when evaluating incoming readings.

    Table: kpi_config

    Note on cross-Base FK columns: hospital_id, branch_id, and tank_id reference
    tables registered under the local backend Base (different SQLAlchemy MetaData).
    Declaring ForeignKey() on these columns causes a NoReferencedTableError at
    create_all time because SharedBase.metadata cannot resolve tables from the local
    Base. These columns are plain Integer — referential integrity for them is enforced
    via database-level constraints added by the local Base's create_all / migrations.
    """
    __tablename__ = "kpi_config"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Cross-Base FK columns — plain Integer; FK constraints live in local Base / migrations
    hospital_id = Column(Integer, nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    tank_id = Column(Integer, nullable=False, index=True)

    # KPI definition
    kpi_name = Column(String(255), nullable=False, comment="Name of the KPI being monitored (e.g. 'temperature', 'ln2_level')")
    alert_name = Column(String(255), nullable=True, comment="Human-readable alert label shown in notifications")

    # Thresholds — nullable to allow one-sided bounds
    min = Column(Numeric(10, 4), nullable=True, comment="Minimum acceptable value; violation if reading < min")
    max = Column(Numeric(10, 4), nullable=True, comment="Maximum acceptable value; violation if reading > max")

    # Alert configuration
    alert_type = Column(String(100), nullable=True, comment="Alert delivery type (e.g. 'soft_alert', 'critical_alert')")

    # Active flag — inactive configs are ignored by telemetry-service
    status = Column(Boolean, nullable=False, default=True, comment="True = active, False = disabled")

    # Relationship to Readings (intra-SharedBase — safe to declare)
    readings = relationship("Readings", back_populates="kpi_config", cascade="all, delete-orphan")

    # Note: relationships to Hospital, HospitalBranch, Tank are intentionally omitted.
    # Those classes live in the local backend Base (different mapper registry).
    # Access them via plain FK queries: db.query(Tank).filter(Tank.tank_id == kpi.tank_id)

    # Composite index — common query: all active KPIs for a given tank
    __table_args__ = (
        Index("idx_kpi_config_tank_status", "tank_id", "status"),
        Index("idx_kpi_config_branch", "branch_id", "kpi_name"),
    )
