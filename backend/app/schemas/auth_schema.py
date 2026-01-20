from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False  # Default to False for security


class LoginResponse(BaseModel):
    user_id: str
    email: str
    status: str
    otp_expiry: Optional[datetime] = None  # Optional - frontend uses 10-minute countdown
    message: str


class LoginFailureResponse(BaseModel):
    status: str
    message: str


class VerifyOTPRequest(BaseModel):
    user_id: str
    otp: str


class VerifyOTPSuccessResponse(BaseModel):
    user_id: str
    email: str
    status: str
    auth_token: str
    expires_at: datetime
    message: str
    role: str
    
    # Pharma fields (for CGT users)
    pharma_id: Optional[int] = None
    
    # Hospital fields (for IVF, Oncology users)
    branch_id: Optional[int] = None
    department: Optional[str] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None


class VerifyOTPFailureResponse(BaseModel):
    user_id: str
    status: str
    message: str


class ResendOTPRequest(BaseModel):
    user_id: str
    email: EmailStr


class ResendOTPSuccessResponse(BaseModel):
    user_id: str
    email: str
    status: str
    otp_expiry: Optional[datetime] = None  # Optional - frontend uses 10-minute countdown
    message: str


class ResendOTPFailureResponse(BaseModel):
    status: str
    message: str


# ============================================
# FORGOT PASSWORD SCHEMAS
# ============================================

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    email: str
    status: str
    message: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str


class ResetPasswordResponse(BaseModel):
    status: str
    message: str


class LogoutResponse(BaseModel):
    status: str
    message: str