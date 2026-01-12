from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Optional, Literal, List
from datetime import datetime

class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    confirm_password: str
    role: str
    
    # Department - used for segregation (IVF, Oncology = hospital, CGT = pharma)
    department: Optional[str] = None
    
    # Pharma fields (required if not hospital email)
    company_name: Optional[str] = None
    
    # Hospital fields (auto-detected from email domain, but can be provided)
    hospital_name: Optional[str] = None
    branch_id: Optional[int] = None
    
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        """Validate role and convert to title case (first letter capital)."""
        role_lower = v.lower()
        valid_roles = {
            'admin': 'Admin',
            'pharma_admin': 'Pharma_admin',
            'mygrape_admin': 'Mygrape_admin',
            'manager': 'Manager',
            'user': 'User'
        }
        if role_lower not in valid_roles:
            raise ValueError("Role must be one of: admin, pharma_admin, mygrape_admin, manager, user")
        # Convert to title case: admin -> Admin, pharma_admin -> Pharma_admin, etc.
        return valid_roles[role_lower]
    
    @model_validator(mode='after')
    def validate_fields(self):
        """Validate required fields based on email domain and department."""
        from ..utils.user_helpers import is_hospital_email, get_hospital_name_from_email
        
        email_lower = self.email.lower().strip()
        is_hospital = is_hospital_email(email_lower)
        
        if is_hospital:
            # Hospital user - department, branch_id required
            if not self.department:
                raise ValueError("department is required for hospital users")
            if self.branch_id is None:
                raise ValueError("branch_id is required for hospital users")
            # Auto-detect hospital name from email if not provided
            if not self.hospital_name:
                self.hospital_name = get_hospital_name_from_email(email_lower)
        else:
            # Pharma user - company_name required
            if not self.company_name:
                raise ValueError("company_name is required for pharma users")
            # Set department to CGT if not provided (default for pharma)
            if not self.department:
                self.department = "CGT"
        
        return self

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
    pharma_id: Optional[int]  # For pharma users
    company_name: Optional[str]  # Will be populated from pharma table for pharma users, hospital name for hospital users
    hospital_id: Optional[int]  # For hospital/IVF users
    branch_id: Optional[int]  # For hospital/IVF users
    department: Optional[str]  # Department (IVF, Oncology, CGT, etc.)
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
