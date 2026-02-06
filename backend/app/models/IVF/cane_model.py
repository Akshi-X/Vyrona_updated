from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship

from ...config.database import Base


class Cane(Base):
    __tablename__ = "canes"
    # Removed schema separation - using default schema

    # Primary Key
    cane_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to canisters table (no schema prefix)
    canister_id = Column(Integer, ForeignKey("canisters.canister_id"), nullable=False)
    
    # Cane Information
    cane_code = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    canister = relationship("Canister", back_populates="canes")
    cryolocks = relationship("Cryolock", back_populates="cane", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

