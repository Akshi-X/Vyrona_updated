from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Text
from sqlalchemy.orm import relationship

from ...config.database import Base


class CanisterLn2Log(Base):
    __tablename__ = "canister_ln2_logs"
    # Removed schema separation - using default schema

    # Primary Key
    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to canisters table (no schema prefix)
    canister_id = Column(Integer, ForeignKey("canisters.canister_id"), nullable=False)
    
    # Log Information
    opened_at = Column(DateTime, nullable=True)
    opened_by = Column(String(255), nullable=True)
    ln2_level_before = Column(Numeric(10, 2), nullable=True)
    ln2_level_after = Column(Numeric(10, 2), nullable=True)
    remarks = Column(Text, nullable=True)
    
    refilled_count = Column(Integer, default=0, nullable=False)
    opened_count = Column(Integer, default=0, nullable=False)
    
    # Relationships
    canister = relationship("Canister", back_populates="ln2_logs")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    created_by = Column(String, nullable=True)

