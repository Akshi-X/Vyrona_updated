from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatReadStatusIncubator(Base):
    """
    Tracks the last read message for each (user, incubator, chamber) combination.
    chamber_id=None means the user is viewing messages at the incubator level (all chambers).
    Uses the same two-pointer approach as ChatReadStatusCanister.
    """
    __tablename__ = "chat_read_status_incubator"

    # Composite Primary Key: (user_id, incubator_id, chamber_id)
    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True, nullable=False)
    incubator_id = Column(Integer, ForeignKey("incubators.incubator_id"), primary_key=True, nullable=False)
    # NULL chamber_id = incubator-level view (all chambers); mirrors kpi_config convention
    chamber_id = Column(String(255), primary_key=True, nullable=True)

    last_read_message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="chat_read_statuses_incubator")
    incubator = relationship("Incubator", backref="chat_read_statuses")
    last_read_message = relationship("ChatMessage", foreign_keys=[last_read_message_id])
