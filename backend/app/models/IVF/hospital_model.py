from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ...config.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"
    # Removed schema separation - using default schema for authentication models

    # Primary Key
    hospital_id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Hospital Information
    hospital_name = Column(String(255), nullable=False)
    hospital_type = Column(String(255), nullable=True)
    hospital_head_email = Column(String(255), nullable=True)
    is_email_notifify = Column(Boolean, nullable=False, default=True)
    is_whatsapp_notify = Column(Boolean, nullable=False, default=False)

    # Relationships
    branches = relationship(
        "HospitalBranch", back_populates="hospital", cascade="all, delete-orphan"
    )
    incubators = relationship(
        "Incubator", back_populates="hospital", cascade="all, delete-orphan"
    )
    ui_variants = relationship(
        "UIRouteVariant", back_populates="hospital", cascade="all, delete-orphan"
    )

    # Audit Trail
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
