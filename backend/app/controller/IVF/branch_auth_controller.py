"""
Branch Authentication Controller
Handles branch-level signup and login endpoints
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from ...config.database import get_db
from ...schemas.IVF.ivf_schema import (
    BranchSignupRequest,
    BranchSignupResponse,
    BranchLoginRequest,
    BranchLoginResponse,
    BranchVerifyRequest,
    BranchVerifyResponse,
    HospitalBranchesResponse,
    BranchListItem
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

