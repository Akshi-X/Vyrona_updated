"""
Carrier Model
Represents actual transportation carriers (FedEx, Maersk, DHL Express, etc.)
"""

from sqlalchemy import Column, String, Integer, DateTime, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base


class Carrier(Base):
    """
    Carrier - Actual transportation companies that physically move shipments
    
    Examples:
    - FedEx Medical
    - Maersk Healthcare
    - DHL Express
    - UPS Healthcare
    - FedEx Logistics
    """
    __tablename__ = "carrier"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)  # e.g., "FedEx Medical", "Maersk Healthcare"
    carrier_type = Column(String, nullable=True)  # "Air", "Ground", "Ocean", "Rail", "Mixed"
    # Global flag: Controls if this carrier is available system-wide.
    # When False: NO providers can use this carrier (e.g., carrier went out of business, lost certification, temporarily suspended).
    is_active = Column(Boolean, default=True, nullable=False, comment="Global flag: Controls carrier availability system-wide. False = carrier unavailable for all providers")
    
    # Audit Trail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    # One-to-many with shipments
    shipments = relationship("Shipment", back_populates="carrier")
