from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base


class Pharma(Base):
    __tablename__ = "pharma"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pharma_name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="pharma")
    patients = relationship("Patient", back_populates="pharma")
    providers = relationship("Provider", back_populates="pharma")

    # Relationships (commented out until other models are updated)
    # therapy_parameters = relationship("TherapyParameter", back_populates="pharma")
    # shipments = relationship("Shipment", back_populates="pharma")
    # iot_data = relationship("IOTData", back_populates="pharma")
    # geolocations = relationship("Geolocation", back_populates="pharma")

