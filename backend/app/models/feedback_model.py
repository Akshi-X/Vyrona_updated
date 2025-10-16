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

    # Primary Key - Auto-generated Ticket ID (TK-YYYY-MM-nnn format)
    ticket_id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, index=True)
    
    # Feedback Details
    department = sqlalchemy.Column(
        SQLEnum(FeedbackDepartment, name='feedback_department'), 
        nullable=False
    )
    feedback_type = sqlalchemy.Column(
        SQLEnum(FeedbackType, name='feedback_type'), 
        nullable=False
    )
    subject = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    description = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    attachment_path = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    
    # Classification
    priority = sqlalchemy.Column(
        SQLEnum(FeedbackPriority, name='feedback_priority'), 
        nullable=False
    )
    affected_modules = sqlalchemy.Column(
        SQLEnum(AffectedModule, name='affected_module'), 
        nullable=False
    )
    
    # Status and Assignment
    status = sqlalchemy.Column(
        SQLEnum(FeedbackStatus, name='feedback_status'), 
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
    
    # Audit Trail
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        nullable=True
    )
    created_by = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    updated_by = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    
    # Relationships
    comments = relationship("Comment", back_populates="feedback", cascade="all, delete-orphan")


