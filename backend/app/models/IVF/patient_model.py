from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFPatient(Base):
    __tablename__ = "patients"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    patient_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Patient Information
    his_number = Column(String(255), nullable=True)
    
    # Relationships
    embryos = relationship("Embryo", back_populates="patient", cascade="all, delete-orphan")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

