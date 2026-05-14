"""
KPI configuration per tank — defines limits and thresholds for visualization and alerts.
Used for GET kpi-config (nested kpi_limits) and for linking Readings.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.config.database import Base


class KpiConfig(Base):
    __tablename__ = "kpi_config"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    hospital_id = Column(
        Integer, ForeignKey("hospitals.hospital_id"), nullable=False, index=True
    )
    branch_id = Column(
        Integer, ForeignKey("hospital_branches.branch_id"), nullable=False, index=True
    )
    tank_id = Column(
        Integer,
        ForeignKey("tanks.tank_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    incubator_id = Column(
        Integer,
        ForeignKey("incubators.incubator_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    chamber_id = Column(String(255), nullable=True)

    kpi_name = Column(
        String(255),
        nullable=False,
        comment="e.g. temp_external, ln2_level, evaporation_rate, lid_status, shock",
    )
    alert_name = Column(
        String(255),
        nullable=True,
        comment="Null = value config for readings; 'l1'/'l2'/'critical' = threshold for ln2_level",
    )

    min = Column(Numeric(10, 4), nullable=True)
    max = Column(Numeric(10, 4), nullable=True)
    unit = Column(String(64), nullable=True, comment="e.g. °C, %, kg/h")
    alert_type = Column(String(100), nullable=True, comment="e.g. soft, critical")
    cooldown_minutes = Column(
        Integer,
        nullable=False,
        default=60,
        server_default="60",
        comment="Cooldown period in minutes between repeated alerts for this KPI config. Default 60 minutes.",
    )

    unack_escalation_threshold = Column(
        Integer,
        nullable=True,
        comment="N consecutive unacknowledged alerts that trigger escalation email to admins/managers. NULL = disabled.",
    )
    last_escalation_sent_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last time an escalation email was sent for this KPI. Prevents re-escalation spam.",
    )

    status = Column(Boolean, nullable=False, default=True)

    readings = relationship(
        "Readings", back_populates="kpi_config", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_kpi_config_tank_status", "tank_id", "status"),
        Index("idx_kpi_config_tank_kpi_alert", "tank_id", "kpi_name", "alert_name"),
    )
