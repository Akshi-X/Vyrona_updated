from sqlalchemy import Column, Integer, String, Numeric, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import Base


class KpiConfig(Base):
    """
    KPI configuration per tank — defines the monitored metric, its alert thresholds,
    and the alert type. Written by the admin/setup flow, read by telemetry-service
    when evaluating incoming readings.

    Table: kpi_config
    """
    __tablename__ = "kpi_config"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
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
    tank_id = Column(
        Integer,
        ForeignKey("tanks.tank_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

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

    # Relationships
    hospital = relationship("Hospital", backref="kpi_configs")
    branch = relationship("HospitalBranch", backref="kpi_configs")
    tank = relationship("Tank", backref="kpi_configs")
    readings = relationship("Readings", back_populates="kpi_config", cascade="all, delete-orphan")

    # Composite index — common query: all active KPIs for a given tank
    __table_args__ = (
        Index("idx_kpi_config_tank_status", "tank_id", "status"),
        Index("idx_kpi_config_branch", "branch_id", "kpi_name"),
    )
