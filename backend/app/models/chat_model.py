import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Message Content
    message_content = Column(Text, nullable=False)
    
    # Patient Reference (from existing patient table)
    patient_id = Column(String, ForeignKey("patient.id"), nullable=False)
    
    # Sender Information
    sender_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    
    # Tagged Users (JSON array of user IDs)
    tagged_user_ids = Column(Text, nullable=True)  # JSON string of user IDs
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    patient = relationship("Patient", backref="chat_messages")
    sender = relationship("User", foreign_keys=[sender_id], backref="sent_messages")
    read_statuses = relationship("ChatReadStatus", back_populates="message", cascade="all, delete-orphan")
