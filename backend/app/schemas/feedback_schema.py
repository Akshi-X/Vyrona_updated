from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from ..constants.enums import (
    FeedbackDepartment, FeedbackType, FeedbackPriority, 
    AffectedModule, FeedbackStatus
)


# ============================================
# REQUEST SCHEMAS
# ============================================

class FeedbackCreateRequest(BaseModel):
    """Schema for creating a new feedback ticket"""
    department: FeedbackDepartment
    feedback_type: FeedbackType
    subject: str
    description: str
    priority: FeedbackPriority
    affected_modules: List[AffectedModule]  # Multiple selection allowed
    send_email: bool = True  # Default to True for backward compatibility
    
    @field_validator('subject')
    @classmethod
    def validate_subject(cls, v):
        if not v or len(v.strip()) < 5:
            raise ValueError("Subject must be at least 5 characters long")
        return v.strip()
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v):
        if not v or len(v.strip()) < 10:
            raise ValueError("Description must be at least 10 characters long")
        return v.strip()
    
    @field_validator('affected_modules')
    @classmethod
    def validate_affected_modules(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one affected module must be selected")
        return v


class CommentCreateRequest(BaseModel):
    """Schema for adding a comment to a feedback ticket"""
    comment: str
    send_email: bool = True  # Default to True for backward compatibility
    
    @field_validator('comment')
    @classmethod
    def validate_comment(cls, v):
        if not v or len(v.strip()) < 1:
            raise ValueError("Comment cannot be empty")
        return v.strip()


class FeedbackStatusUpdateRequest(BaseModel):
    """Schema for updating feedback status"""
    status: FeedbackStatus
    send_email: bool = True  # Default to True for backward compatibility


# ============================================
# RESPONSE SCHEMAS
# ============================================

class FeedbackSummaryResponse(BaseModel):
    """Summary response for feedback list endpoints"""
    feedback_id: str  # Ticket ID
    feedback: str     # Subject
    type: str         # Feedback type
    status: str       # Current status
    submitted_on: datetime
    submitted_by_name: Optional[str] = None
    hospital_name: Optional[str] = None
    branch_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class CommentResponse(BaseModel):
    """Response schema for comments"""
    id: int
    comment: str
    commented_by: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class FeedbackDetailResponse(BaseModel):
    """Detailed response for individual feedback"""
    id: str
    ticket_id: str
    department: str
    feedback_type: str
    subject: str
    description: str
    priority: str
    affected_modules: List[str]  # List of affected modules
    status: str
    submitted_by: str
    submitted_by_email: str
    submitted_on: datetime
    created_at: datetime
    updated_at: Optional[datetime]
    comments: List[str] = []
    attachment_paths: List[str] = []
    
    class Config:
        from_attributes = True


class FeedbackCreateResponse(BaseModel):
    """Response for feedback creation"""
    message: str
    ticket_id: str
    feedback_id: str
    status: str


class CommentCreateResponse(BaseModel):
    """Response for comment creation"""
    message: str
    comment_id: int
    ticket_id: str


class FeedbackStatusUpdateResponse(BaseModel):
    """Response for status update"""
    message: str
    ticket_id: str
    old_status: str
    new_status: str


# ============================================
# FILTER SCHEMAS
# ============================================

class FeedbackFilterRequest(BaseModel):
    """Schema for filtering feedback tickets"""
    feedback_type: Optional[FeedbackType] = None
    status: Optional[FeedbackStatus] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    department: Optional[FeedbackDepartment] = None
    priority: Optional[FeedbackPriority] = None
    affected_modules: Optional[AffectedModule] = None  # Single module for filtering
