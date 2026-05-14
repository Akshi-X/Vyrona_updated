from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class IntegrationLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class IntegrationLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    expires_at: datetime
    issued_at: datetime
    jti: str
    user_id: str
    hospital_id: Optional[int]
    purpose: str


class IntegrationTokenInfo(BaseModel):
    id: int
    jti: str
    purpose: str
    user_id: str
    hospital_id: Optional[int]
    label: Optional[str]
    issued_at: datetime
    expires_at: Optional[datetime]
    revoked_at: Optional[datetime]
    revoked_by: Optional[str]
    revoked_reason: Optional[str]
    last_used_at: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


class IntegrationTokenListResponse(BaseModel):
    tokens: List[IntegrationTokenInfo]
    total: int


class IntegrationTokenRevokeRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class IntegrationTokenRevokeResponse(BaseModel):
    id: int
    jti: str
    revoked_at: datetime
    revoked_by: str
