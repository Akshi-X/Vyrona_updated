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
    feedback = relationship("Feedback", back_populates="comments")
