"""
Chat Message Tag Model

Priority 5: Normalized junction table for tagged users.
Replaces JSON string storage with proper relational structure for better query performance.
"""
import sqlalchemy
from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatMessageTag(Base):
    """
    Junction table for chat message tags.
    
    Represents a many-to-many relationship between chat messages and tagged users.
    This replaces the JSON string storage in chat_messages.tagged_user_ids for better:
    - Query performance (can use SQL JOINs and indexes)
    - Data integrity (foreign key constraints)
    - Scalability (no JSON parsing overhead)
    """
    __tablename__ = "chat_message_tags"

    # Composite Primary Key
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), primary_key=True, nullable=False)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True, nullable=False)
    
    # Relationships
    message = relationship("ChatMessage", backref="tags")
    user = relationship("User", backref="tagged_messages")
    
    # Indexes for common query patterns
    __table_args__ = (
        Index('idx_chat_message_tags_user_id', 'user_id'),  # For finding all messages tagged to a user
        Index('idx_chat_message_tags_message_id', 'message_id'),  # For finding all tags for a message
    )

