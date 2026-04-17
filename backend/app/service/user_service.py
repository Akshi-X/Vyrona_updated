from sqlalchemy.orm import Session
from sqlalchemy import or_
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
from app.schemas.user_schema import UserListResponse, UserListItem, UserNameUpdateRequest, UserUpdateResponse, HospitalUserItem, HospitalUserListResponse, InviteUserRequest, InviteTokenResponse, RegisterFromInviteRequest
from app.service.email_service import send_approval_email, send_user_approved_notification, send_invite_email
from app.service.activity_log_service import (
    ActivityLogService,
    build_actor_from_user,
    build_target,
    is_audit_log_disabled_for_user,
)
from app.constants.enums import ActivityOutcome
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
from app.config.config import settings
from app.models.pharma_model import Pharma
from app.models.IVF.hospital_model import Hospital
from app.models.IVF.hospital_branch_model import HospitalBranch
from app.utils.user_helpers import (
    get_hospital_by_email_domain,
    is_hospital_department,
)
from app.utils.utils import normalize_role_to_title_case
from app.constants.enums import ApprovalStatus
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


def get_mygrape_admin_email(db: Session) -> Optional[str]:
    """
    Get an active approved MyGrape admin email from the users table.
    
    Returns:
        MyGrape admin email if found, otherwise None
    """
    try:
        mygrape_admin = db.query(user_model.User).filter(
            user_model.User.role == 'Mygrape_admin',
            user_model.User.approved_status == 'approved',
            user_model.User.status == True
        ).first()

        if not mygrape_admin:
            logger.warning("No active approved MyGrape admin found in users table")
            return None

        return mygrape_admin.email
    except Exception as e:
        logger.error(f"Error getting MyGrape admin email from DB: {str(e)}")
        return None


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

        # Branch required only for User role; Manager can register without branch (views all branches)
        role_lower_h = (role or "").strip().lower()
        if role_lower_h == "manager":
            # Manager never requires branch; ensure we don't use branch_name
            pass
        elif role_lower_h == "user" and not request.branch_name:
            raise DatabaseQueryException(
                operation="user registration",
                reason="Branch required",
                custom_message="branch_name is required for User role",
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

        # Manager: no branch (branch_id stays None). User: resolve branch from branch_name.
        if role_lower_h == "manager":
            branch_id = None
        else:
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
        ) # TODO:DevlopmentUncomment
        logger.info("Approval email sent successfully")
        
        # Email sent successfully, NOW commit the entire transaction (user + pharma)
        db.commit()
        db.refresh(user)
        logger.info(f"User and pharma created successfully: {user.user_id}")

        ActivityLogService(db).log_activity(
            action="user.registered",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            target=build_target("user", user.user_id, f"{user.first_name} {user.last_name}".strip()),
            metadata={
                "role": role,
                "department": department,
                "approval_sent_to": recipient_email,
            },
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )

        ActivityLogService(db).log_activity(
            action="email.user_approval_requested",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(user),
            metadata={"recipient_email": recipient_email},
            audit_log_disabled=is_audit_log_disabled_for_user(user),
        )
        
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

    ActivityLogService(db).log_activity(
        action="user.approved",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(approver),
        target=build_target("user", user.user_id, f"{user.first_name} {user.last_name}".strip()),
        metadata={"role": normalize_role_to_title_case(user.role)},
        audit_log_disabled=is_audit_log_disabled_for_user(approver),
    )
    
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
        ActivityLogService(db).log_activity(
            action="email.user_approved_sent",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(approver),
            target=build_target("user", user.user_id, f"{user.first_name} {user.last_name}".strip()),
            metadata={"recipient_email": user.email},
            audit_log_disabled=is_audit_log_disabled_for_user(approver),
        )
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

    ActivityLogService(db).log_activity(
        action="user.rejected",
        outcome=ActivityOutcome.SUCCESS.value,
        actor=build_actor_from_user(rejector),
        target=build_target("user", user.user_id, f"{user.first_name} {user.last_name}".strip()),
        metadata={"role": normalize_role_to_title_case(user.role)},
        audit_log_disabled=is_audit_log_disabled_for_user(rejector),
    )
    
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
    # Workspace label: pharma company name or hospital name (for profile/UI "workspace" line)
    company_name = None
    if user.pharma_id is not None:
        pharma = db.query(Pharma).filter(Pharma.id == user.pharma_id).first()
        company_name = pharma.pharma_name if pharma else None
    elif getattr(user, "hospital_id", None) is not None:
        hospital = db.query(Hospital).filter(Hospital.hospital_id == user.hospital_id).first()
        company_name = hospital.hospital_name if hospital else None

    # Serialise enum to str for response (same pattern as elsewhere: e.g. critical_alert_service uses .value)
    approved_status_str = (
        user.approved_status.value
        if hasattr(user.approved_status, "value")
        else str(user.approved_status or "")
    )

    # User model has nullable columns; pass concrete values so response schema (str/int/bool) is satisfied
    first_name = user.first_name or ""
    last_name = user.last_name or ""
    email = user.email or ""
    role = normalize_role_to_title_case(user.role) if user.role is not None else "User"
    session_timeout = 30 if user.session_timeout is None else user.session_timeout
    status = False if user.status is None else user.status

    response = UserProfileResponse(
        user_id=user.user_id,
        email=email,
        first_name=first_name,
        last_name=last_name,
        role=role,
        pharma_id=user.pharma_id,
        company_name=company_name,
        approved_status=approved_status_str,
        status=status,
        session_timeout=session_timeout,
        phone_number=getattr(user, 'phone_number', None),
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
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
        # Scope users based on tenant type:
        # - Hospital users (IVF/Oncology): same hospital (+ same department when available)
        # - Pharma users (CGT): same pharma
        # This prevents cross-tenant leakage (e.g., MyGrape admin users in IVF mentions).
        base_query = db.query(User).filter(
            User.approved_status == 'approved',
            User.status == True
        )

        company_name = None
        if current_user.hospital_id is not None:
            users_query = base_query.filter(
                User.hospital_id == current_user.hospital_id
            )

            if current_user.department:
                users_query = users_query.filter(
                    User.department.ilike(current_user.department)
                )

            users = users_query.all()
        else:
            users = base_query.filter(
                User.pharma_id == current_user.pharma_id
            ).all()

            # Get company names from pharma table (pharma users only)
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


def get_hospital_users(db: Session, current_user: User) -> HospitalUserListResponse:
    """
    Get all users belonging to the same hospital as the current user.
    Returns hospital-specific fields only (no pharma data).
    """
    try:
        if current_user.hospital_id is None:
            return HospitalUserListResponse(total_users=0, users=[])

        users = db.query(User).filter(
            User.hospital_id == current_user.hospital_id,
        ).all()

        user_items = [
            HospitalUserItem(
                user_id=user.user_id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                role=normalize_role_to_title_case(user.role),
                branch_name=user.branch.branch_name if user.branch else None,
                department=user.department,
                status=bool(user.status),
                approved_status=user.approved_status if isinstance(user.approved_status, str) else user.approved_status.value,
                invite_pending=user.invite_token is not None,
            )
            for user in users
        ]

        return HospitalUserListResponse(total_users=len(user_items), users=user_items)
    except Exception as e:
        raise DatabaseQueryException(operation="list hospital users", reason=str(e))


def invite_user(db: Session, current_user: User, email: str, role: str, base_url: str, branch_name: str = None) -> dict:
    """Create a pending user row with an invite token and send the invite email."""
    import uuid
    from datetime import timedelta

    if current_user.hospital_id is None:
        raise ValueError("Current user is not associated with a hospital.")

    # Duplicate check
    existing = db.query(User).filter(User.email == email.lower().strip()).first()
    if existing:
        raise ValueError("A user with this email already exists.")

    role_norm = normalize_role_to_title_case(role)
    if role_norm not in ("User", "Manager", "Admin"):
        raise ValueError("Role must be User, Manager, or Admin.")

    hospital = db.query(Hospital).filter(Hospital.hospital_id == current_user.hospital_id).first()
    if not hospital:
        raise ValueError("Hospital not found.")

    branch_id = None
    if role_norm == "User":
        if not branch_name:
            raise ValueError("branch_name is required for User role.")
        branch = db.query(HospitalBranch).filter(
            HospitalBranch.branch_name == branch_name,
            HospitalBranch.hospital_id == hospital.hospital_id,
        ).first()
        if not branch:
            raise ValueError(f"Branch '{branch_name}' not found.")
        branch_id = branch.branch_id

    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
    department = hospital.hospital_type or "IVF"

    invited_user = User(
        user_id=utils.generate_user_id(),
        first_name="",
        last_name="",
        email=email.lower().strip(),
        password_hash="INVITE_PENDING",
        role=role_norm,
        hospital_id=hospital.hospital_id,
        branch_id=branch_id,
        department=department,
        approved_status="pending",
        status=False,
        created_by=current_user.user_id,
        invite_token=token,
        invite_token_expires_at=expires_at,
    )
    db.add(invited_user)
    db.commit()

    invite_url = f"{base_url}/invite?token={token}"
    invited_by = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email
    send_invite_email(
        recipient_email=email,
        invited_by=invited_by,
        role=role_norm,
        company=hospital.hospital_name,
        signup_url=invite_url,
    )
    return {"message": f"Invite sent to {email}"}


def resend_invite(db: Session, current_user: User, user_id: str, base_url: str) -> dict:
    """Generate a fresh invite token for a pending user and resend the email."""
    import uuid
    from datetime import timedelta

    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        raise ValueError("User not found.")
    if target.hospital_id != current_user.hospital_id:
        raise ValueError("Access denied.")
    if target.status:
        raise ValueError("User has already accepted the invite.")
    if not target.invite_token:
        raise ValueError("No pending invite for this user.")

    hospital = db.query(Hospital).filter(Hospital.hospital_id == current_user.hospital_id).first()

    token = uuid.uuid4().hex
    target.invite_token = token
    target.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
    db.commit()

    invite_url = f"{base_url}/invite?token={token}"
    invited_by = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email
    send_invite_email(
        recipient_email=target.email,
        invited_by=invited_by,
        role=normalize_role_to_title_case(target.role),
        company=hospital.hospital_name if hospital else "myGrape",
        signup_url=invite_url,
    )
    return {"message": f"Invite resent to {target.email}"}


def get_invite_token(db: Session, token: str) -> InviteTokenResponse:
    """Validate an invite token and return its metadata (stored in users table)."""
    user = db.query(User).filter(User.invite_token == token).first()
    if not user:
        raise ValueError("Invalid invite link.")
    if user.status:
        raise ValueError("This invite link has already been used.")
    now = datetime.now(timezone.utc)
    expires = user.invite_token_expires_at
    if expires and expires.tzinfo is None:
        from datetime import timezone as tz
        expires = expires.replace(tzinfo=tz.utc)
    if expires and now > expires:
        raise ValueError("This invite link has expired.")

    hospital_name = None
    if user.hospital_id:
        hospital = db.query(Hospital).filter(Hospital.hospital_id == user.hospital_id).first()
        hospital_name = hospital.hospital_name if hospital else None

    branch_name = user.branch.branch_name if user.branch else None

    return InviteTokenResponse(
        email=user.email,
        role=normalize_role_to_title_case(user.role),
        branch_name=branch_name,
        hospital_name=hospital_name,
        expires_at=user.invite_token_expires_at,
    )


def register_from_invite(db: Session, data: RegisterFromInviteRequest) -> dict:
    """Complete registration from an invite link by updating the pending user row."""
    if data.password != data.confirm_password:
        raise ValueError("Passwords do not match.")

    user = db.query(User).filter(User.invite_token == data.token).first()
    if not user:
        raise ValueError("Invalid invite link.")
    if user.status:
        raise ValueError("This invite link has already been used.")
    now = datetime.now(timezone.utc)
    expires = user.invite_token_expires_at
    if expires and expires.tzinfo is None:
        from datetime import timezone as tz
        expires = expires.replace(tzinfo=tz.utc)
    if expires and now > expires:
        raise ValueError("This invite link has expired.")

    user.first_name = data.first_name.strip()
    user.last_name = data.last_name.strip()
    user.password_hash = utils.hash_password(data.password)
    user.approved_status = "approved"
    user.approved_by = user.created_by
    user.approved_on = now
    user.status = True
    user.invite_token = None
    user.invite_token_expires_at = None
    user.updated_at = now
    db.commit()

    return {"message": "Account created successfully.", "user_id": user.user_id}


def _resolve_hospital_id_from_branch(db: Session, user: User) -> Optional[int]:
    """
    Resolve hospital_id from user.branch_id when user.hospital_id is null.
    Only used by get_pending_approvals for hospital users (e.g. token has no hospital_id).
    Does not modify any state; get_all_users and other callers are unchanged.
    """
    if user.branch_id is None:
        return None
    branch = db.query(HospitalBranch).filter(HospitalBranch.branch_id == user.branch_id).first()
    return branch.hospital_id if branch is not None else None


def get_pending_approvals(db: Session, current_user: User) -> UserListResponse:
    """
    Get list of users with pending approval status from the same company/hospital.

    Same multi-tenant filtering as get_all_users but filters by approved_status == 'pending'.
    Only Admin and Pharma_admin (and hospital Admin) can call this; used for approval screen and dashboard.
    Returns only users whose approved_status is strictly 'pending' (never approved/rejected).
    """
    try:
        # Explicitly filter only pending: compare with enum and value for DB compatibility
        pending_value = ApprovalStatus.PENDING.value  # "pending"
        base_query = db.query(User).filter(
            User.approved_status == pending_value
        )

        company_name = None
        # Hospital path: keep existing behavior when hospital_id is set (same as get_all_users)
        if current_user.hospital_id is not None:
            users_query = base_query.filter(
                User.hospital_id == current_user.hospital_id
            )
            if current_user.department:
                users_query = users_query.filter(
                    User.department.ilike(current_user.department)
                )
            users = users_query.all()
        # Hospital user with hospital_id null but branch_id set (e.g. JWT has no hospital_id)
        else:
            effective_hospital_id = _resolve_hospital_id_from_branch(db, current_user)
            if effective_hospital_id is not None:
                branch_ids_in_hospital = db.query(HospitalBranch.branch_id).filter(
                    HospitalBranch.hospital_id == effective_hospital_id
                )
                users_query = base_query.filter(
                    or_(
                        User.hospital_id == effective_hospital_id,
                        User.branch_id.in_(branch_ids_in_hospital),
                    )
                )
                if current_user.department:
                    users_query = users_query.filter(
                        User.department.ilike(current_user.department)
                    )
                users = users_query.all()
            else:
                # Pharma path: unchanged
                users = base_query.filter(
                    User.pharma_id == current_user.pharma_id
                ).all()
                pharma = db.query(Pharma).filter(Pharma.id == current_user.pharma_id).first()
                company_name = pharma.pharma_name if pharma else None

        # Only include users that are still pending (defensive: in case of enum/DB mismatch)
        def _is_pending(u: User) -> bool:
            status = getattr(u, "approved_status", None)
            if status is None:
                return False
            return (status == ApprovalStatus.PENDING or
                    (getattr(status, "value", status)) == pending_value)

        pending_only = [u for u in users if _is_pending(u)]
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
            for user in pending_only
        ]

        return UserListResponse(
            total_users=len(user_items),
            users=user_items
        )
    except Exception as e:
        raise DatabaseQueryException(operation="list pending approvals", reason=str(e))


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
        if update_request.phone_number is not None:
            target_user.phone_number = update_request.phone_number or None
        target_user.updated_by = current_user.user_id
        target_user.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(target_user)

        fields = ["first_name", "last_name"]
        if update_request.phone_number is not None:
            fields.append("phone_number")
        ActivityLogService(db).log_activity(
            action="user.profile_updated",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=build_actor_from_user(current_user),
            target=build_target("user", target_user.user_id, f"{target_user.first_name} {target_user.last_name}".strip()),
            metadata={
                "fields": fields,
            },
            audit_log_disabled=is_audit_log_disabled_for_user(current_user),
        )
        
        # Build response object
        response = user_schema.UserUpdateResponse(
            message=SuccessMessages.PROFILE_UPDATED,
            user_id=target_user.user_id,
            first_name=target_user.first_name,
            last_name=target_user.last_name,
            phone_number=getattr(target_user, 'phone_number', None),
            updated_at=target_user.updated_at
        )
        return response
        
    except Exception as e:
        db.rollback()
        raise DatabaseQueryException(operation="update user name", reason=str(e))