from sqlalchemy import Column, String, Integer, DateTime, LargeBinary, Enum as SQLEnum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base


class Patient(Base):
    __tablename__ = "patient"

    id = Column(String, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    therapy_id = Column(String, nullable=True)  # Removed ForeignKey constraint
    insurance_provider = Column(String, nullable=True)
    insurance_type = Column(String, nullable=True)
    docs_report = Column(LargeBinary, nullable=True)
    hospital_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    provider_id = Column(String, ForeignKey("provider.id"), nullable=True)
    pharma_id = Column(String, ForeignKey("pharma.id"), nullable=True)
    stage = Column(SQLEnum('Scheduled', 'Apheresis', 'Cryopreservation', 'Transportation', 'Reengineering', 'Reinfusion', name='patient_stage'), nullable=True, default='Scheduled')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    provider = relationship("Provider", back_populates="patients")
    pharma = relationship("Pharma", back_populates="patients")
