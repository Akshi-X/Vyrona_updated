import os

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from starlette.responses import FileResponse

from app.config import database
from app.models import user_model
from app.service import user_service
from app.schemas import user_schema
from app.schemas.auth_schema import (
    LoginRequest, LoginResponse,
    VerifyOTPRequest, VerifyOTPSuccessResponse,
    ResendOTPRequest, ResendOTPSuccessResponse
)
from app.schemas.response_schema import (
    UserApprovalResponse,
    UserRejectionResponse,
    UserDetailsResponse,
    UserProfileResponse
)
from app.constants.messages import SuccessMessages
from app.dependencies.auth_dependencies import get_current_user

router = APIRouter()


# ---------------------------
# Register endpoint
# ---------------------------
@router.post("/register", response_model=user_schema.UserRegistrationResponse)
def register_user_endpoint(request: user_schema.UserRegister, db: Session = Depends(database.get_db)):
    """User registration endpoint."""
    # Validate
    from ..dependencies.auth_dependencies import validate_registration_request
    validated_request = validate_registration_request(request, db)
    
    # Call service (all business logic there)
    user = user_service.register_user(db, validated_request)
    
    # Return DTO
    return user


# ---------------------------
# Login endpoint
# ---------------------------
@router.post("/login", response_model=LoginResponse)
def login_user(request: LoginRequest, db: Session = Depends(database.get_db)):
    """User login endpoint."""
    from ..service.login_service import handle_login
    
    # Call service (all business logic there)
    result = handle_login(request.email, request.password, db)
    
    # Return DTO
    return LoginResponse(
        user_id=result["user_id"],
        email=result["email"],
        status="OTP Sent",
        otp_expiry=result["otp_expiry"],
        message=SuccessMessages.OTP_SENT
    )


# ---------------------------
# Verify OTP endpoint
# ---------------------------
@router.post("/verify-otp", response_model=VerifyOTPSuccessResponse)
def verify_otp_endpoint(request: VerifyOTPRequest, db: Session = Depends(database.get_db)):
    """OTP verification endpoint."""
    from ..service.otp_service import verify_otp_and_create_token
    
    # Call service (all business logic there)
    result = verify_otp_and_create_token(request.user_id, request.otp, db)
    
    # Return DTO
    return VerifyOTPSuccessResponse(
        user_id=result["user_id"],
        email=result["email"],
        status="Logged In",
        auth_token=result["auth_token"],
        expires_at=result["expires_at"],
        message=SuccessMessages.OTP_VERIFIED
    )


# ---------------------------
# Resend OTP endpoint
# ---------------------------
@router.post("/resend-otp", response_model=ResendOTPSuccessResponse)
def resend_otp_endpoint(request: ResendOTPRequest, db: Session = Depends(database.get_db)):
    """Resend OTP endpoint."""
    from ..service.otp_service import resend_otp_to_user
    
    # Call service (all business logic there)
    result = resend_otp_to_user(request.user_id, request.email, db)
    
    # Return DTO
    return ResendOTPSuccessResponse(
        user_id=result["user_id"],
        email=result["email"],
        status="OTP Resent",
        otp_expiry=result["otp_expiry"],
        message=SuccessMessages.OTP_RESENT
    )


# ---------------------------
# Pydantic model for approve/reject
# ---------------------------
class RegistrationAction(BaseModel):
    registration_id: str


# ---------------------------
# Get user details
# ---------------------------
@router.get("/user/{user_id}", response_model=UserDetailsResponse)
def get_user(
    user_id: str,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get user details.
    
    Protected endpoint. Manager role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    from ..exceptions import CompanyAccessForbiddenException, UserGetNotFoundException
    
    # Refetch target user with controller's DB session
    target_user = db.query(user_model.User).filter(user_model.User.user_id == user_id).first()
    if not target_user:
        raise UserGetNotFoundException(registration_id=user_id)
    
    # Multi-tenant check: Manager can only view users from their company
    if target_user.company_name != current_user.company_name:
        raise CompanyAccessForbiddenException(
            user_company=current_user.company_name,
            target_company=target_user.company_name
        )
    
    # Call service (pass validated user)
    result = user_service.get_user_details(target_user, db)
    
    # Return DTO (result is already UserDetailsResponse)
    return result


# ---------------------------
# Serve approval HTML
# ---------------------------
@router.get("/approval-screen", include_in_schema=False)
def approval_screen():
    html_path = os.path.join("static", "approvescreen.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="Approval screen not found")
    return FileResponse(html_path)


# ---------------------------
# Approve user
# ---------------------------
@router.post("/user/approve", response_model=UserApprovalResponse)
def approve_user(
    action: RegistrationAction,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Approve user registration.
    
    Protected endpoint. Manager role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    from ..exceptions import UserApproveNotFoundException
    
    # Refetch target user with controller's DB session
    target_user = db.query(user_model.User).filter(user_model.User.user_id == action.registration_id).first()
    if not target_user:
        raise UserApproveNotFoundException(registration_id=action.registration_id)
    
    # Call service (pass validated user)
    result = user_service.approve_user(
        user=target_user,
        approved_by_user_id=current_user.user_id,
        db=db
    )
    
    # Return DTO (result is already UserApprovalResponse)
    return result

# ---------------------------
# Reject user
# ---------------------------
@router.post("/user/reject", response_model=UserRejectionResponse)
def reject_user(
    action: RegistrationAction,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Reject user registration.
    
    Protected endpoint. Manager role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    from ..exceptions import UserRejectNotFoundException
    
    # Refetch target user with controller's DB session
    target_user = db.query(user_model.User).filter(user_model.User.user_id == action.registration_id).first()
    if not target_user:
        raise UserRejectNotFoundException(registration_id=action.registration_id)
    
    # Call service (pass validated user)
    result = user_service.reject_user(
        user=target_user,
        rejected_by_user_id=current_user.user_id,
        db=db
    )
    
    # Return DTO (result is already UserRejectionResponse)
    return result


# ---------------------------
# Protected endpoint example
# ---------------------------
@router.get("/profile", response_model=UserProfileResponse)
def get_user_profile_endpoint(current_user: user_model.User = Depends(get_current_user)):
    """
    Get current user's profile.
    
    Protected endpoint. Any authenticated user.
    Uses Depends(get_current_user) to inject authenticated user.
    """
    return user_service.get_user_profile(current_user)
