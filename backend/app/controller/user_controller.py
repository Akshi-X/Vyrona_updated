import os
import logging
import traceback
from app.config.config import settings

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, ValidationError
from starlette.responses import FileResponse

from app.config import database
from app.models import user_model
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.models.IVF.hospital_model import Hospital
from app.utils import ivf_blob
from app.constants import app_constants
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
    UserDetailsResponse,
    UserProfileResponse
)
from app.schemas.user_schema import (
    UserListResponse, UserNameUpdateRequest, UserUpdateResponse, HospitalUserListResponse,
    HospitalUserItem, InviteUserRequest, InviteTokenResponse, RegisterFromInviteRequest,
    HospitalUserDetailsUpdateRequest, HospitalUserStatusUpdateRequest, HospitalUserBranchUpdateRequest,
)
from app.constants.messages import SuccessMessages
from app.dependencies.auth_dependencies import get_current_user, validate_registration_request
from app.service.activity_log_service import ActivityLogService, build_actor_from_user
from app.constants.enums import ActivityOutcome

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
        result = verify_otp_and_create_token(
            request.user_id,
            request.otp,
            db,
        )
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
def logout_user(
    request: Request,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    User logout endpoint.
    
    Protected endpoint. Any authenticated user can logout.
    
    Note: Since JWT tokens are stateless, the actual token invalidation 
    happens on the client side by removing the token from storage.
    This endpoint serves to acknowledge the logout action.
    """
    ActivityLogService(db).log_activity(
        action="user.logout",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(current_user),
        audit_log_disabled=getattr(request.state, "audit_log_disabled", False),
    )
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


def _require_admin_or_manager(current_user: user_model.User) -> None:
    """Restrict an endpoint to Admin/Manager roles. Raises 403 otherwise."""
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role.lower() not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin or Manager role required")


# ---------------------------
# Get all users of the current user's hospital
# ---------------------------
@router.get("/hospital/users", response_model=HospitalUserListResponse)
def get_hospital_users(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get all approved, active users belonging to the same hospital as the current user.
    Returns hospital-specific fields: user_id, name, email, role, branch_id, department.
    """
    return user_service.get_hospital_users(db=db, current_user=current_user)


def _current_hospital(current_user: user_model.User, db: Session) -> Hospital:
    """Resolve the Hospital row for the current user, via hospital_id or their branch."""
    hospital_id = current_user.hospital_id
    if not hospital_id and current_user.branch_id:
        branch = db.query(HospitalBranch).filter(
            HospitalBranch.branch_id == current_user.branch_id
        ).first()
        if branch:
            hospital_id = branch.hospital_id
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Unable to determine hospital for this user")
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return hospital


# ---------------------------
# Hospital branding (name + logo) for report generation
# ---------------------------
@router.get("/hospital/branding", response_model=user_schema.HospitalBrandingResponse)
def get_hospital_branding(
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Hospital name + logo used to brand generated reports (embryo console, etc.)."""
    hospital = _current_hospital(current_user, db)
    logo_url = ivf_blob.generate_read_sas_url(hospital.logo_url) if hospital.logo_url else None
    return user_schema.HospitalBrandingResponse(
        hospital_id=hospital.hospital_id,
        hospital_name=hospital.hospital_name,
        logo_url=logo_url,
    )


@router.post("/hospital/logo", response_model=user_schema.HospitalBrandingResponse)
def upload_hospital_logo(
    file: UploadFile = File(...),
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Upload/replace the hospital's report logo. Admin/Manager only."""
    _require_admin_or_manager(current_user)
    hospital = _current_hospital(current_user, db)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in app_constants.ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(app_constants.ALLOWED_IMAGE_EXTENSIONS)}",
        )

    data = file.file.read()
    if len(data) > app_constants.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max {app_constants.MAX_FILE_SIZE_MB}MB",
        )

    try:
        blob_path = ivf_blob.make_blob_path(f"hospital/{hospital.hospital_id}", file.filename or "", "logo")
        file_url = ivf_blob.upload_bytes(data, blob_path, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.exception("Blob upload failed for hospital logo hospital=%s", hospital.hospital_id)
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")

    old_logo_url = hospital.logo_url
    hospital.logo_url = file_url
    db.commit()
    db.refresh(hospital)
    if old_logo_url:
        ivf_blob.delete_blob_by_url(old_logo_url)

    return user_schema.HospitalBrandingResponse(
        hospital_id=hospital.hospital_id,
        hospital_name=hospital.hospital_name,
        logo_url=ivf_blob.generate_read_sas_url(file_url),
    )


@router.post("/hospital/users/invite")
def invite_hospital_user(
    body: InviteUserRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Generate a one-time invite token and send invite email."""
    try:
        return user_service.invite_user(
            db=db,
            current_user=current_user,
            email=body.email,
            role=body.role,
            base_url=settings.FRONTEND_URL,
            branch_name=body.branch_name,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/hospital/users/{user_id}/resend-invite")
def resend_invite(
    user_id: str,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Resend invite email to a pending user with a fresh token."""
    try:
        return user_service.resend_invite(db=db, current_user=current_user, user_id=user_id, base_url=settings.FRONTEND_URL)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/hospital/users/{user_id}", response_model=HospitalUserItem)
def update_hospital_user_details(
    user_id: str,
    body: HospitalUserDetailsUpdateRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Admin/Manager: update another hospital user's name, email, or phone number."""
    _require_admin_or_manager(current_user)
    try:
        return user_service.update_user_details(
            db=db, current_user=current_user, user_id=user_id, update_request=body
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/hospital/users/{user_id}/status", response_model=HospitalUserItem)
def update_hospital_user_status(
    user_id: str,
    body: HospitalUserStatusUpdateRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Admin/Manager: enable or disable a hospital user's account."""
    _require_admin_or_manager(current_user)
    try:
        return user_service.update_user_status(
            db=db, current_user=current_user, user_id=user_id, status=body.status
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/hospital/users/{user_id}/branch", response_model=HospitalUserItem)
def update_hospital_user_branch(
    user_id: str,
    body: HospitalUserBranchUpdateRequest,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Admin/Manager: change a hospital user's assigned branch."""
    _require_admin_or_manager(current_user)
    try:
        return user_service.update_user_branch(
            db=db, current_user=current_user, user_id=user_id, branch_name=body.branch_name
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/hospital/users/{user_id}/send-reset-link")
def send_hospital_user_reset_link(
    user_id: str,
    current_user: user_model.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Admin/Manager: send a password reset link to a hospital user."""
    _require_admin_or_manager(current_user)
    try:
        return user_service.send_password_reset_link(db=db, current_user=current_user, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/invite/{token}", response_model=InviteTokenResponse)
def get_invite(token: str, db: Session = Depends(database.get_db)):
    """Validate an invite token and return invite metadata."""
    try:
        return user_service.get_invite_token(db=db, token=token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/register/invite")
def register_from_invite(body: RegisterFromInviteRequest, db: Session = Depends(database.get_db)):
    """Create an account from a valid invite link."""
    try:
        return user_service.register_from_invite(db=db, data=body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))




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
