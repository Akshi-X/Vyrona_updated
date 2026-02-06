from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship

from ...config.database import Base
from ...constants.enums import CanisterStatus


class Tank(Base):
    __tablename__ = "tanks"
    # Removed schema separation - using default schema

    # Primary Key
    tank_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to hospital_branches table (no schema prefix)
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False)
    
    # Tank Information
    tank_code = Column(String(255), nullable=True)
    capacity_liters = Column(Numeric(10, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(SQLEnum(CanisterStatus, values_callable=lambda obj: [e.value for e in obj], name='tank_status'), 
                    default=CanisterStatus.SAFE, nullable=False, comment="Tank status (safe, risk, critical)")
    tive_device_id = Column(
        String(255),
        nullable=True,
        index=True,
        comment="Tive device identifier mapped to this tank (e.g., EntityName like 'J712149' or a device id) for tank-level monitoring"
    )
    
    # Relationships
    branch = relationship("HospitalBranch", back_populates="tanks")
    canisters = relationship("Canister", back_populates="tank", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

