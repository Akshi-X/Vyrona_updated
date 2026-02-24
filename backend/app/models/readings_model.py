"""
Individual KPI reading for a tank. One row per (kpi_config_id, timestamp).
Snapshots (timestamp + multiple kpis) are stored as multiple Readings rows with same timestamp.
"""
from sqlalchemy import Column, Integer, Numeric, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.config.database import Base


class Readings(Base):
    __tablename__ = "readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False, index=True)
    device_id = Column(Integer, nullable=True, index=True)
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True)

    kpi_config_id = Column(
        Integer,
        ForeignKey("kpi_config.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kpi_value = Column(Numeric(10, 4), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    deviation_alert_sent = Column(Boolean, nullable=False, default=False)
    deviation = Column(Boolean, nullable=False, default=False, index=True)

    alert_id = Column(Integer, ForeignKey("alerts.alert_id", ondelete="SET NULL"),default=False, nullable=True, index=True)
    checked= Column(Boolean, nullable=True, default=False, index=True)

    kpi_config = relationship("KpiConfig", back_populates="readings")

    __table_args__ = (
        Index("idx_readings_tank_timestamp", "tank_id", "timestamp"),
        Index("idx_readings_kpi_config_timestamp", "kpi_config_id", "timestamp"),
    )
