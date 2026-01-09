"""
Branch Authentication Controller
Handles branch-level signup and login endpoints
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from ...config.database import get_db
from ...models.IVF.branch_login_model import BranchLogin
from ...dependencies.auth_dependencies import get_current_branch_login
from ...schemas.IVF.ivf_schema import (
    BranchSignupRequest,
    BranchSignupResponse,
    BranchLoginRequest,
    BranchLoginResponse,
    BranchVerifyRequest,
    BranchVerifyResponse,
    HospitalBranchesResponse,
    BranchListItem,
    IVFVerifyOTPRequest,
    IVFVerifyOTPSuccessResponse,
    IVFResendOTPRequest,
    IVFResendOTPSuccessResponse
)
from ...service.IVF.branch_auth_service import BranchAuthService
from ...exceptions.custom_exceptions import DatabaseQueryException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ivf/branch", tags=["Branch Authentication"])


@router.post("/signup", response_model=BranchSignupResponse, status_code=status.HTTP_201_CREATED)
def signup_branch(
    request: BranchSignupRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new branch login account
    
    Domain-based login support:
    - If email contains @zucisystems.com or @mygrape.org, hospital_name is automatically set to "ARC Fertility Hospitals"
    
    Validations:
    - Passwords must match
    - Hospital must exist
    - Department must match hospital_type
    - Branch must belong to hospital
    - One login per branch + department
    - Email must be unique
    """
    try:
        # Validate passwords match
        if request.password != request.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )
        
        # Validate password strength (basic validation)
        if len(request.password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )
        
        # Domain-based login: Auto-detect hospital for specific domains
        email_lower = request.email.lower().strip()
        hospital_name = request.hospital_name
        
        # Check if email domain matches domain-based login criteria
        if "@zucisystems.com" in email_lower or "@mygrape.org" in email_lower:
            hospital_name = "ARC Fertility Hospitals"
            logger.info(f"Domain-based login detected for email: {email_lower}, auto-setting hospital: {hospital_name}")
        
        # Create branch login
        result = BranchAuthService.signup_branch(
            email=email_lower,
            password=request.password,
            first_name=request.first_name,
            last_name=request.last_name,
            role=request.role,
            hospital_name=hospital_name,
            department=request.department,
            branch_id=request.branch_id,
            db=db
        )
        
        return BranchSignupResponse(**result)
    
    except DatabaseQueryException as e:
        logger.error(f"Database error during branch signup: {str(e)}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.custom_message or str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during branch signup: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during signup"
        )


