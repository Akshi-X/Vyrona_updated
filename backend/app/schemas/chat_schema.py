from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime


# ============================================
# REQUEST SCHEMAS
# ============================================

class ChatMessageCreateRequest(BaseModel):
    """Schema for creating a new chat message"""
    patient_id: Optional[str] = None  # For CGT flow
    canister_number: Optional[str] = None  # For IVF flow (e.g., "C1")
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
    
    @model_validator(mode='after')
    def validate_patient_or_canister(self):
        """Validate that either patient_id or canister_number is provided"""
        # Treat empty strings as None
        patient_id = self.patient_id.strip() if self.patient_id and isinstance(self.patient_id, str) else self.patient_id
        canister_number = self.canister_number.strip() if self.canister_number and isinstance(self.canister_number, str) else self.canister_number
        
        # If both are None/empty, raise error
        if not patient_id and not canister_number:
            raise ValueError("Either patient_id (for CGT) or canister_number (for IVF) must be provided")
        
        # If both are provided, raise error
        if patient_id and canister_number:
            raise ValueError("Cannot provide both patient_id and canister_number. Use patient_id for CGT or canister_number for IVF")
        
        # Update the model with cleaned values
        self.patient_id = patient_id if patient_id else None
        self.canister_number = canister_number if canister_number else None
        return self
    
    @field_validator('tagged_user_ids')
    @classmethod
    def validate_tagged_user_ids(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("Tagged user IDs must be a list")
        # Ensure all items are strings and remove duplicates/empty strings
        valid_ids = []
        for uid in v:
            if uid is None:
                continue
            # Convert to string if not already
            uid_str = str(uid).strip() if uid else ""
            if uid_str:
                valid_ids.append(uid_str)
        # Remove duplicates
        unique_ids = list(set(valid_ids))
        return unique_ids


# ============================================
# RESPONSE SCHEMAS
# ============================================

class ChatMessageResponse(BaseModel):
    """Schema for chat message response"""
    id: int
    message_content: str
    patient_id: Optional[str] = None  # For CGT flow
    canister_number: Optional[str] = None  # For IVF flow (e.g., "C1")
    sender_id: str
    sender_name: str
    sender_role: Optional[str] = None
    tagged_user_ids: List[str]
    tagged_user_names: Optional[List[str]] = None
    created_at: datetime
    is_read: bool = False
    read_at: Optional[datetime] = None
    # Note: Frontend can derive was_unread = !is_read for unread separator bar
    
    class Config:
        from_attributes = True


class ChatMessageCreateResponse(BaseModel):
    """Schema for chat message creation response"""
    message_id: int
    patient_id: Optional[str] = None  # For CGT flow
    canister_number: Optional[str] = None  # For IVF flow (e.g., "C1")
    message_content: str
    sender_id: str
    sender_name: str
    sender_role: Optional[str] = None
    tagged_user_ids: List[str]
    tagged_user_names: Optional[List[str]] = None
    created_at: datetime
    success: bool = True
    message: str = "Message sent successfully"
    
    class Config:
        from_attributes = True
        # Pydantic v2 uses model_serializer instead of json_encoders
        # FastAPI will handle datetime serialization automatically


class PatientMessagesResponse(BaseModel):
    """Schema for patient/canister messages response"""
    patient_id: Optional[str] = None  # For CGT flow
    canister_number: Optional[str] = None  # For IVF flow (e.g., "C1")
    patient_name: Optional[str] = None  # Patient name for CGT
    messages: List[ChatMessageResponse]
    total_messages: int
    unread_count: int = 0
    
    class Config:
        from_attributes = True


class UnreadMessageResponse(BaseModel):
    """Schema for unread message response"""
    message_id: int
    message_content: str
    patient_id: Optional[str] = None  # For CGT flow
    canister_number: Optional[str] = None  # For IVF flow (e.g., "C1")
    patient_name: Optional[str] = None  # Patient name for CGT
    sender_id: str
    sender_name: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UnreadMessagesResponse(BaseModel):
    """Schema for unread messages response"""
    unread_messages: List[UnreadMessageResponse]
    total_unread: int
    unread_by_patient: dict  # {patient_id: count} for CGT
    unread_by_canister: dict  # {canister_number: count} for IVF
    
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