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
        
        # Create branch login
        result = BranchAuthService.signup_branch(
            email=request.email.lower().strip(),
            password=request.password,
            hospital_name=request.hospital_name,
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


@router.post("/verify-email", response_model=BranchVerifyResponse, status_code=status.HTTP_200_OK)
def verify_email(
    request: BranchVerifyRequest | None = None,
    token: str | None = Query(default=None, description="Verification token from email link"),
    db: Session = Depends(get_db)
):
    """
    Verify a branch login email using the token sent via email.
    """
    try:
        verification_token = (token or (request.token if request else "")).strip() if (token or request) else ""
        if not verification_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token is required"
            )
        result = BranchAuthService.verify_branch_email(
            token=verification_token,
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