@router.post("/login", response_model=BranchLoginResponse, status_code=status.HTTP_200_OK)
def login_branch(
    request: BranchLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate branch login
    
    Validations:
    - Credentials must be correct
    - Account must be active
    """
    try:
        result = BranchAuthService.login_branch(
            email=request.email.lower().strip(),
            password=request.password,
            db=db
        )
        
        return BranchLoginResponse(**result)
    
    except DatabaseQueryException as e:
        logger.error(f"Database error during branch login: {str(e)}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.custom_message or str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during branch login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        )


@router.get("/verify-email", response_model=BranchVerifyResponse, status_code=status.HTTP_200_OK)
def verify_email(
    token: str = Query(..., description="Verification token from email link (URL-encoded)"),
    db: Session = Depends(get_db)
):
    """
    Verify a branch login email using the token sent via email link.
    
    This endpoint is called when user clicks the verification link in their email.
    Uses GET method as email links are GET requests.
    
    Flow:
    - Validates token presence → 400 if missing
    - Fetches record by verification_token → 400 if not found
    - Handles already-verified users gracefully → 200 "Email already verified"
    - Checks token expiry (UTC-safe) → 400 if expired
    - Sets is_verified=True and is_active=True (allows login)
    - Clears token to prevent reuse
    - Commits transaction
    
    Error Responses:
    - 400: Invalid verification link (missing token or token not found)
    - 400: Verification link expired
    - 200: Email already verified
    - 200: Email verified successfully
    """
    try:
        # Extract token from query parameter (GET request from email link)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token is required"
            )
        verification_token = token
        
        # URL decode the token if needed
        if verification_token and '%' in verification_token:
            from urllib.parse import unquote
            try:
                verification_token = unquote(verification_token)
                if '%' in verification_token:
                    verification_token = unquote(verification_token)
            except Exception:
                pass
        
        result = BranchAuthService.verify_branch_email(
            token=verification_token or "",
            db=db
        )
        return BranchVerifyResponse(**result)
    except DatabaseQueryException as e:
        logger.error(f"Database error during branch verification: {str(e)}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.custom_message or str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during branch verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during email verification"
        )


@router.get("/hospitals/{hospital_id}/branches", response_model=HospitalBranchesResponse)
def get_hospital_branches(
    hospital_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all branches for a hospital
    
    Used by frontend to populate branch dropdown after hospital selection
    """
    try:
        # Get hospital by ID
        from ...models.IVF.hospital_model import Hospital
        hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
        
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hospital with ID {hospital_id} not found"
            )
        
        # Get branches
        branches = BranchAuthService.get_branches_by_hospital(hospital_id, db)
        
        # Return only branch_id and branch_name
        branch_responses = [
            BranchListItem(
                branch_id=branch.branch_id,
                branch_name=branch.branch_name
            )
            for branch in branches
        ]
        
        return HospitalBranchesResponse(
            hospital_id=hospital.hospital_id,
            hospital_name=hospital.hospital_name,
            hospital_type=hospital.hospital_type,
            branches=branch_responses
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hospital branches: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while fetching branches"
        )


@router.get("/hospitals/search", response_model=list)
def search_hospitals(
    name: str,
    db: Session = Depends(get_db)
):
    """
    Search hospitals by name
    
    Used by frontend for hospital selection
    """
    try:
        from ...models.IVF.hospital_model import Hospital
        hospitals = db.query(Hospital).filter(
            Hospital.hospital_name.ilike(f"%{name}%")
        ).limit(10).all()
        
        return [
            {
                "hospital_id": h.hospital_id,
                "hospital_name": h.hospital_name,
                "hospital_type": h.hospital_type
            }
            for h in hospitals
        ]
    
    except Exception as e:
        logger.error(f"Error searching hospitals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while searching hospitals"
        )


@router.get("/hospitals/by-name/{hospital_name}/branches", response_model=HospitalBranchesResponse)
def get_hospital_branches_by_name(
    hospital_name: str,
    db: Session = Depends(get_db)
):
    """
    Get all branches for a hospital by hospital name
    
    Used by frontend to load branches for domain-based login (e.g., ARC Fertility Hospitals)
    """
    try:
        from ...models.IVF.hospital_model import Hospital
        hospital = db.query(Hospital).filter(
            Hospital.hospital_name == hospital_name
        ).first()
        
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hospital '{hospital_name}' not found"
            )
        
        # Get branches
        branches = BranchAuthService.get_branches_by_hospital(hospital.hospital_id, db)
        
        # Return only branch_id and branch_name
        branch_responses = [
            BranchListItem(
                branch_id=branch.branch_id,
                branch_name=branch.branch_name
            )
            for branch in branches
        ]
        
        return HospitalBranchesResponse(
            hospital_id=hospital.hospital_id,
            hospital_name=hospital.hospital_name,
            hospital_type=hospital.hospital_type,
            branches=branch_responses
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hospital branches by name: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while fetching branches"
        )


