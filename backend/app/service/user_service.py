from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import datetime, timezone

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
from app.service.email_service import send_approval_email
from app.utils import utils
from app.exceptions import (
    EmailAlreadyExistsException,
    DatabaseQueryException,
    UserApproveNotFoundException,
    UserRejectNotFoundException,
    UserGetNotFoundException,
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


def get_company_manager_email(company_name: str, db: Session) -> Optional[str]:
    """
    Get the email of an approved manager from the specified company.
    
    Used for two-level approval: Users need approval from their company manager.
    
    Args:
        company_name: Company name to search for
        db: Database session
        
    Returns:
        Manager's email if found, None otherwise
    """
    manager = db.query(user_model.User).filter(
        user_model.User.company_name == company_name,
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
    
    # Create user with custom user_id
    user = user_model.User(
        user_id=user_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        password_hash=utils.hash_password(request.password),
        role=role_lower,
        company_name=request.company_name,
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
        print(f"Adding user to database: {user.email}, role: {user.role}")
        db.add(user)
        db.flush()  # Flush but don't commit yet - validate first
        print(f"User flushed to DB (not committed): {user.user_id}")
        
        # Determine recipient for approval email
        print(f"Preparing to send approval email for role: {role_lower}")
        recipient_email = None
        
        if role_lower == 'manager':
            # Manager registration → Send to MyGrape Platform Admin
            recipient_email = settings.ADMIN_EMAIL
            print(f"Manager registration: Sending approval email to MyGrape Admin ({recipient_email})")
        else:
            # User registration → Send to Company Manager
            # Find approved manager from the same company
            company_manager_email = get_company_manager_email(request.company_name, db)
            
            if company_manager_email:
                # Company has an approved manager
                recipient_email = company_manager_email
                print(f"User registration: Sending approval email to Company Manager ({recipient_email})")
            else:
                # Company has NO approved manager yet
                # Fallback: Send to MyGrape admin (for first user registration)
                recipient_email = settings.ADMIN_EMAIL
                print(f"WARNING: User registration but no company manager found. Sending to MyGrape Admin ({recipient_email})")
        
        # Send approval email BEFORE committing
        # If email fails, transaction will rollback
        send_approval_email(
            registration_id=str(user.user_id),
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            role=request.role,
            company=request.company_name,
            recipient_email=recipient_email
        )
        print("Approval email sent successfully")
        
        # Email sent successfully, NOW commit the transaction
        db.commit()
        db.refresh(user)
        print(f"User created and email sent successfully: {user.user_id}")
        
    except IntegrityError as e:
        db.rollback()
        print(f"IntegrityError during registration: {str(e)}")
        # Check if it's a duplicate email error
        if 'email' in str(e).lower() or 'unique' in str(e).lower():
            raise EmailAlreadyExistsException(email=request.email)
        else:
            raise DatabaseQueryException(operation="user registration", reason=str(e))
    except Exception as e:
        # Rollback on ANY error (including email failure)
        db.rollback()
        print(f"Registration failed, rolling back: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # If it's an email error, raise a more specific exception
        if 'email' in str(e).lower() or 'smtp' in str(e).lower():
            raise RegistrationEmailFailedException(email=request.email, reason=str(e))
        else:
            raise DatabaseQueryException(operation="user registration", reason=str(e))

    # Build response message using constants
    # If we reach here, email was sent successfully (otherwise exception would have been raised)
    if role_lower == 'manager':
        message = SuccessMessages.REGISTRATION_SENT_TO_ADMIN
    else:
        if recipient_email == settings.ADMIN_EMAIL:
            message = SuccessMessages.REGISTRATION_SENT_TO_ADMIN_NO_MANAGER
        else:
            message = SuccessMessages.REGISTRATION_SENT_TO_MANAGER
    
    # Build structured response
    response = UserRegistrationResponse(
        message=message,
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        company_name=user.company_name,
        approval_status=user.approved_status,
        approval_sent_to=recipient_email
    )
    return response


def approve_user(registration_id: str, approved_by_user_id: str, db: Session) -> UserApprovalResponse:
    """
    Approve user registration with audit trail.
    
    Args:
        registration_id: User ID to approve
        approved_by_user_id: Admin/Manager user ID
        db: Database session
        
    Returns:
        UserApprovalResponse with approval details
        
    Raises:
        UserApproveNotFoundException: If user not found
    """
    # Get user from database
    user = db.query(user_model.User).filter(user_model.User.user_id == registration_id).first()
    if not user:
        raise UserApproveNotFoundException(registration_id=registration_id)
    
    # Business Logic: Set approval status and audit trail
    user.approved_status = 'approved'
    user.status = True
    user.approved_by = str(approved_by_user_id)
    user.approved_on = datetime.now(timezone.utc)
    user.updated_by = str(approved_by_user_id)
    user.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(user)
    
    # Build response object
    response = UserApprovalResponse(
        detail=f"{SuccessMessages.USER_APPROVED}: {user.first_name}",
        user_id=user.user_id,
        approved_by=user.approved_by,
        approved_on=user.approved_on.isoformat()
    )
    return response


def reject_user(registration_id: str, rejected_by_user_id: str, db: Session) -> UserRejectionResponse:
    """
    Reject user registration with audit trail.
    
    Args:
        registration_id: User ID to reject
        rejected_by_user_id: Admin/Manager user ID
        db: Database session
        
    Returns:
        UserRejectionResponse with rejection details
        
    Raises:
        UserRejectNotFoundException: If user not found
    """
    # Get user from database
    user = db.query(user_model.User).filter(user_model.User.user_id == registration_id).first()
    if not user:
        raise UserRejectNotFoundException(registration_id=registration_id)
    
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
    
    # Multi-tenant check: Manager can only view users from their company
    # Admin can view all users
    if current_user.role.lower() != 'admin':
        if target_user.company_name != current_user.company_name:
            raise CompanyAccessForbiddenException(
                user_company=current_user.company_name,
                target_company=target_user.company_name
            )
    
    # Build response object
    response = UserDetailsResponse(
        user_id=target_user.user_id,
        first_name=target_user.first_name,
        last_name=target_user.last_name,
        email=target_user.email,
        role=target_user.role,
        company_name=target_user.company_name,
        approved_status=target_user.approved_status,
        status=target_user.status,
        is_locked=target_user.is_locked,
        login_attempts=target_user.login_attempts,
        last_login=target_user.last_login,
        session_timeout=target_user.session_timeout
    )
    return response


def get_user_profile(user: user_model.User) -> UserProfileResponse:
    """
    Build UserProfileResponse DTO from User model.
    
    Args:
        user: User model from authentication
        
    Returns:
        UserProfileResponse DTO with all profile fields
    """
    # Build response object
    response = UserProfileResponse(
        user_id=user.user_id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        company_name=user.company_name,
        approved_status=user.approved_status,
        status=user.status,
        session_timeout=user.session_timeout,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at
    )
    return response
