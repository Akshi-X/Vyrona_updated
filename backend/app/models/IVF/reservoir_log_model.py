from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Date
from sqlalchemy.orm import relationship

from ...config.database import Base


class ReservoirLog(Base):
    __tablename__ = "reservoir_logs"

    # Primary Key
    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Key - reference to reservoirs table
    reservoir_id = Column(Integer, ForeignKey("reservoirs.reservoir_id"), nullable=False, index=True)

    # LN2 order/receipt tracking
    ln2_ordered_date = Column(Date, nullable=True, comment="Date when LN2 was ordered")
    ln2_received_date = Column(Date, nullable=True, comment="Date when LN2 was received")

    # Relationships
    reservoir = relationship("Reservoir", back_populates="logs")

    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
