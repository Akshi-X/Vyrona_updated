from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class Incubator(Base):
    __tablename__ = "incubators"

    # Primary Key
    incubator_id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False)

    # Incubator Information
    incubator_code = Column(String(255), nullable=True)
    external_id = Column(String(255), nullable=True, comment="External device/system identifier")
    type = Column(String(255), nullable=True)
    chamber_r = Column(Integer, nullable=True)
    chamber_c = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Calibration constants for the derived culture-media pH calculation
    # (Henderson-Hasselbalch from live CO2%/temperature) — see
    # telemetry-service/shared/publisher_logic.py compute_incubator_ph().
    # Null means "not calibrated yet"; pH is skipped, never defaulted, when
    # either is missing.
    pressure_mmhg = Column(Numeric(6, 2), nullable=True, comment="Local atmospheric pressure at the site (mmHg)")
    hco3_mm = Column(Numeric(6, 2), nullable=True, comment="Clinic's calibrated bicarbonate constant for the media brand in use (mM)")

    # Relationships
    hospital = relationship("Hospital", back_populates="incubators")
    branch = relationship("HospitalBranch", back_populates="incubators")
    devices = relationship(
        "IncubatorDevice", back_populates="incubator", cascade="all, delete-orphan"
    )

    # Constraints
    __table_args__ = (
        UniqueConstraint("incubator_code", "branch_id", name="uq_incubators_code_branch"),
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
