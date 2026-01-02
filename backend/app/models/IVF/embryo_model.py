from datetime import datetime, timezone, date
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Date, Boolean
from sqlalchemy.orm import relationship

from ...config.database import Base


class Embryo(Base):
    __tablename__ = "embryos"
    __table_args__ = {'schema': 'ivf'}

    # Primary Key
    embryo_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    patient_id = Column(Integer, ForeignKey("ivf.patients.patient_id"), nullable=False)
    cryolock_id = Column(Integer, ForeignKey("ivf.cryolocks.cryolock_id"), nullable=False)
    
    # Embryo Information
    date_of_vitrification = Column(Date, nullable=True)
    embryo_grading = Column(String(255), nullable=True)
    status = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    patient = relationship("IVFPatient", back_populates="embryos")
    cryolock = relationship("Cryolock", back_populates="embryos")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

