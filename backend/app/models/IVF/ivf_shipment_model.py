from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Float, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class IVFShipment(Base):
    """
    Model to store IVF-specific shipment information.
    IVF shipments are single-leg (source to destination only).
    """
    __tablename__ = "ivf_shipment"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Shipment Identifiers
    shipment_id = Column(String(255), unique=True, nullable=False, index=True, 
                        comment="Auto-generated shipment ID (format: SHIP-YYYYMMDD-PATIENT_CRYLOCK_INFO_ID)")
    iot_shipment_id = Column(String(255), nullable=True, index=True, 
                            comment="Shipment ID returned from IoT API (Tive)")
    
    # Foreign Keys
    patient_crylock_info_id = Column(Integer, ForeignKey("patient_crylock_info.id", ondelete="CASCADE"), 
                                     name="cryolock_id",  # Map to actual database column name
                                     nullable=False, index=True, comment="Patient crylock info being shipped")
    source_branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id", ondelete="SET NULL"), 
                             nullable=False, index=True, comment="Source branch (current location)")
    destination_branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id", ondelete="SET NULL"), 
                                  nullable=False, index=True, comment="Destination branch")
    
    # Shipment Details
    description = Column(Text, nullable=True, comment="User-provided description of the transfer")
    device_id = Column(String(255), nullable=True, index=True, 
                       comment="IoT tracker device ID associated with this shipment")
    
    # Shipment Status
    shipment_status = Column(String(50), nullable=False, default="created",
                             comment="Status: created, in_transit, delivered, cancelled, failed")
    
    # Source Location Details (denormalized for quick access)
    source_location = Column(String(255), nullable=True, comment="Source location name")
    source_latitude = Column(Float, nullable=True, comment="Source latitude")
    source_longitude = Column(Float, nullable=True, comment="Source longitude")
    
    # Destination Location Details (denormalized for quick access)
    destination_location = Column(String(255), nullable=True, comment="Destination location name")
    destination_latitude = Column(Float, nullable=True, comment="Destination latitude")
    destination_longitude = Column(Float, nullable=True, comment="Destination longitude")
    
    # Timing Information
    departure_time = Column(DateTime, nullable=True, comment="Actual departure time")
    arrival_time = Column(DateTime, nullable=True, comment="Actual arrival time")
    scheduled_departure_time = Column(DateTime, nullable=True, comment="Scheduled departure time")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                       onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String(255), nullable=True, comment="User who created the shipment")
    updated_by = Column(String(255), nullable=True, comment="User who last updated the shipment")
    
    # Relationships
    patient_crylock_info = relationship("PatientCrylockInfo", backref="shipments")
    source_branch = relationship("HospitalBranch", foreign_keys=[source_branch_id], backref="source_shipments")
    destination_branch = relationship("HospitalBranch", foreign_keys=[destination_branch_id], backref="destination_shipments")
    
    # Composite indexes for common query patterns
    __table_args__ = (
        # Index for querying by shipment_id (most common)
        Index('idx_ivf_shipment_shipment_id', 'shipment_id'),
        # Index for querying by IoT shipment ID
        Index('idx_ivf_shipment_iot_id', 'iot_shipment_id'),
        # Index for querying by patient crylock info
        Index('idx_ivf_shipment_patient_crylock', 'patient_crylock_info_id'),  # SQLAlchemy maps to cryolock_id automatically
        # Index for querying by device
        Index('idx_ivf_shipment_device', 'device_id'),
        # Index for querying by status
        Index('idx_ivf_shipment_status', 'shipment_status'),
        # Index for querying by source/destination branches
        Index('idx_ivf_shipment_branches', 'source_branch_id', 'destination_branch_id'),
        # Index for querying by creation date
        Index('idx_ivf_shipment_created', 'created_at'),
    )