@router.get("/check-domain", response_model=dict)
def check_email_domain(
    email: str = Query(..., description="Email address to check"),
    db: Session = Depends(get_db)
):
    """
    Check if email domain matches domain-based login criteria and return hospital info
    
    Returns hospital information and branches if domain matches @zucisystems.com or @mygrape.org
    Used by frontend to auto-fill hospital and load branches during signup
    """
    try:
        email_lower = email.lower().strip()
        
        # Check if email domain matches domain-based login criteria
        if "@zucisystems.com" in email_lower or "@mygrape.org" in email_lower:
            hospital_name = "ARC Fertility Hospitals"
            
            # Get hospital by name
            from ...models.IVF.hospital_model import Hospital
            hospital = db.query(Hospital).filter(
                Hospital.hospital_name == hospital_name
            ).first()
            
            if not hospital:
                return {
                    "is_domain_based": True,
                    "hospital_name": hospital_name,
                    "hospital_id": None,
                    "branches": [],
                    "message": f"Hospital '{hospital_name}' not found in database"
                }
            
            # Get branches
            branches = BranchAuthService.get_branches_by_hospital(hospital.hospital_id, db)
            
            branch_responses = [
                {
                    "branch_id": branch.branch_id,
                    "branch_name": branch.branch_name
                }
                for branch in branches
            ]
            
            return {
                "is_domain_based": True,
                "hospital_name": hospital.hospital_name,
                "hospital_id": hospital.hospital_id,
                "hospital_type": hospital.hospital_type,
                "branches": branch_responses
            }
        else:
            return {
                "is_domain_based": False,
                "hospital_name": None,
                "hospital_id": None,
                "branches": []
            }
    
    except Exception as e:
        logger.error(f"Error checking email domain: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while checking email domain"
        )


@router.post("/verify-otp", response_model=IVFVerifyOTPSuccessResponse, status_code=status.HTTP_200_OK)
def verify_ivf_otp(
    request: IVFVerifyOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Verify OTP for IVF branch login
    
    After successful OTP verification, returns JWT token with role, branch_id, department
    """
    try:
        from ...service.ivf_otp_service import verify_ivf_otp_and_create_token
        from ...constants.messages import SuccessMessages
        
        result = verify_ivf_otp_and_create_token(request.login_id, request.otp, db)
        
        return IVFVerifyOTPSuccessResponse(
            login_id=result["login_id"],
            email=result["email"],
            status="Logged In",
            auth_token=result["auth_token"],
            expires_at=result["expires_at"],
            message=SuccessMessages.OTP_VERIFIED,
            role=result["role"],
            branch_id=result["branch_id"],
            department=result["department"],
            hospital_id=result.get("hospital_id"),
            hospital_name=result.get("hospital_name")
        )
    
    except DatabaseQueryException as e:
        logger.error(f"Database error during OTP verification: {str(e)}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.custom_message or str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during OTP verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during OTP verification"
        )


@router.post("/resend-otp", response_model=IVFResendOTPSuccessResponse, status_code=status.HTTP_200_OK)
def resend_ivf_otp(
    request: IVFResendOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Resend OTP for IVF branch login
    """
    try:
        from ...service.ivf_otp_service import resend_ivf_otp_to_user
        from ...constants.messages import SuccessMessages
        
        result = resend_ivf_otp_to_user(request.login_id, request.email, db)
        
        return IVFResendOTPSuccessResponse(
            login_id=result["login_id"],
            email=result["email"],
            status="OTP Sent",
            otp_expiry=result["otp_expiry"],
            message=SuccessMessages.OTP_SENT
        )
    
    except DatabaseQueryException as e:
        logger.error(f"Database error during OTP resend: {str(e)}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.custom_message or str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during OTP resend: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during OTP resend"
        )


@router.post("/approve", status_code=status.HTTP_200_OK)
def approve_ivf_user(
    registration_id: int,
    current_branch_login: BranchLogin = Depends(get_current_branch_login),
    db: Session = Depends(get_db)
):
    """
    Approve IVF user registration
    
    - Manager can approve Users (from same branch and department)
    - Admin (ARC Admin) can approve Managers
    """
    try:
        from ...service.IVF.branch_auth_service import BranchAuthService
        from ...constants.messages import SuccessMessages
        
        # Get branch login to approve
        branch_login = db.query(BranchLogin).filter(BranchLogin.login_id == registration_id).first()
        if not branch_login:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found"
            )
        
        # Validate approval permissions
        if branch_login.role.lower() == 'user':
            # User registration - only Manager from same branch and department can approve
            if current_branch_login.role.lower() != 'manager':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Managers can approve User registrations"
                )
            
            # Check if current Manager is from the same branch and department
            if (current_branch_login.branch_id != branch_login.branch_id or 
                current_branch_login.department != branch_login.department):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Managers from the same branch and department can approve User registrations"
                )
                
        elif branch_login.role.lower() == 'manager':
            # Manager registration - only Admin (ARC Admin) can approve
            if current_branch_login.role.lower() != 'admin':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only ARC Admin can approve Manager registrations"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role for approval"
            )
        
        # Approve the registration
        branch_login.approved_status = 'approved'
        branch_login.is_active = True
        branch_login.approved_by = str(current_branch_login.login_id)
        branch_login.approved_on = datetime.now(timezone.utc)
        branch_login.updated_by = str(current_branch_login.login_id)
        branch_login.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(branch_login)
        
        # Send approval notification email
        from ...service.email_service import send_user_approved_notification
        from ...models.IVF.hospital_branch_model import HospitalBranch
        from ...models.IVF.hospital_model import Hospital
        
        # Get hospital name for the company field
        branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_login.branch_id).first()
        hospital = db.query(Hospital).filter(Hospital.hospital_id == branch.hospital_id).first() if branch else None
        company_name = hospital.hospital_name if hospital else f"Branch {branch_login.branch_id}"
        
        # Format approved date
        approved_date_utc = branch_login.approved_on
        if approved_date_utc.tzinfo is None:
            approved_date_utc = approved_date_utc.replace(tzinfo=timezone.utc)
        else:
            approved_date_utc = approved_date_utc.astimezone(timezone.utc)
        approved_date = approved_date_utc.strftime("%B %d, %Y at %I:%M %p UTC")
        
        send_user_approved_notification(
            user_email=branch_login.email,
            first_name=branch_login.first_name,
            last_name=branch_login.last_name,
            role=branch_login.role,
            company=company_name,
            approved_date=approved_date
        )
        
        return {
            "detail": f"User registration approved: {branch_login.email}",
            "approved_by": current_branch_login.login_id,
            "approved_on": branch_login.approved_on.isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving IVF user: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during approval"
        )


