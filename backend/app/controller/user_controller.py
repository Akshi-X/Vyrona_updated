import os

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from starlette.responses import FileResponse

from app.config import database
from app.models import user_model
from app.service import user_service
from app.service.login_service import handle_login
from app.service.otp_service import verify_otp_and_create_token, resend_otp_to_user
from app.service.password_reset_service import request_password_reset, reset_password
from app.schemas import user_schema
from app.schemas.auth_schema import (
    LoginRequest, LoginResponse,
    VerifyOTPRequest, VerifyOTPSuccessResponse,
    ResendOTPRequest, ResendOTPSuccessResponse,
    ForgotPasswordRequest, ForgotPasswordResponse,
    ResetPasswordRequest, ResetPasswordResponse,
    LogoutResponse
)
from app.schemas.response_schema import (
    UserApprovalResponse,
    UserRejectionResponse,
    UserDetailsResponse,
    UserProfileResponse
)
from app.schemas.user_schema import UserListResponse
from app.constants.messages import SuccessMessages
from app.dependencies.auth_dependencies import get_current_user, validate_registration_request

router = APIRouter()


# ---------------------------
# Register endpoint
# ---------------------------
@router.post("/register", response_model=user_schema.UserRegistrationResponse)
def register_user_endpoint(request: user_schema.UserRegister, db: Session = Depends(database.get_db)):
    """User registration endpoint."""
    # Validate
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
    """User login endpoint with Remember Me support."""
    # Call service (all business logic there)
    result = handle_login(request.email, request.password, request.remember_me, db)
    
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
    # Call service (all business logic there)
    result = verify_otp_and_create_token(request.user_id, request.otp, db)
    
    # Return DTO
    return VerifyOTPSuccessResponse(
        user_id=result["user_id"],
        email=result["email"],
        status="Logged In",
        auth_token=result["auth_token"],
        expires_at=result["expires_at"],
        message=SuccessMessages.OTP_VERIFIED,
        pharma_id=result.get("pharma_id")  # Include pharma_id in response
    )


# ---------------------------
# Logout endpoint
# ---------------------------
@router.post("/logout", response_model=LogoutResponse)
def logout_user(current_user: user_model.User = Depends(get_current_user)):
    """
    User logout endpoint.
    
    Protected endpoint. Any authenticated user can logout.
    
    Note: Since JWT tokens are stateless, the actual token invalidation 
    happens on the client side by removing the token from storage.
    This endpoint serves to acknowledge the logout action.
    """
    return LogoutResponse(
        status="success",
        message=SuccessMessages.LOGOUT_SUCCESS
    )


# ---------------------------
# Resend OTP endpoint
# ---------------------------
@router.post("/resend-otp", response_model=ResendOTPSuccessResponse)
def resend_otp_endpoint(request: ResendOTPRequest, db: Session = Depends(database.get_db)):
    """Resend OTP endpoint."""
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
# Forgot Password endpoint
# ---------------------------
@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password_endpoint(request: ForgotPasswordRequest, db: Session = Depends(database.get_db)):
    """
    Request password reset link.
    
    Public endpoint - no authentication required.
    Sends password reset link to user's email.
    """
    # Call service (all business logic there)
    result = request_password_reset(request.email, db)
    
    # Return DTO
    return ForgotPasswordResponse(
        email=result["email"],
        status="success",
        message=SuccessMessages.PASSWORD_RESET_EMAIL_SENT
    )


# ---------------------------
# Reset Password endpoint
# ---------------------------
@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password_endpoint(request: ResetPasswordRequest, db: Session = Depends(database.get_db)):
    """
    Reset user password using reset token.
    
    Public endpoint - no authentication required.
    Requires valid reset token from email link.
    """
    # Call service (all business logic there)
    result = reset_password(
        token=request.token,
        new_password=request.new_password,
        confirm_password=request.confirm_password,
        db=db
    )
    
    # Return DTO
    return ResetPasswordResponse(
        status="success",
        message=SuccessMessages.PASSWORD_RESET_SUCCESS
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
    
    Protected endpoint. Manager or Admin role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    # Call service (business logic in service layer)
    result = user_service.get_user_details_by_id(
        user_id=user_id,
        current_user=current_user,
        db=db
    )
    
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
    
    Protected endpoint. Manager or Admin role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    # Call service (business logic in service layer)
    result = user_service.approve_user(
        registration_id=action.registration_id,
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
    
    Protected endpoint. Manager or Admin role required (enforced by middleware).
    Uses Depends(get_current_user) to get authenticated user.
    """
    # Call service (business logic in service layer)
    result = user_service.reject_user(
        registration_id=action.registration_id,
        rejected_by_user_id=current_user.user_id,
        db=db
    )
    
    # Return DTO (result is already UserRejectionResponse)
    return result


# ---------------------------
# Get all users (for dropdowns, assignments, etc.)
# ---------------------------
@router.get("/users", response_model=UserListResponse)
def get_all_users(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get list of all users in the system from the same company.
    
    Protected endpoint. Any authenticated user can view.
    Returns all approved and active users from the same company.
    
    **Use Cases:**
    - Task assignment dropdown
    - Chat user selection
    - Team member listing
    - Any feature requiring user selection
    
    **Multi-tenant:** Only shows users from current user's company
    """
    # Call service (business logic in service layer)
    result = user_service.get_all_users(db=db, current_user=current_user)
    
    # Return DTO (result is already UserListResponse)
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
