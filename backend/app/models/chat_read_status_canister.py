import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatReadStatusCanister(Base):
    """
    Tracks the last read message for each user-canister combination (IVF flow).
    Uses a two-pointer approach: last_read_message_id points to the last message
    the user has read for a specific canister.
    
    NULL last_read_message_id means the user has never read any messages for this canister.
    """
    __tablename__ = "chat_read_status_canister"

    # Composite Primary Key: (user_id, canister_id)
    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True, nullable=False)
    canister_id = Column(Integer, ForeignKey("canisters.canister_id"), primary_key=True, nullable=False)
    
    # Last Read Message ID
    # NULL = user has never read any messages for this canister
    # Non-NULL = user has read up to this message ID (inclusive)
    last_read_message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True)
    
    # Audit Trail
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User", backref="chat_read_statuses_canister")
    canister = relationship("Canister", backref="chat_read_statuses")
    # Optional: relationship to the last read message (may be None)
    last_read_message = relationship("ChatMessage", foreign_keys=[last_read_message_id])
