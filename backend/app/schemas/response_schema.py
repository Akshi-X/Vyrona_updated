"""
Response Schemas (DTOs)
All API responses use proper Pydantic models for type safety
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class UserApprovalResponse(BaseModel):
    """Response for user approval"""
    detail: str
    user_id: str
    email: str
    first_name: str
    last_name: str
    role: str
    company_name: str  # Pharma company name or hospital name
    pharma_id: Optional[int]  # For pharma users
    hospital_id: Optional[int]  # For hospital/IVF users
    branch_id: Optional[int]  # For hospital/IVF users
    department: Optional[str]  # Department (IVF, Oncology, CGT, etc.)
    approved_by: str
    approved_on: str


class UserRejectionResponse(BaseModel):
    """Response for user rejection"""
    detail: str
    rejected_by: str
    rejected_on: str


class UserDetailsResponse(BaseModel):
    """Response for get user details"""
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    pharma_id: Optional[int]
    company_name: Optional[str]  # Will be populated from pharma table
    approved_status: str
    status: bool
    is_locked: bool
    login_attempts: int
    last_login: Optional[datetime]
    session_timeout: int


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str
    platform: str
    service: str
    environment: str
    database_connected: bool
    redis_connected: bool


class UserProfileResponse(BaseModel):
    """User profile response. Required fields have defaults for DB nulls (e.g. legacy or hospital users)."""
    user_id: str
    email: str
    first_name: str = ""
    last_name: str = ""
    role: str = "User"
    pharma_id: Optional[int] = None
    company_name: Optional[str] = None  # Populated from pharma table for pharma users only
    approved_status: str = "approved"
    status: bool = False
    session_timeout: int = Field(default=30, description="Session timeout in minutes")
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserPermissionsResponse(BaseModel):
    """Response for user permissions endpoint - RBAC permissions"""
    can_approve_users: bool
    can_reject_users: bool
    can_view_all_users: bool
    can_create_shipments: bool
    can_manage_shipments: bool
    can_assign_tasks: bool
    can_view_analytics: bool
    can_manage_iot_devices: bool
    can_view_all_shipments: bool
    can_export_reports: bool
    role: str

