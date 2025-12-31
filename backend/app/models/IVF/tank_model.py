from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Numeric, Boolean
from sqlalchemy.orm import relationship

from ...config.database import Base


class Tank(Base):
    __tablename__ = "tanks"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    tank_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key
    branch_id = Column(Integer, ForeignKey("ivf.hospital_branches.branch_id"), nullable=False)
    
    # Tank Information
    tank_code = Column(String(255), nullable=True)
    capacity_liters = Column(Numeric(10, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    branch = relationship("HospitalBranch", back_populates="tanks")
    canisters = relationship("Canister", back_populates="tank", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