@router.post("/reject", status_code=status.HTTP_200_OK)
def reject_ivf_user(
    registration_id: int,
    current_branch_login: BranchLogin = Depends(get_current_branch_login),
    db: Session = Depends(get_db)
):
    """
    Reject IVF user registration
    
    - Manager can reject Users (from same branch and department)
    - Admin (ARC Admin) can reject Managers
    """
    try:
        # Get branch login to reject
        branch_login = db.query(BranchLogin).filter(BranchLogin.login_id == registration_id).first()
        if not branch_login:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found"
            )
        
        # Validate rejection permissions
        if branch_login.role.lower() == 'user':
            # User registration - only Manager from same branch and department can reject
            if current_branch_login.role.lower() != 'manager':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Managers can reject User registrations"
                )
            
            # Check if current Manager is from the same branch and department
            if (current_branch_login.branch_id != branch_login.branch_id or 
                current_branch_login.department != branch_login.department):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Managers from the same branch and department can reject User registrations"
                )
        elif branch_login.role.lower() == 'manager':
            # Manager registration - only Admin (ARC Admin) can reject
            if current_branch_login.role.lower() != 'admin':
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only ARC Admin can reject Manager registrations"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role for rejection"
            )
        
        # Reject the registration
        branch_login.approved_status = 'rejected'
        branch_login.is_active = False
        branch_login.updated_by = str(current_branch_login.login_id)
        branch_login.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        
        return {
            "detail": f"User registration rejected: {branch_login.email}",
            "rejected_by": current_branch_login.login_id,
            "rejected_on": datetime.now(timezone.utc).isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting IVF user: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during rejection"
        )

