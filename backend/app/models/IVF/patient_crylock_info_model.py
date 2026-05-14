from datetime import datetime, timezone, date
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Boolean, Date, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from ...config.database import Base


class PatientCrylockInfo(Base):
    __tablename__ = "patient_crylock_info"
    # Removed schema separation - using default schema

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Keys
    branch_id = Column(Integer, ForeignKey("hospital_branches.branch_id"), nullable=False, index=True, comment="Branch ID based on siteName")
    tank_id = Column(Integer, ForeignKey("tanks.tank_id"), nullable=False, index=True, comment="Reference to tank")
    
    # Patient Information
    his_number = Column(String(255), nullable=False, index=True, comment="Patient Hospital Information System number")
    
    # Cryolock Information
    crylock_number = Column(String(255), nullable=False, comment="Full cryolock number from ARC API (e.g., 'T10/C5/E1/3')")
    
    # Extracted Components from cryolockNumber
    tank_code = Column(String(255), nullable=True, comment="Tank code extracted from cryolockNumber (e.g., 'T10')")
    canister_number = Column(String(255), nullable=True, comment="Canister number extracted from cryolockNumber (e.g., 'C5')")
    cane_code = Column(String(255), nullable=True, comment="Cane code extracted from cryolockNumber (e.g., 'E1')")
    position_number = Column(Integer, nullable=True, comment="Position number extracted from cryolockNumber (e.g., 3)")
    
    # ARC API IDs
    tank_id_arc = Column(String(255), nullable=True, comment="Tank ID from ARC API (e.g., '5471')")
    cane_id_arc = Column(String(255), nullable=True, comment="Cane ID from ARC API (e.g., '5471')")
    
    # Cryolock Details
    date_of_vitrification = Column(Date, nullable=True, comment="Date when the embryo(s) in this cryolock were vitrified")
    crylock_color = Column(String(255), nullable=True, comment="Cryolock color")
    goblet_color = Column(String(255), nullable=True, comment="Goblet color")
    in_transit = Column(Boolean, default=False, nullable=False, comment="Whether the cryolock is in transit")
    embryo_transfer = Column(Boolean, default=False, nullable=False, comment="Whether the cryolock has been moved to embryo transfer")
    description = Column(String(500), nullable=True, comment="Description or notes about the cryolock")
    
    # Relationships
    branch = relationship("HospitalBranch", foreign_keys=[branch_id])
    tank = relationship("Tank", foreign_keys=[tank_id], back_populates="patient_crylocks")
    
    # Constraints and Indexes
    __table_args__ = (
        UniqueConstraint('his_number', 'crylock_number', name='uq_patient_crylock_his_crylock'),
        # Index for filtering by embryo_transfer (common query pattern)
        Index('idx_patient_crylock_embryo_transfer', 'embryo_transfer'),
        # Composite index for common query: branch_id + embryo_transfer
        Index('idx_patient_crylock_branch_embryo_transfer', 'branch_id', 'embryo_transfer'),
    )
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
