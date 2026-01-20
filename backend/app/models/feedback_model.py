import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..config.database import Base
from ..constants.enums import (
    FeedbackDepartment, FeedbackType, FeedbackPriority, 
    AffectedModule, FeedbackStatus
)


class Feedback(Base):
    __tablename__ = "feedback"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Automatically set created_by to submitted_by if not provided
        if hasattr(self, 'submitted_by') and self.submitted_by and not self.created_by:
            self.created_by = self.submitted_by

    # Primary Key - Auto-generated Ticket ID (TK-YYYY-MM-nnn format)
    ticket_id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, index=True)
    
    # Feedback Details
    department = sqlalchemy.Column(
        SQLEnum(FeedbackDepartment, values_callable=lambda obj: [e.value for e in obj], name='feedback_department'), 
        nullable=False
    )
    feedback_type = sqlalchemy.Column(
        SQLEnum(FeedbackType, values_callable=lambda obj: [e.value for e in obj], name='feedback_type'), 
        nullable=False
    )
    subject = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    description = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    
    # Classification
    priority = sqlalchemy.Column(
        SQLEnum(FeedbackPriority, values_callable=lambda obj: [e.value for e in obj], name='feedback_priority'), 
        nullable=False
    )
    affected_modules = sqlalchemy.Column(
        sqlalchemy.String(500),  # Increased size to accommodate multiple comma-separated modules
        nullable=False
    )
    
    # Status and Assignment
    status = sqlalchemy.Column(
        SQLEnum(FeedbackStatus, values_callable=lambda obj: [e.value for e in obj], name='feedback_status'), 
        default=FeedbackStatus.OPEN,
        nullable=False
    )
    
    # User References
    submitted_by = sqlalchemy.Column(
        sqlalchemy.String, 
        sqlalchemy.ForeignKey('users.user_id'), 
        nullable=False
    )
    submitted_on = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # Audit Trail - All set automatically
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )  # Automatically set to current timestamp when record is created
    created_by = sqlalchemy.Column(
        sqlalchemy.String, 
        nullable=True,
        default=lambda: None
    )  # Automatically set to submitted_by when record is created
    updated_at = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        nullable=True,
        onupdate=lambda: datetime.now(timezone.utc)
    )  # Automatically set when record is updated
    updated_by = sqlalchemy.Column(
        sqlalchemy.String, 
        nullable=True
    )  # Automatically set to current user when record is updated
    
    # Relationships
    comments = relationship("Comment", back_populates="feedback", cascade="all, delete-orphan")
    attachments = relationship("FeedbackAttachment", back_populates="feedback", cascade="all, delete-orphan")


