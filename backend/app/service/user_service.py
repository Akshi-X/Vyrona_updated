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
from app.constants.messages import SuccessMessages
from app.config.config import settings

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
            user_model.User.role == 'pharma_admin',
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
    from ..config.config import get_settings
    settings = get_settings()
    return settings.MYGRAPE_ADMIN_EMAIL


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
        user_model.User.role == 'manager',
        user_model.User.approved_status == 'approved',
        user_model.User.status == True
    ).first()
    
    return manager.email if manager else None


def register_user(db: Session, request: user_schema.UserRegister) -> UserRegistrationResponse:
    """
    Register a new user with proper transaction handling.
    
    If email sending fails, user record is rolled back to prevent orphaned accounts.
    Validation already done in dependency.
    """
    # Normalize role to lowercase (database enum is lowercase)
    role_lower = request.role.lower()
    
    # Generate custom user ID (USR-XXXXXX format)
    user_id = utils.generate_user_id()
    
    # ============================================
    # PHARMA VALIDATION LOGIC
    # ============================================
    # Check if pharma exists
    from app.models.pharma_model import Pharma
    
    existing_pharma = db.query(Pharma).filter(Pharma.pharma_name == request.company_name).first()
    
    if existing_pharma:
        # Pharma exists, use existing pharma_id
        pharma_id = existing_pharma.id
        logger.info(f"Using existing pharma: {existing_pharma.pharma_name} (ID: {pharma_id})")
    else:
        # Pharma doesn't exist - reject registration
        logger.error(f"Pharma '{request.company_name}' doesn't exist - registration not allowed")
        raise DatabaseQueryException(
            operation="user registration", 
            reason=f"user cannot be registered. For further support, kindly reach out to ITAdmin@myGrape.com.",
            custom_message=f"user cannot be registered. For further support, kindly reach out to ITAdmin@myGrape.com.",
            status_code=400
        )
    
    # ============================================
    # END PHARMA VALIDATION LOGIC
    # ============================================
    
    # Create user with custom user_id
    user = user_model.User(
        user_id=user_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        password_hash=utils.hash_password(request.password),
        role=role_lower,
        pharma_id=pharma_id,
    )
    
    # Set session timeout based on role (from constants)
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
        
        # Determine recipient for approval email
        logger.info(f"Preparing to send approval email for role: {role_lower}")
        recipient_email = None
        
        # Check if pharma admin exists for this pharma
        pharma_admin_email = get_pharma_admin_email(pharma_id, db)
        
        if not pharma_admin_email:
            # No pharma admin for this pharma - registration not allowed
            db.rollback()
            logger.error(f"No pharma admin found for pharma_id: {pharma_id}")
            raise DatabaseQueryException(
                operation="user registration", 
                reason=f"user cannot be registered. For further support, kindly reach out to ITAdmin@myGrape.com.",
                custom_message=f"user cannot be registered. For further support, kindly reach out to ITAdmin@myGrape.com.",
                status_code=400
            )
        
        # Both manager and user registrations go to pharma admin
        recipient_email = pharma_admin_email
        logger.info(f"Registration: Sending approval email to Pharma Admin ({recipient_email}) for pharma_id: {pharma_id}")
        
        # Send approval email BEFORE committing
        # If email fails, transaction will rollback
        send_approval_email(
            registration_id=str(user.user_id),
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            role=request.role,
            company=existing_pharma.pharma_name,
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
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # If it's already a custom exception, re-raise it
        if hasattr(e, 'error_code'):
            raise e
        
        # If it's an email error, raise a more specific exception
        if 'email' in str(e).lower() or 'smtp' in str(e).lower():
            raise RegistrationEmailFailedException(email=request.email, reason=str(e))
        else:
            raise DatabaseQueryException(operation="user registration", reason=str(e))

    # Build response message using constants
    # If we reach here, email was sent successfully (otherwise exception would have been raised)
    # Both manager and user registrations go to pharma admin
    message = SuccessMessages.REGISTRATION_SENT_TO_ADMIN
    
    # Build structured response
    response = UserRegistrationResponse(
        message=message,
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        pharma_id=user.pharma_id,
        company_name=existing_pharma.pharma_name,
        approval_status=user.approved_status,
        approval_sent_to=recipient_email
    )
    return response


def approve_user(registration_id: str, approved_by_user_id: str, db: Session) -> UserApprovalResponse:
    """
    Approve user registration with audit trail.
    
    Args:
        registration_id: User ID to approve
        approved_by_user_id: Pharma Admin user ID
        db: Database session
        
    Returns:
        UserApprovalResponse with approval details
        
    Raises:
        UserApproveNotFoundException: If user not found
        CompanyAccessForbiddenException: If pharma admin cannot approve this company
    """
    # Get user from database
    user = db.query(user_model.User).filter(user_model.User.user_id == registration_id).first()
    if not user:
        raise UserApproveNotFoundException(registration_id=registration_id)
    
    # Get approver from database
    approver = db.query(user_model.User).filter(user_model.User.user_id == approved_by_user_id).first()
    if not approver:
        raise UserApproveNotFoundException(registration_id=approved_by_user_id)
    
    # Validate that approver is a pharma admin for the same pharma
    if approver.role != 'pharma_admin' or approver.pharma_id != user.pharma_id:
        raise CompanyAccessForbiddenException(
            company_name=f"pharma_id_{user.pharma_id}",
            reason="Only pharma admin from the same company can approve users"
        )
    
    # Business Logic: Set approval status and audit trail
    user.approved_status = 'approved'
    user.status = True
    user.approved_by = str(approved_by_user_id)
    user.approved_on = datetime.now(timezone.utc)
    user.updated_by = str(approved_by_user_id)
    user.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(user)
    
    # Send approval notification email to the user
    try:
        # Get company name from pharma table
        from app.models.pharma_model import Pharma
        pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
        company_name = pharma.pharma_name if pharma else f"pharma_id_{user.pharma_id}"
        
        approved_date = user.approved_on.strftime("%B %d, %Y at %I:%M %p")
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
    # Get company name from pharma table
    from app.models.pharma_model import Pharma
    pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
    company_name = pharma.pharma_name if pharma else f"pharma_id_{user.pharma_id}"
    
    response = UserApprovalResponse(
        detail=f"{SuccessMessages.USER_APPROVED}: {user.first_name}",
        user_id=user.user_id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        company_name=company_name,
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
    if rejector.role != 'pharma_admin' or rejector.pharma_id != user.pharma_id:
        raise CompanyAccessForbiddenException(
            company_name=f"pharma_id_{user.pharma_id}",
            reason="Only pharma admin from the same company can reject users"
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
    from app.models.pharma_model import Pharma
    pharma = db.query(Pharma).filter(Pharma.id == target_user.pharma_id).first()
    company_name = pharma.pharma_name if pharma else None
    
    # Build response object
    response = UserDetailsResponse(
        user_id=target_user.user_id,
        first_name=target_user.first_name,
        last_name=target_user.last_name,
        email=target_user.email,
        role=target_user.role,
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
    from app.models.pharma_model import Pharma
    pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
    company_name = pharma.pharma_name if pharma else None
    
    # Build response object
    response = UserProfileResponse(
        user_id=user.user_id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
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
        from app.models.pharma_model import Pharma
        pharma = db.query(Pharma).filter(Pharma.id == current_user.pharma_id).first()
        company_name = pharma.pharma_name if pharma else None
        
        # Convert to UserListItem
        user_items = [
            UserListItem(
                user_id=user.user_id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                role=user.role,
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