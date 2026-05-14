"""
Feedback Comments Model

Defines the Comment model for feedback system.
"""

import sqlalchemy
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from ..config.database import Base


class Comment(Base):
    __tablename__ = "feedback_comments"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Automatically set created_by to commented_by if not provided
        if hasattr(self, 'commented_by') and self.commented_by and not self.created_by:
            self.created_by = self.commented_by

    # Primary Key
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    
    # Foreign Key to Feedback
    ticket_id = sqlalchemy.Column(
        sqlalchemy.String, 
        sqlalchemy.ForeignKey('feedback.ticket_id'), 
        nullable=False
    )
    
    # Comment Details
    comment = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    commented_by = sqlalchemy.Column(
        sqlalchemy.String, 
        sqlalchemy.ForeignKey('users.user_id'), 
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
    )  # Automatically set to commented_by when record is created
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
    feedback = relationship("Feedback", back_populates="comments")
