"""
Provider-Carrier Junction Table Model
Links Logistics Providers to Carriers (many-to-many relationship)
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base


class ProviderCarrier(Base):
    """
    Junction table for Provider-Carrier many-to-many relationship
    Tracks which carriers each logistics provider uses
    
    Example:
    - XPO Logistics can use: FedEx Medical, Maersk Healthcare, DHL Express
    - DHL Supply Chain can use: FedEx Medical, UPS Healthcare
    """
    __tablename__ = "provider_carrier"

    provider_id = Column(String, ForeignKey('provider.id', ondelete='CASCADE'), primary_key=True)
    carrier_id = Column(Integer, ForeignKey('carrier.id', ondelete='CASCADE'), primary_key=True)
    # Relationship-level flag: Controls if this specific provider can use this specific carrier.
    # When False: This provider cannot use this carrier (e.g., contract paused, quality issues, pricing concerns).
    # When True: This provider can use this carrier (assuming Carrier.is_active is also True).
    # This allows per-provider control while the carrier remains available to other providers.
    is_active = Column(Boolean, default=True, nullable=False, comment="Relationship-level flag: Controls if this provider can use this carrier. Allows per-provider control")
    
    # Audit Trail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships
    provider = relationship("Provider", back_populates="carrier_relationships")
    carrier = relationship("Carrier", back_populates="provider_relationships")

