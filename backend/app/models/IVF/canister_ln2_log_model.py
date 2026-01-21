from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Date, Time, Numeric, Text, Float, Enum as SQLEnum, Index
from sqlalchemy.orm import relationship

from ...config.database import Base
from ...constants.enums import TaskStatus


class CanisterLn2Log(Base):
    __tablename__ = "canister_ln2_logs"
    # Removed schema separation - using default schema

    # Primary Key
    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to canisters table (no schema prefix)
    # Required: Every refill log must be associated with a canister
    canister_id = Column(Integer, ForeignKey("canisters.canister_id"), nullable=False, index=True)

    # Branch ID for access control (hospital branches)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=True, index=True)
    
    # Log Information
    ln2_level_before = Column(Numeric(10, 2), nullable=True)
    ln2_level_after = Column(Numeric(10, 2), nullable=True)
    remarks = Column(Text, nullable=True)
    
    refilled_count = Column(Integer, default=0, nullable=False)
    opened_count = Column(Integer, default=0, nullable=False)
    
    # Refill Log Fields (for both IVF canister opening and quality tracking refill logs)
    refill_date = Column(Date, nullable=True, index=True, comment="Date when refill/opening was performed")
    refill_time = Column(Time, nullable=True, comment="Time when refill/opening was performed")
    refilled_by = Column(String(255), nullable=True, comment="Name of person who performed the refill/opening")
    liquid_nitrogen_volume = Column(Float, nullable=True, comment="Liquid Nitrogen volume percentage (e.g., 80.0 for 80%)")
    description = Column(Text, nullable=True, comment="Description or notes about the refill")
    status = Column(SQLEnum(TaskStatus, values_callable=lambda obj: [e.value for e in obj], name="refill_status"), 
                   nullable=True, index=True, comment="Status of the refill log (Done, In progress, Not started)")
    
    # Relationships
    canister = relationship("Canister", back_populates="ln2_logs")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Composite indexes for common query patterns
    __table_args__ = (
        # Index for filtering by canister and date
        Index('idx_ln2_log_canister_date', 'canister_id', 'refill_date'),
        # Index for filtering by status
        Index('idx_ln2_log_status', 'status'),
        # Index for filtering by branch
        Index('idx_ln2_log_branch', 'branch_id'),
    )

