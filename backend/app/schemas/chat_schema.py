from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime


# ============================================
# REQUEST SCHEMAS
# ============================================

class ChatMessageCreateRequest(BaseModel):
    """Schema for creating a new chat message"""
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    incubator_id: Optional[int] = None  # For incubator tracking
    chamber_id: Optional[str] = None  # Optional chamber within an incubator
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
    def validate_patient_or_tank(self):
        """Validate that exactly one of patient_id, tank_code, incubator_id is provided"""
        patient_id = self.patient_id.strip() if self.patient_id and isinstance(self.patient_id, str) else self.patient_id
        tank_code = self.tank_code.strip() if self.tank_code and isinstance(self.tank_code, str) else self.tank_code
        incubator_id = self.incubator_id

        provided = [bool(patient_id), bool(tank_code), incubator_id is not None]
        if sum(provided) == 0:
            raise ValueError("One of patient_id (CGT), tank_code (IVF), or incubator_id must be provided")
        if sum(provided) > 1:
            raise ValueError("Provide only one of patient_id, tank_code, or incubator_id")

        self.patient_id = patient_id if patient_id else None
        self.tank_code = tank_code if tank_code else None
        if self.chamber_id and not incubator_id:
            self.chamber_id = None
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
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    incubator_id: Optional[int] = None
    chamber_id: Optional[str] = None
    sender_id: str
    sender_name: str
    sender_role: Optional[str] = None
    tagged_user_ids: List[str]
    tagged_user_names: Optional[List[str]] = None
    created_at: datetime
    is_read: bool = False
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChatMessageCreateResponse(BaseModel):
    """Schema for chat message creation response"""
    message_id: int
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    incubator_id: Optional[int] = None
    chamber_id: Optional[str] = None
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
    """Schema for patient/tank messages response"""
    patient_id: Optional[str] = None  # For CGT flow
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
    patient_name: Optional[str] = None  # Patient name for CGT
    messages: List[ChatMessageResponse]
    total_messages: int
    unread_count: int = 0

    class Config:
        from_attributes = True


class IncubatorMessagesResponse(BaseModel):
    """Schema for incubator messages response"""
    incubator_id: int
    chamber_id: Optional[str] = None
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
    tank_code: Optional[str] = None  # For IVF flow (e.g., "T1")
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
    unread_by_tank: dict  # {tank_code: count} for IVF
    
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