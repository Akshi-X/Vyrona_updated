from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class Cryolock(Base):
    __tablename__ = "cryolocks"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    cryolock_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key
    cane_id = Column(Integer, ForeignKey("ivf.canes.cane_id"), nullable=False)
    
    # Cryolock Information
    cryolock_number = Column(String(255), nullable=True)
    cryolock_color = Column(String(255), nullable=True)
    
    # Relationships
    cane = relationship("Cane", back_populates="cryolocks")
    embryos = relationship("Embryo", back_populates="cryolock", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

