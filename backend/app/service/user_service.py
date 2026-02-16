from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import datetime, timezone
import logging

from app.models import user_model
from app.models.user_model import User
from app.schemas import user_schema
from app.schemas.user_schema import UserRegistrationResponse
from app.schemas.response_schema import (
    UserProfileResponse,
    UserApprovalResponse,
    UserRejectionResponse,
    UserDetailsResponse
)
from app.schemas.user_schema import UserListResponse, UserListItem, UserNameUpdateRequest, UserUpdateResponse
from app.service.email_service import send_approval_email, send_user_approved_notification
from app.utils import utils
from app.exceptions import (
    EmailAlreadyExistsException,
    DatabaseQueryException,
    UserApproveNotFoundException,
    UserRejectNotFoundException,
    UserGetNotFoundException,
    UserUpdateNotFoundException,
    UserUpdateForbiddenException,
    CompanyAccessForbiddenException,
    RegistrationEmailFailedException
)
from app.constants.app_constants import (
    ADMIN_SESSION_TIMEOUT_MINUTES,
    MANAGER_SESSION_TIMEOUT_MINUTES,
    USER_SESSION_TIMEOUT_MINUTES,
    DEFAULT_SESSION_TIMEOUT_MINUTES
)
from app.constants.messages import SuccessMessages, ErrorMessages
from app.config.config import settings, get_settings
from app.models.pharma_model import Pharma
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.utils.user_helpers import (
    get_hospital_by_email_domain,
    is_hospital_department
)
from app.utils.utils import normalize_role_to_title_case
import traceback

# Configure logger
logger = logging.getLogger(__name__)


def get_pharma_admin_email(pharma_id: int, db: Session) -> Optional[str]:
    """
    Get the email of a pharma admin from the specified pharma company.
    
    Used for pharma-specific approval: Each pharma admin can only approve users from their own company.
    
    Args:
        pharma_id: Pharma ID to search for
        db: Database session
        
    Returns:
        Pharma admin's email if found, None otherwise
    """
    try:
        # Validate input
        if not pharma_id:
            logger.warning("Empty or None pharma_id provided to get_pharma_admin_email")
            return None
        
        # Look for pharma admin users by pharma_id instead of using pharma.user_id
        pharma_admin = db.query(user_model.User).filter(
            user_model.User.pharma_id == pharma_id,
            user_model.User.role == 'Pharma_admin',
            user_model.User.approved_status == 'approved',
            user_model.User.status == True
        ).first()
        
        if not pharma_admin:
            logger.warning(f"No pharma admin found for pharma_id: {pharma_id}")
            return None
        
        return pharma_admin.email
        
    except Exception as e:
        logger.error(f"Error getting pharma admin email for pharma_id '{pharma_id}': {str(e)}")
        return None


def get_mygrape_admin_email() -> str:
    """
    Get the common MyGrape admin email for all pharma companies.
    
    Returns:
        MyGrape admin email from configuration
    """
    settings_obj = get_settings()
    return settings_obj.MYGRAPE_ADMIN_EMAIL


def get_company_manager_email(pharma_id: int, db: Session) -> Optional[str]:
    """
    Get the email of an approved manager from the specified pharma company.
    
    Used for two-level approval: Users need approval from their company manager.
    
    Args:
        pharma_id: Pharma ID to search for
        db: Database session
        
    Returns:
        Manager's email if found, None otherwise
    """
    manager = db.query(user_model.User).filter(
        user_model.User.pharma_id == pharma_id,
        user_model.User.role == 'Manager',
        user_model.User.approved_status == 'approved',
        user_model.User.status == True
    ).first()
    
    return manager.email if manager else None


