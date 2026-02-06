from datetime import datetime, timezone, date
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, Date, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base


class Cryolock(Base):
    __tablename__ = "cryolocks"
    # Removed schema separation - using default schema

    # Primary Key
    cryolock_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to canes table (no schema prefix)
    cane_id = Column(Integer, ForeignKey("canes.cane_id"), nullable=False)
    
    # Cryolock Information
    cryolock_number = Column(String(255), nullable=True, comment="Legacy cryolock number (may contain combined string like T1/C1/A11/2)")
    position_number = Column(Integer, nullable=True, comment="Position number within the cane (1, 2, 3, etc.) - normalized from Excel")
    date_of_vitrification = Column(Date, nullable=True, comment="Date when the embryo(s) in this cryolock were vitrified")
    cryolock_color = Column(String(255), nullable=True)
    goblet_color = Column(String(255), nullable=True)
    embryo_transfer = Column(Boolean, default=False, nullable=False)
    in_transit = Column(Boolean, default=False, nullable=False)
    
    # Relationships
    cane = relationship("Cane", back_populates="cryolocks")
    embryos = relationship("Embryo", back_populates="cryolock", cascade="all, delete-orphan")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('cane_id', 'position_number', name='uq_cryolocks_cane_position'),
    )
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

