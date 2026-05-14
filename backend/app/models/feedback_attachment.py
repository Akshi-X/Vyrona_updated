import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy.orm import relationship

from ..config.database import Base


class FeedbackAttachment(Base):
    __tablename__ = "feedback_attachments"
    
    # Primary Key
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True, autoincrement=True)
    
    # Foreign Key to Feedback
    ticket_id = sqlalchemy.Column(
        sqlalchemy.String, 
        sqlalchemy.ForeignKey('feedback.ticket_id', ondelete='CASCADE'), 
        nullable=False,
        index=True
    )
    
    # File Information
    original_filename = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    stored_filename = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    file_path = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    file_size = sqlalchemy.Column(sqlalchemy.Integer, nullable=False)  # Size in bytes
    mime_type = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    
    # Timestamps
    uploaded_at = sqlalchemy.Column(
        sqlalchemy.DateTime, 
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    uploaded_by = sqlalchemy.Column(
        sqlalchemy.String, 
        nullable=False
    )
    
    # Relationships
    feedback = relationship("Feedback", back_populates="attachments")
