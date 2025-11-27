import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Enum as SQLEnum, Integer, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import ApprovalStatus, UserRole


class User(Base):
    __tablename__ = "users"

    # Primary Key - Custom generated user_id (USR-XXXXXX format)
    user_id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, index=True)
    
    # Basic User Information
    first_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    last_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    email = sqlalchemy.Column(sqlalchemy.String, unique=True, nullable=False, index=True)
    password_hash = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    
    # Role and Company
    # Schema validator normalizes any case input to title case before reaching database
    # ENUM ensures database-level validation (Admin, Manager, User, Pharma_admin, Mygrape_admin)
    role = sqlalchemy.Column(SQLEnum(UserRole, values_callable=lambda obj: [e.value for e in obj], name='user_role'), nullable=False, index=True)
    pharma_id = sqlalchemy.Column(Integer, ForeignKey("pharma.id"), nullable=True)
    
    # Account Status
    status = sqlalchemy.Column(sqlalchemy.Boolean, default=False)  # Account active/inactive
    approved_status = sqlalchemy.Column(SQLEnum(ApprovalStatus, values_callable=lambda obj: [e.value for e in obj], name='approval_status'), default=ApprovalStatus.PENDING)
    
    # Approval Audit Trail
    approved_by = sqlalchemy.Column(sqlalchemy.String, nullable=True)  # User ID of approver
    approved_on = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)  # When approved
    
    # Security - Account Locking (Brute Force Protection)
    is_locked = sqlalchemy.Column(sqlalchemy.Boolean, default=False)  # Is account locked
    lock_expiry = sqlalchemy.Column(sqlalchemy.DateTime(timezone=True), nullable=True)  # When lock expires (30 min)
    login_attempts = sqlalchemy.Column(sqlalchemy.Integer, default=0)  # Failed login counter
    
    # Password Security
    last_password_changed = sqlalchemy.Column(sqlalchemy.DateTime, default=lambda: datetime.now(timezone.utc))
    last_password_reset_request = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)  # Audit: last reset request
    password_reset_count = sqlalchemy.Column(sqlalchemy.Integer, default=0)  # Audit: total reset attempts
    
    # Session Management
    session_timeout = sqlalchemy.Column(sqlalchemy.Integer, default=30)  # Minutes (custom per user)
    last_login = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)  # Last successful login
    
    # Audit Trail
    created_by = sqlalchemy.Column(sqlalchemy.String, nullable=True)  # Who created this user
    updated_by = sqlalchemy.Column(sqlalchemy.String, nullable=True)  # Who last updated
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)
    
    # Relationships
    otps = relationship("OTP", back_populates="user", cascade="all, delete-orphan")
    pharma_company = relationship("Pharma", foreign_keys="[User.pharma_id]", back_populates="users")
