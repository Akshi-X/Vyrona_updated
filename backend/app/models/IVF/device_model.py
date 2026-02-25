"""
Device model: IoT devices associated with hospital branches.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class Device(Base):
    """IoT device belonging to a hospital branch"""
    __tablename__ = "devices"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Key - branch this device belongs to
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id", ondelete="CASCADE"), nullable=False, index=True)

    # Optional external identifier (e.g. Tive device_id, sensor ID)
    device_code = Column(String(255), nullable=True, index=True, comment="External device ID from IoT provider")

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    branch = relationship("HospitalBranch", backref="devices")

    __table_args__ = (
        Index('idx_devices_branch_id', 'branch_id'),
    )
