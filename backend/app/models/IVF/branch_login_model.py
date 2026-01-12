from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship

from ...config.database import Base
from ...constants.enums import ApprovalStatus


class BranchLogin(Base):
    """
    Branch-level login accounts for hospital branches.
    Multiple users/managers can exist for the same branch and department.
    Each branch login is associated with a branch and department.
    """
    __tablename__ = "branch_logins"
    __table_args__ = (
        {'schema': 'ivf'}
    )

    # Primary Key
    login_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to branch
    branch_id = Column(Integer, ForeignKey("ivf.hospital_branches.branch_id"), nullable=False, index=True)
    
    # Login Credentials
    email = Column(String(255), unique=True, nullable=False, index=True)  # Official branch email
    password_hash = Column(String(255), nullable=False)
    
    # User Information
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False)  # User or Manager
    
    # Department/Specialization
    department = Column(String(100), nullable=False)  # IVF, Oncology, CGT, etc.
    
    # Account Status / Approval
    is_active = Column(Boolean, default=False, nullable=False)  # Activated after approval
    approved_status = Column(String(20), default=ApprovalStatus.PENDING.value, nullable=False)
    approved_by = Column(String, nullable=True)  # User ID of approver
    approved_on = Column(DateTime(timezone=True), nullable=True)  # When approved
    
    # Security - Account Locking
    is_locked = Column(Boolean, default=False)
    lock_expiry = Column(DateTime(timezone=True), nullable=True)
    login_attempts = Column(Integer, default=0)
    
    # Password Security
    last_password_changed = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_password_reset_request = Column(DateTime, nullable=True)
    password_reset_count = Column(Integer, default=0)
    
    # Session Management
    session_timeout = Column(Integer, default=30)  # Minutes
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    branch = relationship("HospitalBranch", back_populates="branch_logins")
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

