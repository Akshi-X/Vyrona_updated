"""
Tank KPI readings: one row per snapshot (tank_id, tank_code, timestamp, kpis as JSON).
Used for Quality Tracking tabbed graphs (temp_external, temp_internal, ln2_level, evaporation_rate, battery_level).
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ...config.database import Base


class TankKpiReading(Base):
    """One snapshot of all KPIs for a tank at a given timestamp."""
    __tablename__ = "tank_kpi_readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tank_id = Column(Integer, ForeignKey("tanks.tank_id", ondelete="CASCADE"), nullable=False, index=True)
    tank_code = Column(String(64), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    # kpis: list of { "name": str, "value": float, "unit": str } e.g. temp_external, temp_internal, ln2_level, etc.
    kpis = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    tank = relationship("Tank", backref="kpi_readings")

    __table_args__ = (
        Index("idx_tank_kpi_readings_tank_timestamp", "tank_id", "timestamp"),
    )
