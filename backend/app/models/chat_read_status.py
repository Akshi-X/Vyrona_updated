import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatReadStatus(Base):
    """
    Tracks the last read message for each user-patient combination.
    Uses a two-pointer approach: last_read_message_id points to the last message
    the user has read for a specific patient.
    
    NULL last_read_message_id means the user has never read any messages for this patient.
    """
    __tablename__ = "chat_read_status"

    # Composite Primary Key: (user_id, patient_id)
    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True, nullable=False)
    patient_id = Column(String, ForeignKey("patient.id"), primary_key=True, nullable=False)
    
    # Last Read Message ID
    # NULL = user has never read any messages for this patient
    # Non-NULL = user has read up to this message ID (inclusive)
    last_read_message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True)
    
    # Audit Trail
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User", backref="chat_read_statuses")
    patient = relationship("Patient", backref="chat_read_statuses")
    # Optional: relationship to the last read message (may be None)
    last_read_message = relationship("ChatMessage", foreign_keys=[last_read_message_id])
