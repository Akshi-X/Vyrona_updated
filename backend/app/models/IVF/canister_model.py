from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship

from ...config.database import Base
from ...constants.enums import CanisterStatus


class Canister(Base):
    __tablename__ = "canisters"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    canister_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key
    tank_id = Column(Integer, ForeignKey("ivf.tanks.tank_id"), nullable=False)
    
    # Canister Information
    canister_number = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    canister_status = Column(SQLEnum(CanisterStatus, values_callable=lambda obj: [e.value for e in obj], name='canister_status'), 
                            default=CanisterStatus.SAFE, nullable=False)
    
    # Relationships
    tank = relationship("Tank", back_populates="canisters")
    ln2_logs = relationship("CanisterLn2Log", back_populates="canister", cascade="all, delete-orphan")
    canes = relationship("Cane", back_populates="canister", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

