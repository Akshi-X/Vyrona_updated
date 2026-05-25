from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatReadStatusRefrigerator(Base):
    """
    Tracks the last read message for each (user, refrigerator) combination.
    Uses the same two-pointer approach as ChatReadStatusIncubator.
    """
    __tablename__ = "chat_read_status_refrigerator"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True, nullable=False)
    refrigerator_id = Column(Integer, ForeignKey("refrigerators.refrigerator_id"), primary_key=True, nullable=False)

    last_read_message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="chat_read_statuses_refrigerator")
    refrigerator = relationship("Refrigerator", backref="chat_read_statuses")
    last_read_message = relationship("ChatMessage", foreign_keys=[last_read_message_id])
