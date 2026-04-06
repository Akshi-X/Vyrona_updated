"""
Automatically detected LN2 refill events from IoT telemetry.

When an IoT device records a sudden increase in LN2 mass/level (refill_detected=True
in ln2_readings), a row is inserted here capturing the full before/after snapshot.

This is separate from canister_ln2_logs (manual staff-entered refill records).
The two can be correlated via the optional canister_ln2_log_id FK.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, ForeignKey, DateTime, Numeric, Boolean,
    String, Text, Index
)
from sqlalchemy.orm import relationship

from ...config.database import Base


class Ln2RefillDetection(Base):
    """
    Auto-detected LN2 refill events captured from IoT sensor readings.

    Created automatically when refill_detected=True is observed in ln2_readings.
    Stores before/after LN2 metrics at the point of detection, and can be
    manually confirmed by staff and linked to a canister_ln2_log entry.
    """
    __tablename__ = "ln2_refill_detections"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Foreign Keys
    tank_id = Column(
        Integer,
        ForeignKey("tanks.tank_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Tank on which the refill was detected",
    )

    hospital_id = Column(
        Integer,
        ForeignKey("hospitals.hospital_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Hospital owning the tank (for access control)",
    )
    branch_id = Column(
        Integer,
        ForeignKey("hospital_branches.branch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Hospital branch owning the tank (for access control)",
    )

    # ------------------------------------------------------------------ #
    # Detection timestamp
    # ------------------------------------------------------------------ #
    detected_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        comment="Timestamp of the reading that triggered refill detection",
    )


    # ------------------------------------------------------------------ #
    # Derived metrics
    # ------------------------------------------------------------------ #
    refill_weight = Column(
        Numeric(12, 4),
        nullable=True,
        comment="Estimated LN2 added = mass_after - mass_before (kg)",
    )

    # ------------------------------------------------------------------ #
    # Manual confirmation
    # ------------------------------------------------------------------ #
    is_confirmed = Column(
        Boolean,
        nullable=True,
        default=None,
        comment="True/False once staff confirms or rejects; NULL = not yet reviewed",
    )
    confirmed_by = Column(
        String(255),
        nullable=True,
        comment="Name / user identifier of the staff member who confirmed",
    )
    confirmed_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when the detection was manually confirmed",
    )
    notes = Column(
        Text,
        nullable=True,
        comment="Optional staff notes on the detected refill event",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    tank = relationship("Tank", backref="refill_detections")
    hospital = relationship("Hospital", backref="refill_detections")

    # ------------------------------------------------------------------ #
    # Audit
    # ------------------------------------------------------------------ #
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------------------------------------------ #
    # Composite indexes for common query patterns
    # ------------------------------------------------------------------ #
    __table_args__ = (
        # Time-series queries per tank
        Index("idx_refill_det_tank_detected", "tank_id", "detected_at"),
        # Filter by branch + time
        Index("idx_refill_det_branch_detected", "branch_id", "detected_at"),
        # Filter unconfirmed detections
        Index("idx_refill_det_confirmed", "is_confirmed"),
    )
