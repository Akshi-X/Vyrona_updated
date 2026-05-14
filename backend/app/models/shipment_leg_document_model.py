from sqlalchemy import Column, String, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from ..config.database import Base


class ShipmentLegDocument(Base):
    """Model to store document checklist for shipment legs"""
    __tablename__ = "shipment_leg_document"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key
    shipment_leg_id = Column(Integer, ForeignKey("shipment_leg.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Document Information
    document_name = Column(String, nullable=False)
    is_missing = Column(Boolean, nullable=False, default=True)
    
    # Relationships
    shipment_leg = relationship("ShipmentLeg", backref="documents")

