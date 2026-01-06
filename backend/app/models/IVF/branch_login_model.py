from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, ForeignKey, Boolean, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship

from ...config.database import Base
from ...constants.enums import ApprovalStatus


class BranchLogin(Base):
    """
    Branch-level login accounts for hospital branches.
    Enforces one login per branch + department combination.
    Each branch login is associated with a branch and department.
    """
    __tablename__ = "branch_logins"
    __table_args__ = (
        UniqueConstraint('branch_id', 'department', name='uq_branch_login_branch_department'),
        {'schema': 'ivf'}
    )

    # Primary Key
    login_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key - reference to branch
    branch_id = Column(Integer, ForeignKey("ivf.hospital_branches.branch_id"), nullable=False, index=True)
    
    # Login Credentials
    email = Column(String(255), unique=True, nullable=False, index=True)  # Official branch email
    password_hash = Column(String(255), nullable=False)
    
    # Department/Specialization
    department = Column(String(100), nullable=False)  # IVF, Oncology, CGT, etc.
    
    # Account Status / Verification
    is_active = Column(Boolean, default=False, nullable=False)  # Activated after email verification
    is_verified = Column(Boolean, default=False, nullable=False)
    approved_status = Column(String(20), default=ApprovalStatus.PENDING.value, nullable=False)
    verification_token = Column(String(255), nullable=True, index=True)
    verification_token_expiry = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    
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

