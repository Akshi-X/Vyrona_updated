from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship

from ...config.database import Base


class Canister(Base):
    __tablename__ = "canisters"
    # Removed schema separation - using default schema

    # Primary Key
    canister_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to tanks table (no schema prefix)
    tank_id = Column(Integer, ForeignKey("tanks.tank_id"), nullable=False)
    
    # Canister Information
    canister_number = Column(String(255), nullable=True, comment="Canister number/code (e.g., 'C1' from ARC IVF API)")
    is_active = Column(Boolean, default=True, nullable=False)
    tive_device_id = Column(
        String(255),
        nullable=True,
        index=True,
        comment="Tive device identifier mapped to this canister (e.g., EntityName like 'J712149' or a device id)",
    )
    
    # Relationships
    tank = relationship("Tank", back_populates="canisters")
    canes = relationship("Cane", back_populates="canister", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

