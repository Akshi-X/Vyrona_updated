from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Literal
from datetime import datetime

class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    confirm_password: str
    role: Literal['admin', 'manager', 'user']
    company_name: str
    
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        """Validate role is lowercase."""
        if v not in ['admin', 'manager', 'user']:
            raise ValueError("Role must be 'admin', 'manager', or 'user'")
        return v.lower()

class UserResponse(BaseModel):
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    company_name: str
    status: bool
    approved_status: str
    approved_by: Optional[str]
    approved_on: Optional[datetime]
    is_locked: bool
    login_attempts: int
    last_login: Optional[datetime]
    session_timeout: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class UserRegistrationResponse(BaseModel):
    """Response for user registration with approval status message"""
    message: str
    user_id: str
    email: str
    role: str
    company_name: str
    approval_status: str
    approval_sent_to: str  # Who the approval email was sent to
