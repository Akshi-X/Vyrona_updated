from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Literal, List
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
    pharma_id: Optional[int]
    company_name: Optional[str]  # Will be populated from pharma table
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
    pharma_id: Optional[int]
    company_name: Optional[str]  # Will be populated from pharma table
    approval_status: str
    approval_sent_to: str  # Who the approval email was sent to


class UserListItem(BaseModel):
    """Schema for user item in list"""
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    pharma_id: Optional[int]
    company_name: Optional[str]  # Will be populated from pharma table
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Response schema for listing all users"""
    total_users: int
    users: List[UserListItem]


class UserNameUpdateRequest(BaseModel):
    """Schema for updating user first and last name"""
    first_name: str
    last_name: str
    
    @field_validator('first_name', 'last_name')
    @classmethod
    def validate_names(cls, v):
        """Validate that names are not empty and contain only valid characters."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters long")
        if len(v.strip()) > 50:
            raise ValueError("Name cannot exceed 50 characters")
        return v.strip()


class UserUpdateResponse(BaseModel):
    """Response schema for user update operations"""
    message: str
    user_id: str
    first_name: str
    last_name: str
    updated_at: datetime
