"""External integration auth endpoints.

POST /api/external/integration/auth/login    (PUBLIC; password-only, Admin role required)
GET  /api/external/integration/auth/tokens   (Admin only)
POST /api/external/integration/auth/tokens/{token_id}/revoke   (Admin only)

The login endpoint mints a long-lived JWT (1 year) intended to be handed to an
external HMS for use as Authorization: Bearer on /api/external/hms/* endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.constants.enums import UserRole
from app.exceptions import AuthenticationRequiredException
from app.schemas.external.integration_auth_schema import (
    IntegrationLoginRequest,
    IntegrationLoginResponse,
    IntegrationTokenInfo,
    IntegrationTokenListResponse,
    IntegrationTokenRevokeRequest,
    IntegrationTokenRevokeResponse,
)
from app.service.external.integration_auth_service import IntegrationAuthService

router = APIRouter(
    prefix="/external/integration/auth",
    tags=["External Integration Auth"],
)


def _require_admin(request: Request):
    if not hasattr(request.state, "current_user"):
        raise AuthenticationRequiredException()
    user = request.state.current_user
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


@router.post("/login", response_model=IntegrationLoginResponse)
def integration_login(
    payload: IntegrationLoginRequest,
    db: Session = Depends(get_db),
):
    service = IntegrationAuthService(db)
    result = service.login_admin(email=payload.email, password=payload.password)
    return IntegrationLoginResponse(**result)


@router.get("/tokens", response_model=IntegrationTokenListResponse)
def list_integration_tokens(
    request: Request,
    user_id: Optional[str] = Query(None),
    include_revoked: bool = Query(True),
    db: Session = Depends(get_db),
):
    admin = _require_admin(request)
    service = IntegrationAuthService(db)

    # Admins see tokens issued for their own hospital.
    rows, total = service.list_tokens(
        hospital_id=admin.hospital_id,
        user_id=user_id,
        include_revoked=include_revoked,
    )
    tokens = [
        IntegrationTokenInfo(
            id=row.id,
            jti=row.jti,
            purpose=row.purpose,
            user_id=row.user_id,
            hospital_id=row.hospital_id,
            label=row.label,
            issued_at=row.issued_at,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            revoked_by=row.revoked_by,
            revoked_reason=row.revoked_reason,
            last_used_at=row.last_used_at,
            is_active=IntegrationAuthService.is_active(row),
        )
        for row in rows
    ]
    return IntegrationTokenListResponse(tokens=tokens, total=total)


@router.post(
    "/tokens/{token_id}/revoke",
    response_model=IntegrationTokenRevokeResponse,
)
def revoke_integration_token(
    token_id: int,
    payload: IntegrationTokenRevokeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_admin(request)
    service = IntegrationAuthService(db)
    record = service.revoke_token(
        token_id=token_id,
        revoked_by_user=admin,
        reason=payload.reason,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Integration token not found")
    if record.hospital_id is not None and admin.hospital_id is not None and record.hospital_id != admin.hospital_id:
        raise HTTPException(status_code=403, detail="Cannot revoke token from another hospital")
    return IntegrationTokenRevokeResponse(
        id=record.id,
        jti=record.jti,
        revoked_at=record.revoked_at,
        revoked_by=record.revoked_by,
    )