def register_user(db: Session, request: user_schema.UserRegister) -> UserRegistrationResponse:
    """
    Register a new user with proper transaction handling (supports both pharma and hospital).
    
    Uses DB-driven email domain detection from hospitals.hospital_head_email:
    - Matching domain = hospital flow (department: IVF, Oncology, etc.)
    - Non-matching domain = pharma flow (department: CGT, etc.)
    
    If email sending fails, user record is rolled back to prevent orphaned accounts.
    Validation already done in dependency.
    """
    # Role is already validated and in title case from schema
    role = request.role
    
    # Generate custom user ID (USR-XXXXXX format) - same format for both types
    user_id = utils.generate_user_id()
    
    # Detect user type from DB-driven email-domain mapping
    email_lower = request.email.lower().strip()
    domain_hospital = get_hospital_by_email_domain(email_lower, db)
    is_hospital = domain_hospital is not None
    
    # Initialize variables
    pharma_id = None
    branch_id = None
    department = request.department  # Will be set to CGT for pharma if not provided
    hospital_id = None
    recipient_email = None
    company_name = None
    
    # ============================================
    # PHARMA REGISTRATION LOGIC (EXISTING - NO CHANGES)
    # ============================================
    if not is_hospital:
        if not request.company_name:
            raise DatabaseQueryException(
                operation="user registration",
                reason="Company name required",
                custom_message="company_name is required for pharma users",
                status_code=400
            )

        # Check if pharma exists
        existing_pharma = db.query(Pharma).filter(Pharma.pharma_name == request.company_name).first()
        
        if existing_pharma:
            # Pharma exists, use existing pharma_id
            pharma_id = existing_pharma.id
            company_name = existing_pharma.pharma_name
            logger.info(f"Using existing pharma: {existing_pharma.pharma_name} (ID: {pharma_id})")
        else:
            # Pharma doesn't exist - reject registration
            logger.error(f"Pharma '{request.company_name}' doesn't exist - registration not allowed")
            raise DatabaseQueryException(
                operation="user registration", 
                reason=ErrorMessages.REGISTRATION_NOT_ALLOWED,
                custom_message=ErrorMessages.REGISTRATION_NOT_ALLOWED,
                status_code=400
            )
        
        # Set default department to CGT for pharma users if not provided
        if not department:
            department = "CGT"
        
        # Check if pharma admin exists for this pharma
        pharma_admin_email = get_pharma_admin_email(pharma_id, db)
        
        if not pharma_admin_email:
            logger.error(f"No pharma admin found for pharma_id: {pharma_id}")
            raise DatabaseQueryException(
                operation="user registration", 
                reason=ErrorMessages.REGISTRATION_NOT_ALLOWED,
                custom_message=ErrorMessages.REGISTRATION_NOT_ALLOWED,
                status_code=400
            )
        
        # Both manager and user registrations go to pharma admin
        recipient_email = pharma_admin_email
        logger.info(f"Registration: Sending approval email to Pharma Admin ({recipient_email}) for pharma_id: {pharma_id}")
    
    # ============================================
    # HOSPITAL REGISTRATION LOGIC (NEW)
    # ============================================
    else:  # is_hospital == True
        hospital = domain_hospital
        hospital_name = hospital.hospital_name

        if not department:
            raise DatabaseQueryException(
                operation="user registration",
                reason="Department required",
                custom_message="department is required for hospital users",
                status_code=400
            )

        if not request.branch_name:
            raise DatabaseQueryException(
                operation="user registration",
                reason="Branch required",
                custom_message="branch_name is required for hospital users",
                status_code=400
            )

        if request.hospital_name and request.hospital_name.strip().lower() != hospital_name.strip().lower():
            raise DatabaseQueryException(
                operation="user registration",
                reason="Hospital mismatch",
                custom_message="hospital_name does not match email domain",
                status_code=400
            )
        
        hospital_id = hospital.hospital_id
        company_name = hospital.hospital_name
        
        # Validate branch belongs to hospital (lookup by branch_name)
        branch = db.query(HospitalBranch).filter(
            HospitalBranch.branch_name == request.branch_name,
            HospitalBranch.hospital_id == hospital_id
        ).first()
        
        if not branch:
            logger.error(f"Branch '{request.branch_name}' not found for hospital {hospital_name}")
            raise DatabaseQueryException(
                operation="user registration",
                reason="Branch not found",
                custom_message=f"Branch '{request.branch_name}' not found for hospital '{hospital_name}'",
                status_code=404
            )
        
        branch_id = branch.branch_id
        
        # Validate department matches hospital_type
        if hospital.hospital_type and hospital.hospital_type.upper() != department.upper():
            logger.warning(
                f"Department mismatch: hospital_type={hospital.hospital_type}, "
                f"requested department={department}"
            )
            # Allow if hospital_type is None or if they match (case-insensitive)
            # This is a soft validation - you may want to make it stricter
        
        # branch_id is already set from branch.branch_id above
        # Department is already set from request (validated in schema)
        
        # Determine email recipient based on role
        role_lower = role.lower()
        if role_lower == 'user':
            # User registration → send to Manager from same branch and department
            manager = db.query(user_model.User).filter(
                user_model.User.department == department,
                user_model.User.branch_id == branch_id,
                user_model.User.role == 'Manager',
                user_model.User.approved_status == 'approved',
                user_model.User.status == True
            ).first()
            
            if manager:
                recipient_email = manager.email
                logger.info(f"User registration: Sending approval email to Manager ({recipient_email})")
            else:
                # No manager found - send to admin
                admin = db.query(user_model.User).filter(
                    user_model.User.department == department,
                    user_model.User.role == 'Admin',
                    user_model.User.approved_status == 'approved',
                    user_model.User.status == True
                ).first()
                
                if admin:
                    recipient_email = admin.email
                    logger.info(f"User registration: No manager found, sending to Admin ({recipient_email})")
                else:
                    db.rollback()
                    logger.error(f"No approver found for hospital user registration")
                    raise DatabaseQueryException(
                        operation="user registration",
                        reason="No approver found",
                        custom_message="No approver found for this registration. Please contact administrator.",
                        status_code=400
                    )
        
        elif role_lower == 'manager':
            # Manager registration → send to Admin
            admin = db.query(user_model.User).filter(
                user_model.User.department == department,
                user_model.User.role == 'Admin',
                user_model.User.approved_status == 'approved',
                user_model.User.status == True
            ).first()
            
            if admin:
                recipient_email = admin.email
                logger.info(f"Manager registration: Sending approval email to Admin ({recipient_email})")
            else:
                db.rollback()
                logger.error(f"No ARC admin found")
                raise DatabaseQueryException(
                    operation="user registration",
                    reason="No ARC admin found",
                    custom_message="No ARC admin found. Please contact administrator.",
                    status_code=400
                )
    
    # ============================================
    # CREATE USER (UNIFIED)
    # ============================================
    # Create user with custom user_id
    user = user_model.User(
        user_id=user_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        password_hash=utils.hash_password(request.password),
        role=role,
        pharma_id=pharma_id,
        branch_id=branch_id,
        department=department,
        hospital_id=hospital_id,
    )
    
    # Set session timeout based on role (from constants)
    role_lower = role.lower()
    if role_lower == 'admin':
        user.session_timeout = ADMIN_SESSION_TIMEOUT_MINUTES
    elif role_lower == 'manager':
        user.session_timeout = MANAGER_SESSION_TIMEOUT_MINUTES
    elif role_lower == 'user':
        user.session_timeout = USER_SESSION_TIMEOUT_MINUTES
    else:
        user.session_timeout = DEFAULT_SESSION_TIMEOUT_MINUTES
    
    try:
        logger.info(f"Adding user to database: {user.email}, role: {user.role}")
        db.add(user)
        db.flush()  # Flush but don't commit yet - validate first
        logger.debug(f"User flushed to DB (not committed): {user.user_id}")
        
        # Send approval email BEFORE committing
        # If email fails, transaction will rollback
        send_approval_email(
            registration_id=str(user.user_id),
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            role=request.role,
            company=company_name,
            recipient_email=recipient_email
        )
        logger.info("Approval email sent successfully")
        
        # Email sent successfully, NOW commit the entire transaction (user + pharma)
        db.commit()
        db.refresh(user)
        logger.info(f"User and pharma created successfully: {user.user_id}")
        
    except IntegrityError as e:
        db.rollback()
        logger.error(f"IntegrityError during registration: {str(e)}")
        # Check if it's a duplicate email error
        if 'email' in str(e).lower() or 'unique' in str(e).lower():
            raise EmailAlreadyExistsException(email=request.email)
        else:
            raise DatabaseQueryException(operation="user registration", reason=str(e))
    except Exception as e:
        # Rollback on ANY error (including email failure)
        db.rollback()
        logger.error(f"Registration failed, rolling back: {type(e).__name__}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # If it's already a custom exception, re-raise it
        if hasattr(e, 'error_code'):
            raise e
        
        # If it's an email error, raise a more specific exception
        if 'email' in str(e).lower() or 'sendgrid' in str(e).lower():
            raise RegistrationEmailFailedException(email=request.email, reason=str(e))
        else:
            raise DatabaseQueryException(operation="user registration", reason=str(e))

    # Build response message using constants
    # If we reach here, email was sent successfully (otherwise exception would have been raised)
    message = SuccessMessages.REGISTRATION_SENT_TO_ADMIN
    
    # Build structured response
    response = UserRegistrationResponse(
        message=message,
        user_id=user.user_id,
        email=user.email,
        role=normalize_role_to_title_case(user.role),
        pharma_id=user.pharma_id,
        company_name=company_name,
        hospital_id=user.hospital_id,
        branch_id=user.branch_id,
        department=user.department,
        approval_status=user.approved_status,
        approval_sent_to=recipient_email
    )
    return response


def approve_user(registration_id: str, approved_by_user_id: str, db: Session) -> UserApprovalResponse:
    """
    Approve user registration with audit trail (supports both pharma and hospital).
    
    Uses department to determine user type:
    - CGT or other pharma departments = pharma user
    - IVF, Oncology, etc. = hospital user
    
    Args:
        registration_id: User ID to approve
        approved_by_user_id: Approver user ID (Pharma Admin for pharma, Manager/Admin for hospital)
        db: Database session
        
    Returns:
        UserApprovalResponse with approval details
        
    Raises:
        UserApproveNotFoundException: If user not found
        CompanyAccessForbiddenException: If approver cannot approve this user
    """
    # Get user from database
    user = db.query(user_model.User).filter(user_model.User.user_id == registration_id).first()
    if not user:
        raise UserApproveNotFoundException(registration_id=registration_id)
    
    # Get approver from database
    approver = db.query(user_model.User).filter(user_model.User.user_id == approved_by_user_id).first()
    if not approver:
        raise UserApproveNotFoundException(registration_id=approved_by_user_id)
    
    # Determine user type from department
    is_hospital_user = is_hospital_department(user.department) if user.department else False
    
    # ============================================
    # PHARMA APPROVAL LOGIC (EXISTING - NO CHANGES)
    # ============================================
    if not is_hospital_user:
        # Approver must be pharma admin from same pharma
        if approver.role.lower() != 'pharma_admin':
            raise CompanyAccessForbiddenException(
                user_company=f"pharma_id_{approver.pharma_id}",
                target_company=f"pharma_id_{user.pharma_id}"
            )
        
        if approver.pharma_id != user.pharma_id:
            raise CompanyAccessForbiddenException(
                user_company=f"pharma_id_{approver.pharma_id}",
                target_company=f"pharma_id_{user.pharma_id}"
            )
    
    # ============================================
    # HOSPITAL APPROVAL LOGIC (IVF)
    # ============================================
    else:  # is_hospital_user == True
        # For IVF: Admin from same hospital (any branch) can approve both User and Manager roles
        approver_role_lower = approver.role.lower()
        
        # Only Admin can approve hospital users
        if approver_role_lower != 'admin':
            raise CompanyAccessForbiddenException(
                user_company=f"branch_id_{approver.branch_id if approver.branch_id else approver.role.lower()}",
                target_company=f"branch_id_{user.branch_id}"
            )
        
        # Verify Admin is from same hospital (any branch allowed)
        if not approver.hospital_id or not user.hospital_id:
            raise CompanyAccessForbiddenException(
                user_company=f"hospital_id_{approver.hospital_id or 'unknown'}",
                target_company=f"hospital_id_{user.hospital_id or 'unknown'}"
            )
        if approver.hospital_id != user.hospital_id:
            raise CompanyAccessForbiddenException(
                user_company=f"hospital_id_{approver.hospital_id}",
                target_company=f"hospital_id_{user.hospital_id}"
            )
    
    # ============================================
    # APPROVE USER (UNIFIED)
    # ============================================
    
    # Business Logic: Set approval status and audit trail
    user.approved_status = 'approved'
    user.status = True
    user.approved_by = str(approved_by_user_id)
    # Store as timezone-naive UTC to avoid timezone conversion issues in PostgreSQL
    # The column is timezone-naive, so we store UTC time without timezone info
    user.approved_on = datetime.now(timezone.utc).replace(tzinfo=None)
    user.updated_by = str(approved_by_user_id)
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.commit()
    db.refresh(user)
    
    # Get company name for email
    is_hospital_user = is_hospital_department(user.department) if user.department else False
    
    if not is_hospital_user:
        # Get company name from pharma table
        pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
        company_name = pharma.pharma_name if pharma else "Unknown"
    else:
        # Get hospital name from branch
        branch = db.query(HospitalBranch).filter(
            HospitalBranch.branch_id == user.branch_id
        ).first()
        hospital = db.query(Hospital).filter(
            Hospital.hospital_id == branch.hospital_id
        ).first() if branch else None
        company_name = hospital.hospital_name if hospital else "Unknown"
    
    # Send approval notification email to the user
    try:
        
        # Format approved date in UTC with UTC label
        # The datetime is stored as timezone-naive UTC, so we just add UTC timezone info
        if user.approved_on.tzinfo is None:
            # Timezone-naive datetime is stored as UTC, so add UTC timezone without conversion
            approved_date_utc = user.approved_on.replace(tzinfo=timezone.utc)
        else:
            # If somehow timezone-aware, convert to UTC
            approved_date_utc = user.approved_on.astimezone(timezone.utc)
        
        # Format the UTC datetime
        approved_date = approved_date_utc.strftime("%B %d, %Y at %I:%M %p UTC")
        send_user_approved_notification(
            user_email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role,
            company=company_name,
            approved_date=approved_date
        )
        logger.info(f"Approval notification email sent to {user.email}")
    except Exception as e:
        # Log email failure but don't fail the approval process
        logger.error(f"Failed to send approval notification email to {user.email}: {str(e)}")
    
    # Build response object
    # company_name already retrieved above for email
    
    response = UserApprovalResponse(
        detail=f"{SuccessMessages.USER_APPROVED}: {user.first_name}",
        user_id=user.user_id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=normalize_role_to_title_case(user.role),
        company_name=company_name,
        pharma_id=user.pharma_id,
        hospital_id=user.hospital_id,
        branch_id=user.branch_id,
        department=user.department,
        approved_by=user.approved_by,
        approved_on=user.approved_on.isoformat()
    )
    return response


def reject_user(registration_id: str, rejected_by_user_id: str, db: Session) -> UserRejectionResponse:
    """
    Reject user registration with audit trail.
    
    Args:
        registration_id: User ID to reject
        rejected_by_user_id: Pharma Admin user ID
        db: Database session
        
    Returns:
        UserRejectionResponse with rejection details
        
    Raises:
        UserRejectNotFoundException: If user not found
        CompanyAccessForbiddenException: If pharma admin cannot reject this company
    """
    # Get user from database
    user = db.query(user_model.User).filter(user_model.User.user_id == registration_id).first()
    if not user:
        raise UserRejectNotFoundException(registration_id=registration_id)
    
    # Get rejector from database
    rejector = db.query(user_model.User).filter(user_model.User.user_id == rejected_by_user_id).first()
    if not rejector:
        raise UserRejectNotFoundException(registration_id=rejected_by_user_id)
    
    # Validate that rejector is a pharma admin for the same pharma
    if rejector.role.lower() != 'pharma_admin' or rejector.pharma_id != user.pharma_id:
        raise CompanyAccessForbiddenException(
            user_company=f"pharma_id_{rejector.pharma_id}",
            target_company=f"pharma_id_{user.pharma_id}"
        )
    
    # Business Logic: Set rejection status and audit trail
    user.approved_status = 'rejected'
    user.status = False
    user.updated_by = str(rejected_by_user_id)
    user.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Build response object
    response = UserRejectionResponse(
        detail=f"{SuccessMessages.USER_REJECTED}: {user.first_name}",
        rejected_by=rejected_by_user_id,
        rejected_on=datetime.now(timezone.utc).isoformat()
    )
    return response


def get_user_details_by_id(user_id: str, current_user: User, db: Session) -> UserDetailsResponse:
    """
    Get user details by user ID with multi-tenant validation.
    
    Args:
        user_id: User ID to retrieve
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UserDetailsResponse with user details
        
    Raises:
        UserGetNotFoundException: If user not found
        CompanyAccessForbiddenException: If trying to access user from different company
    """
    # Get target user from database
    target_user = db.query(user_model.User).filter(user_model.User.user_id == user_id).first()
    if not target_user:
        raise UserGetNotFoundException(registration_id=user_id)
    
    # Multi-tenant check: Manager can only view users from their pharma
    # Admin can view all users
    if current_user.role.lower() != 'admin':
        if target_user.pharma_id != current_user.pharma_id:
            raise CompanyAccessForbiddenException(
                user_company=f"pharma_id_{current_user.pharma_id}",
                target_company=f"pharma_id_{target_user.pharma_id}"
            )
    
    # Get company name from pharma table
    pharma = db.query(Pharma).filter(Pharma.id == target_user.pharma_id).first()
    company_name = pharma.pharma_name if pharma else None
    
    # Build response object
    response = UserDetailsResponse(
        user_id=target_user.user_id,
        first_name=target_user.first_name,
        last_name=target_user.last_name,
        email=target_user.email,
        role=normalize_role_to_title_case(target_user.role),
        pharma_id=target_user.pharma_id,
        company_name=company_name,
        approved_status=target_user.approved_status,
        status=target_user.status,
        is_locked=target_user.is_locked,
        login_attempts=target_user.login_attempts,
        last_login=target_user.last_login,
        session_timeout=target_user.session_timeout
    )
    return response


def get_user_profile(user: user_model.User, db: Session) -> UserProfileResponse:
    """
    Build UserProfileResponse DTO from User model.
    
    Args:
        user: User model from authentication
        db: Database session
        
    Returns:
        UserProfileResponse DTO with all profile fields
    """
    # Get company name from pharma table
    pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
    company_name = pharma.pharma_name if pharma else None
    
    # Build response object
    response = UserProfileResponse(
        user_id=user.user_id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=normalize_role_to_title_case(user.role),
        pharma_id=user.pharma_id,
        company_name=company_name,
        approved_status=user.approved_status,
        status=user.status,
        session_timeout=user.session_timeout,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at
    )
    return response


def get_all_users(db: Session, current_user: User) -> UserListResponse:
    """
    Get list of all users in the system from the same company.
    
    Multi-tenant filtering: Users can only see other users from their own company.
    
    Args:
        db: Database session
        current_user: Current authenticated user
        
    Returns:
        UserListResponse with users from current user's company
    """
    try:
        # Query all approved and active users FROM SAME PHARMA (multi-tenant filtering)
        users = db.query(User).filter(
            User.approved_status == 'approved',
            User.status == True,
            User.pharma_id == current_user.pharma_id  # ✅ FILTER BY PHARMA
        ).all()
        
        # Get company names from pharma table
        pharma = db.query(Pharma).filter(Pharma.id == current_user.pharma_id).first()
        company_name = pharma.pharma_name if pharma else None
        
        # Convert to UserListItem
        user_items = [
            UserListItem(
                user_id=user.user_id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                role=normalize_role_to_title_case(user.role),
                pharma_id=user.pharma_id,
                company_name=company_name
            )
            for user in users
        ]
        
        return UserListResponse(
            total_users=len(user_items),
            users=user_items
        )
    except Exception as e:
        raise DatabaseQueryException(operation="list users", reason=str(e))


def update_user_name(
    user_id: str, 
    update_request: user_schema.UserNameUpdateRequest, 
    current_user: User, 
    db: Session
) -> user_schema.UserUpdateResponse:
    """
    Update user's first and last name with strict authorization and audit trail.
    
    Only the user themselves can update their own profile. No one else (including 
    managers and admins) can update another user's name.
    
    Args:
        user_id: User ID to update
        update_request: Update request with new first and last name
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UserUpdateResponse with update details
        
    Raises:
        UserUpdateNotFoundException: If user not found
        UserUpdateForbiddenException: If trying to update another user's profile
        DatabaseQueryException: If database operation fails
    """
    # Get target user from database
    target_user = db.query(user_model.User).filter(user_model.User.user_id == user_id).first()
    if not target_user:
        raise UserUpdateNotFoundException(user_id=user_id)
    
    # Authorization check: Only the user themselves can update their own profile
    # No one else (including managers and admins) can update another user's name
    if target_user.user_id != current_user.user_id:
        raise UserUpdateForbiddenException(user_id=user_id)
    
    try:
        # Update user fields with audit trail
        target_user.first_name = update_request.first_name
        target_user.last_name = update_request.last_name
        target_user.updated_by = current_user.user_id
        target_user.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(target_user)
        
        # Build response object
        response = user_schema.UserUpdateResponse(
            message=SuccessMessages.PROFILE_UPDATED,
            user_id=target_user.user_id,
            first_name=target_user.first_name,
            last_name=target_user.last_name,
            updated_at=target_user.updated_at
        )
        return response
        
    except Exception as e:
        db.rollback()
        raise DatabaseQueryException(operation="update user name", reason=str(e))