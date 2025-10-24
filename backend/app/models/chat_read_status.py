import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatReadStatus(Base):
    __tablename__ = "chat_read_status"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Message Reference
    message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=False)
    
    # User Reference
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    
    # Read Status
    read_at = Column(DateTime, nullable=True)  # When user read the message
    is_read = Column(Boolean, default=False, nullable=False)
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    message = relationship("ChatMessage", back_populates="read_statuses")
    user = relationship("User", backref="message_read_statuses")
