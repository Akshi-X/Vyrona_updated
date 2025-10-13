from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    user_id: str
    email: str
    status: str
    otp_expiry: datetime
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
    otp_expiry: datetime
    message: str


class ResendOTPFailureResponse(BaseModel):
    status: str
    message: str
