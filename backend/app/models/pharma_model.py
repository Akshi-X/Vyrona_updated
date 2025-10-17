import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship

from ..config.database import Base


class Pharma(Base):
    __tablename__ = "pharma"

    # Primary Key
    id = Column(String, primary_key=True, index=True)
    
    # Pharma Information
    pharma_name = Column(String, nullable=False, unique=True, index=True)
    location = Column(String, nullable=True)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships (commented out until other models are updated)
    # therapy_parameters = relationship("TherapyParameter", back_populates="pharma")
    # patients = relationship("Patient", back_populates="pharma")
    # shipments = relationship("Shipment", back_populates="pharma")
    # iot_data = relationship("IOTData", back_populates="pharma")
    # geolocations = relationship("Geolocation", back_populates="pharma")

