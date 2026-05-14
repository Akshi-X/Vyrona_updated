import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship

from ..config.database import Base


class Therapy(Base):
    """Model to store therapy threshold parameters for each shipment leg"""
    __tablename__ = "therapy"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - Links to shipment leg (indexed for fast lookups)
    shipment_leg_id = Column(Integer, ForeignKey("shipment_leg.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    
    # Therapy Information
    therapy_name = Column(String, nullable=False, comment="Name of the therapy")
    therapy_description = Column(Text, nullable=True, comment="Description of the therapy")
    
    # Temperature Thresholds
    temperature_min = Column(Float, nullable=True, comment="Minimum temperature threshold in °C")
    temperature_max = Column(Float, nullable=True, comment="Maximum temperature threshold in °C")
    temperature_unit = Column(String, default="°C", nullable=False, comment="Unit for temperature (default: °C)")
    
    # Agitation Thresholds
    agitation_min = Column(Float, nullable=True, comment="Minimum agitation threshold")
    agitation_max = Column(Float, nullable=True, comment="Maximum agitation threshold")
    agitation_unit = Column(String, default="%", nullable=False, comment="Unit for agitation (default: %)")
    
    # Humidity Thresholds
    humidity_min = Column(Float, nullable=True, comment="Minimum humidity threshold in %")
    humidity_max = Column(Float, nullable=True, comment="Maximum humidity threshold in %")
    humidity_unit = Column(String, default="%", nullable=False, comment="Unit for humidity (default: %)")
    
    # Audit Trail (indexed for date range queries)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    shipment_leg = relationship("ShipmentLeg", back_populates="therapy")

