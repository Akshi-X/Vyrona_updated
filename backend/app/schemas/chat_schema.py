from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


# ============================================
# REQUEST SCHEMAS
# ============================================

class ChatMessageCreateRequest(BaseModel):
    """Schema for creating a new chat message"""
    patient_id: str
    message_content: str
    tagged_user_ids: Optional[List[str]] = []
    
    @field_validator('message_content')
    @classmethod
    def validate_message_content(cls, v):
        if not v or len(v.strip()) < 1:
            raise ValueError("Message content cannot be empty")
        if len(v.strip()) > 1000:
            raise ValueError("Message content cannot exceed 1000 characters")
        return v.strip()
    
    @field_validator('patient_id')
    @classmethod
    def validate_patient_id(cls, v):
        if not v or len(v.strip()) < 1:
            raise ValueError("Patient ID cannot be empty")
        return v.strip()
    
    @field_validator('tagged_user_ids')
    @classmethod
    def validate_tagged_user_ids(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("Tagged user IDs must be a list")
        # Remove duplicates and empty strings
        unique_ids = list(set([uid.strip() for uid in v if uid and uid.strip()]))
        return unique_ids


# ============================================
# RESPONSE SCHEMAS
# ============================================

class ChatMessageResponse(BaseModel):
    """Schema for chat message response"""
    id: int
    message_content: str
    patient_id: str
    sender_id: str
    sender_name: str
    tagged_user_ids: List[str]
    created_at: datetime
    is_read: bool = False
    read_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ChatMessageCreateResponse(BaseModel):
    """Schema for chat message creation response"""
    message_id: int
    patient_id: str
    message_content: str
    sender_id: str
    sender_name: str
    tagged_user_ids: List[str]
    created_at: datetime
    success: bool = True
    message: str = "Message sent successfully"
    
    class Config:
        from_attributes = True


class PatientMessagesResponse(BaseModel):
    """Schema for patient messages response"""
    patient_id: str
    patient_name: Optional[str] = None
    messages: List[ChatMessageResponse]
    total_messages: int
    unread_count: int = 0
    
    class Config:
        from_attributes = True


class UnreadMessageResponse(BaseModel):
    """Schema for unread message response"""
    message_id: int
    message_content: str
    patient_id: str
    patient_name: Optional[str] = None
    sender_id: str
    sender_name: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UnreadMessagesResponse(BaseModel):
    """Schema for unread messages response"""
    unread_messages: List[UnreadMessageResponse]
    total_unread: int
    unread_by_patient: dict  # {patient_id: count}
    
    class Config:
        from_attributes = True


# ============================================
# ERROR RESPONSE SCHEMAS
# ============================================

class ChatErrorResponse(BaseModel):
    """Schema for chat error response"""
    success: bool = False
    error_code: str
    message: str
    details: Optional[str] = None
    
    class Config:
        from_attributes = True