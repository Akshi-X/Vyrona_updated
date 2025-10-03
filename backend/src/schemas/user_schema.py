from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    confirm_password: str
    role: str
    company_name: str

class UserResponse(BaseModel):
    registration_id: str
    user_id: Optional[str]
    first_name: str
    last_name: str
    email: str
    role: str
    company_name: str
    created_at: datetime
    updated_at: Optional[datetime]
    status: bool
    approved_status: str

    class Config:
        from_attributes = True
