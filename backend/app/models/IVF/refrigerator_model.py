from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class Refrigerator(Base):
    __tablename__ = "refrigerators"

    # Primary Key
    refrigerator_id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False)

    # Refrigerator Information. Two fixed zones modeled via zone_id on linked tables
    # ("freezer" or "fridge") - no zone topology stored on the device row itself.
    refrigerator_code = Column(String(255), nullable=True)
    external_id = Column(String(255), nullable=True, comment="External device/system identifier")
    type = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    hospital = relationship("Hospital", back_populates="refrigerators")
    branch = relationship("HospitalBranch", back_populates="refrigerators")

    # Constraints
    __table_args__ = (
        UniqueConstraint("refrigerator_code", "branch_id", name="uq_refrigerators_code_branch"),
    )

    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
