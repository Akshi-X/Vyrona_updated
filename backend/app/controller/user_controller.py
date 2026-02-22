import os
import logging
import traceback

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, ValidationError
from starlette.responses import FileResponse

from app.config import database
from app.models import user_model
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.service import user_service
from app.service.login_service import handle_login
from app.service.otp_service import verify_otp_and_create_token, resend_otp_to_user
from app.service.password_reset_service import request_password_reset, reset_password
from app.schemas import user_schema
from app.utils.user_helpers import get_hospital_by_email_domain
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
from app.schemas.user_schema import UserListResponse, UserNameUpdateRequest, UserUpdateResponse
from app.constants.messages import SuccessMessages
from app.dependencies.auth_dependencies import get_current_user, validate_registration_request

router = APIRouter(tags=["Users"])

# Configure logger
logger = logging.getLogger(__name__)


# ---------------------------
# Get hospital info by email (for signup form)
# ---------------------------
@router.get("/hospital-info-by-email", response_model=user_schema.HospitalInfoByEmailResponse)
def get_hospital_info_by_email(email: str, db: Session = Depends(database.get_db)):
    """
    Get hospital information (name, branches, departments) based on email domain.
    Used by signup form to auto-populate fields when hospital email is detected.
    """
    email_lower = email.lower().strip()
    hospital = get_hospital_by_email_domain(email_lower, db)

    if not hospital:
        return user_schema.HospitalInfoByEmailResponse(
            is_hospital_email=False,
            hospital_name=None,
            hospital_id=None,
            hospital_type=None,
            departments=[],
            branches=[]
        )
    
    # Get all branches for this hospital
    branches = db.query(HospitalBranch).filter(
        HospitalBranch.hospital_id == hospital.hospital_id
    ).all()
    
    branches_list = [
        {
            "branch_id": branch.branch_id,
            "branch_name": branch.branch_name or f"Branch {branch.branch_id}",
            "district_name": branch.district_name,
            "state_name": branch.state_name
        }
        for branch in branches
    ]
    
    # Determine available departments based on hospital_type
    departments = []
    if hospital.hospital_type:
        hospital_type_upper = hospital.hospital_type.upper()
        if hospital_type_upper == "IVF":
            departments = ["IVF"]
        elif hospital_type_upper == "ONCOLOGY":
            departments = ["Oncology"]
        else:
            # If hospital_type is set but not recognized, use it as department
            departments = [hospital.hospital_type]
    else:
        # Default: assume IVF if no type specified
        departments = ["IVF"]
    
    return user_schema.HospitalInfoByEmailResponse(
        is_hospital_email=True,
        hospital_name=hospital.hospital_name,
        hospital_id=hospital.hospital_id,
        hospital_type=hospital.hospital_type,
        departments=departments,
        branches=branches_list
    )


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
    logger.info(f"Controller: Received verify OTP request for user_id: {request.user_id}")
    logger.debug(f"Controller: OTP code: {request.otp}")

    try:
        # Call service (all business logic there)
        logger.debug("Controller: Calling verify_otp_and_create_token service...")
        result = verify_otp_and_create_token(request.user_id, request.otp, db)
        logger.debug(f"Controller: Service returned result: {result}")

        # Return DTO - supports both pharma and hospital responses
        response = VerifyOTPSuccessResponse(
            user_id=result["user_id"],
            email=result["email"],
            status="Logged In",
            auth_token=result["auth_token"],
            expires_at=result["expires_at"],
            message=SuccessMessages.OTP_VERIFIED,
            role=result["role"],
            # Pharma fields (for CGT users)
            pharma_id=result.get("pharma_id"),
            # Hospital fields (for IVF, Oncology users)
            branch_id=result.get("branch_id"),
            department=result.get("department"),
            hospital_id=result.get("hospital_id"),
            hospital_name=result.get("hospital_name")
        )
        logger.debug(f"Controller: Returning response: {response}")
        return response

    except Exception as e:
        logger.error(f"Controller: Exception in verify_otp_endpoint: {e}")
        logger.error(f"Controller: Exception type: {type(e)}")
        logger.error(f"Controller: Traceback: {traceback.format_exc()}")
        raise


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
# Get pending approvals (Admin / Pharma_admin only)
# ---------------------------
@router.get("/users/pending-approvals", response_model=UserListResponse)
def get_pending_approvals(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get list of users with pending approval status (same company/hospital as current user).

    Protected endpoint. Admin or Pharma_admin role required (same as approve/reject).
    Used by Dashboard and ApprovalScreen to show pending approval list.
    """
    return user_service.get_pending_approvals(db=db, current_user=current_user)


# ---------------------------
# Protected endpoint example
# ---------------------------
@router.get("/profile", response_model=UserProfileResponse)
def get_user_profile_endpoint(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get current user's profile.
    
    Protected endpoint. Any authenticated user.
    Uses Depends(get_current_user) to inject authenticated user.
    """
    return user_service.get_user_profile(current_user, db)


# ---------------------------
# Update user name endpoint
# ---------------------------
@router.patch("/user/{user_id}", response_model=UserUpdateResponse)
def update_user_name_endpoint(
    user_id: str,
    request: UserNameUpdateRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Update user's first and last name.
    
    Protected endpoint with strict authorization:
    - Only the user themselves can update their own profile
    - No one else (including managers and admins) can update another user's name
    
    Args:
        user_id: User ID to update
        request: Update request with new first and last name
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UserUpdateResponse with update details
    """
    # Call service (all business logic and authorization there)
    result = user_service.update_user_name(
        user_id=user_id,
        update_request=request,
        current_user=current_user,
        db=db
    )
    
    # Return DTO (result is already UserUpdateResponse)
    return result
