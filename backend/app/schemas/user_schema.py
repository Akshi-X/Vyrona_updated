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
    branch_name: Optional[str] = None
    
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
        """
        Keep schema validation lightweight.

        Domain-driven pharma vs hospital validation is done in
        validate_registration_request() where DB access is available.
        """
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


class InviteUserRequest(BaseModel):
    email: str
    role: str
    branch_name: Optional[str] = None


class InviteTokenResponse(BaseModel):
    email: str
    role: str
    branch_name: Optional[str] = None
    hospital_name: Optional[str] = None
    expires_at: datetime


class RegisterFromInviteRequest(BaseModel):
    token: str
    first_name: str
    last_name: str
    password: str
    confirm_password: str


class HospitalUserItem(BaseModel):
    """Schema for a hospital user in the users list"""
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    branch_name: Optional[str] = None
    department: Optional[str] = None
    phone_number: Optional[str] = None
    status: bool = False
    approved_status: str = "pending"
    invite_pending: bool = False
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class HospitalUserListResponse(BaseModel):
    """Response schema for listing hospital users"""
    total_users: int
    users: list[HospitalUserItem]


class UserNameUpdateRequest(BaseModel):
    """Schema for updating user first and last name (and optional phone number)"""
    first_name: str
    last_name: str
    phone_number: Optional[str] = None

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

    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            return None
        import re
        if not re.match(r'^[+]?[\d\s\-().]{7,20}$', stripped):
            raise ValueError("Enter a valid phone number")
        return stripped


class HospitalUserDetailsUpdateRequest(BaseModel):
    """Schema for admin/manager updating another hospital user's details"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None

    @field_validator('first_name', 'last_name')
    @classmethod
    def validate_names(cls, v):
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters long")
        if len(v.strip()) > 50:
            raise ValueError("Name cannot exceed 50 characters")
        return v.strip()

    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            return None
        import re
        if not re.match(r'^[+]?[\d\s\-().]{7,20}$', stripped):
            raise ValueError("Enter a valid phone number")
        return stripped


class HospitalUserStatusUpdateRequest(BaseModel):
    """Schema for admin/manager enabling or disabling a hospital user"""
    status: bool


class HospitalUserBranchUpdateRequest(BaseModel):
    """Schema for admin/manager changing a hospital user's branch"""
    branch_name: str


class UserUpdateResponse(BaseModel):
    """Response schema for user update operations"""
    message: str
    user_id: str
    first_name: str
    last_name: str
    phone_number: Optional[str] = None
    updated_at: datetime


class HospitalInfoByEmailResponse(BaseModel):
    """Response for getting hospital info by email"""
    is_hospital_email: bool
    hospital_name: Optional[str] = None
    hospital_id: Optional[int] = None
    hospital_type: Optional[str] = None  # e.g., "IVF", "Oncology"
    departments: List[str] = []  # Available departments based on hospital_type
    branches: List[dict] = []  # List of branches with branch_id and branch_name
