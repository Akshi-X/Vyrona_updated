import sqlalchemy
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Index
from sqlalchemy.orm import relationship

from ..config.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Message Content
    message_content = Column(Text, nullable=False)
    
    # Patient Reference (for CGT flow)
    patient_id = Column(String, ForeignKey("patient.id"), nullable=True, index=True)
    
    # Canister Reference (for IVF flow)
    canister_id = Column(Integer, ForeignKey("canisters.canister_id"), nullable=True, index=True)
    
    # Sender Information
    sender_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    # Note: sender_role removed - use sender_id relationship to User table to get role
    
    # Tagged Users (JSON array of user IDs)
    tagged_user_ids = Column(Text, nullable=True)  # JSON string of user IDs
    
    # Audit Trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # Relationships
    patient = relationship("Patient", backref="chat_messages")
    canister = relationship("Canister", backref="chat_messages")
    sender = relationship("User", foreign_keys=[sender_id], backref="sent_messages")
    # Note: read_statuses relationship removed - ChatReadStatus now uses composite PK (user_id, patient_id)
    # and tracks last_read_message_id instead of per-message read status
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_chat_messages_patient_created', 'patient_id', 'created_at'),
        Index('idx_chat_messages_canister_created', 'canister_id', 'created_at'),
    )
