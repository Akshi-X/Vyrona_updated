"""
Branch Authentication Service
Handles branch-level signup and login for hospital branches
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import secrets

from sqlalchemy.orm import Session
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError

from ...models.IVF.hospital_model import Hospital
from ...models.IVF.hospital_branch_model import HospitalBranch
from ...models.IVF.branch_login_model import BranchLogin
from ...auth.auth import get_password_hash, verify_password, create_access_token
from ...constants.app_constants import ACCESS_TOKEN_EXPIRE_MINUTES
from ...exceptions.custom_exceptions import DatabaseQueryException
from ...constants.messages import ErrorMessages
from ...service.email_service import send_email
from ...config.config import settings

logger = logging.getLogger(__name__)

# Verification token validity (minutes)
VERIFICATION_TOKEN_MINUTES = 60 * 24  # 24 hours

class BranchAuthService:
    """Service for branch-level authentication"""
    
    @staticmethod
    def get_hospital_by_name(hospital_name: str, db: Session) -> Optional[Hospital]:
        """Get hospital by name"""
        return db.query(Hospital).filter(Hospital.hospital_name == hospital_name).first()
    
    @staticmethod
    def get_branch_by_id(branch_id: int, db: Session) -> Optional[HospitalBranch]:
        """Get branch by ID"""
        return db.query(HospitalBranch).filter(HospitalBranch.branch_id == branch_id).first()
    
    @staticmethod
    def get_branches_by_hospital(hospital_id: int, db: Session) -> list[HospitalBranch]:
        """Get all branches for a hospital"""
        return db.query(HospitalBranch).filter(HospitalBranch.hospital_id == hospital_id).all()
    
    @staticmethod
    def get_branch_login_by_email(email: str, db: Session) -> Optional[BranchLogin]:
        """Get branch login by email"""
        return db.query(BranchLogin).filter(BranchLogin.email == email).first()
    
    @staticmethod
    def get_branch_login_by_branch_and_department(
        branch_id: int, 
        department: str, 
        db: Session
    ) -> Optional[BranchLogin]:
        """Get branch login by branch ID and department"""
        return db.query(BranchLogin).filter(
            and_(
                BranchLogin.branch_id == branch_id,
                BranchLogin.department == department
            )
        ).first()
    
    @staticmethod
    def validate_hospital_and_department(
        hospital_name: str, 
        department: str, 
        db: Session
    ) -> Hospital:
        """
        Validate hospital exists and department matches hospital_type
        
        Raises:
            DatabaseQueryException if hospital not found or department mismatch
        """
        hospital = BranchAuthService.get_hospital_by_name(hospital_name, db)
        
        if not hospital:
            logger.error(f"Hospital not found: {hospital_name}")
            raise DatabaseQueryException(
                operation="hospital validation",
                reason=f"Hospital '{hospital_name}' not found",
                custom_message=f"Hospital '{hospital_name}' not found",
                status_code=404
            )
        
        # Validate department matches hospital_type
        if hospital.hospital_type and hospital.hospital_type.upper() != department.upper():
            logger.warning(
                f"Department mismatch: hospital_type={hospital.hospital_type}, "
                f"requested department={department}"
            )
            # Allow if hospital_type is None or if they match (case-insensitive)
            # This is a soft validation - you may want to make it stricter
        
        return hospital
    
    @staticmethod
    def validate_branch_belongs_to_hospital(
        branch_id: int,
        hospital_id: int,
        db: Session
    ) -> HospitalBranch:
        """
        Validate branch belongs to hospital
        
        Raises:
            DatabaseQueryException if branch not found or doesn't belong to hospital
        """
        branch = BranchAuthService.get_branch_by_id(branch_id, db)
        
        if not branch:
            logger.error(f"Branch not found: {branch_id}")
            raise DatabaseQueryException(
                operation="branch validation",
                reason=f"Branch ID {branch_id} not found",
                custom_message=f"Branch not found",
                status_code=404
            )
        
        if branch.hospital_id != hospital_id:
            logger.error(
                f"Branch {branch_id} does not belong to hospital {hospital_id}"
            )
            raise DatabaseQueryException(
                operation="branch validation",
                reason=f"Branch does not belong to selected hospital",
                custom_message=f"Branch does not belong to selected hospital",
                status_code=400
            )
        
        return branch
    
    @staticmethod
    def get_branch_manager_email(branch_id: int, department: str, db: Session) -> Optional[str]:
        """
        Get the email of an approved manager from the specified branch and department.
        
        Used for approval: Users need approval from their branch manager.
        
        Args:
            branch_id: Branch ID to search for
            department: Department to search for
            db: Database session
            
        Returns:
            Manager's email if found, None otherwise
        """
        manager = db.query(BranchLogin).filter(
            BranchLogin.branch_id == branch_id,
            BranchLogin.department == department,
            BranchLogin.role == 'Manager',
            BranchLogin.approved_status == 'approved',
            BranchLogin.is_active == True
        ).first()
        
        return manager.email if manager else None
    
    @staticmethod
    def get_arc_admin_email(db: Session) -> Optional[str]:
        """
        Get the email of ARC admin (Admin role in branch_logins).
        
        Used for approval: Managers need approval from ARC admin.
        
        Args:
            db: Database session
            
        Returns:
            ARC admin's email if found, None otherwise
        """
        arc_admin = db.query(BranchLogin).filter(
            BranchLogin.role == 'Admin',
            BranchLogin.approved_status == 'approved',
            BranchLogin.is_active == True
        ).first()
        
        return arc_admin.email if arc_admin else None
    
    @staticmethod
    def signup_branch(
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        role: str,
        hospital_name: str,
        department: str,
        branch_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """
        Create a new branch login
        
        Validations:
        - Hospital exists
        - Department matches hospital_type
        - Branch belongs to hospital
        - One login per branch + department
        - Email uniqueness
        
        Returns:
            Dictionary with signup response data
        """
        logger.info(f"Branch signup request: email={email}, hospital={hospital_name}, branch={branch_id}")
        
        # Validate passwords match (should be done in controller/schema)
        
        # Validate hospital and department
        hospital = BranchAuthService.validate_hospital_and_department(
            hospital_name, department, db
        )
        
        # Validate branch belongs to hospital
        branch = BranchAuthService.validate_branch_belongs_to_hospital(
            branch_id, hospital.hospital_id, db
        )
        
        # Check if email already exists (only email needs to be unique)
        existing_email = BranchAuthService.get_branch_login_by_email(email, db)
        if existing_email:
            logger.error(f"Email already exists: {email}")
            raise DatabaseQueryException(
                operation="branch signup",
                reason="Email already registered",
                custom_message="This email is already registered",
                status_code=400
            )
        
        # Validate role
        role_lower = role.lower()
        if role_lower not in ['user', 'manager']:
            raise DatabaseQueryException(
                operation="branch signup",
                reason="Invalid role",
                custom_message="Role must be either 'User' or 'Manager'",
                status_code=400
            )
        
        logger.info(
            f"Creating branch login: email={email}, role={role}, hospital={hospital_name}, "
            f"branch_id={branch_id}"
        )

        # Create branch login (inactive until approved)
        branch_login = BranchLogin(
            branch_id=branch_id,
            email=email,
            password_hash=get_password_hash(password),
            first_name=first_name,
            last_name=last_name,
            role=role.capitalize(),  # Normalize to title case
            department=department,
            is_active=False,  # Must remain False until approved
            approved_status="pending",  # PENDING status
            created_by="system"
        )
        
        try:
            db.add(branch_login)
            db.flush()  # Flush but don't commit yet - validate first
            logger.debug(f"Branch login flushed to DB (not committed): login_id={branch_login.login_id}")
            
            # Determine recipient for approval email based on role
            recipient_email = None
            
            if role_lower == 'user':
                # User registration → send to Manager
                manager_email = BranchAuthService.get_branch_manager_email(branch_id, department, db)
                if not manager_email:
                    db.rollback()
                    logger.error(f"No approved manager found for branch_id: {branch_id}, department: {department}")
                    raise DatabaseQueryException(
                        operation="branch signup",
                        reason="No manager found",
                        custom_message="No approved manager found for this branch and department. Please contact administrator.",
                        status_code=400
                    )
                recipient_email = manager_email
                logger.info(f"User registration: Sending approval email to Manager ({recipient_email})")
            elif role_lower == 'manager':
                # Manager registration → send to ARC admin
                arc_admin_email = BranchAuthService.get_arc_admin_email(db)
                if not arc_admin_email:
                    db.rollback()
                    logger.error(f"No ARC admin found")
                    raise DatabaseQueryException(
                        operation="branch signup",
                        reason="No ARC admin found",
                        custom_message="No ARC admin found. Please contact administrator.",
                        status_code=400
                    )
                recipient_email = arc_admin_email
                logger.info(f"Manager registration: Sending approval email to ARC Admin ({recipient_email})")
            
            # Send approval email BEFORE committing
            # If email fails, transaction will rollback
            from ...service.email_service import send_approval_email
            send_approval_email(
                registration_id=str(branch_login.login_id),
                first_name=first_name,
                last_name=last_name,
                email=email,
                role=role.capitalize(),
                company=f"{hospital.hospital_name} - {branch.branch_name}",
                recipient_email=recipient_email
            )
            logger.info("Approval email sent successfully")
            
            # Email sent successfully, NOW commit the transaction
            db.commit()
            db.refresh(branch_login)
            logger.info(f"Branch login created successfully: login_id={branch_login.login_id}")
            
        except IntegrityError as e:
            db.rollback()
            logger.error(f"IntegrityError during branch signup: {str(e)}")
            if 'email' in str(e).lower() or 'unique' in str(e).lower():
                raise DatabaseQueryException(
                    operation="branch signup",
                    reason="Email already exists",
                    custom_message="This email is already registered",
                    status_code=400
                )
            else:
                raise DatabaseQueryException(
                    operation="branch signup",
                    reason=str(e),
                    custom_message="Registration failed",
                    status_code=400
                )
        except Exception as e:
            # Rollback on ANY error (including email failure)
            db.rollback()
            logger.error(f"Branch signup failed, rolling back: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # If it's already a custom exception, re-raise it
            if hasattr(e, 'status_code'):
                raise e
            
            # If it's an email error, raise a more specific exception
            if 'email' in str(e).lower() or 'smtp' in str(e).lower():
                raise DatabaseQueryException(
                    operation="branch signup",
                    reason="Email sending failed",
                    custom_message="Failed to send approval email",
                    status_code=500
                )
            else:
                raise DatabaseQueryException(
                    operation="branch signup",
                    reason=str(e),
                    custom_message="Registration failed",
                    status_code=500
                )
        
        # Build response message
        approval_message = f"Registration request sent to {recipient_email} for approval."
        
        return {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "hospital_id": hospital.hospital_id,
            "hospital_name": hospital.hospital_name,
            "branch_id": branch.branch_id,
            "branch_name": branch.branch_name,
            "department": branch_login.department,
            "role": branch_login.role,
            "message": approval_message,
            "approval_sent_to": recipient_email
        }
    
    @staticmethod
    def login_branch(
        email: str,
        password: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        Authenticate branch login
        
        Validations:
        - Credentials are correct
        - Account is active
        
        Returns:
            Dictionary with login response including JWT token
        """
        logger.info(f"Branch login request: email={email}")
        
        # Get branch login
        branch_login = BranchAuthService.get_branch_login_by_email(email, db)
        
        if not branch_login:
            logger.error(f"Branch login not found: {email}")
            raise DatabaseQueryException(
                operation="branch login",
                reason="Invalid credentials",
                custom_message="Invalid email or password",
                status_code=401
            )
        
        # Verify password
        if not verify_password(password, branch_login.password_hash):
            logger.warning(f"Invalid password for email: {email}")
            # Increment login attempts
            branch_login.login_attempts += 1
            db.commit()
            raise DatabaseQueryException(
                operation="branch login",
                reason="Invalid credentials",
                custom_message="Invalid email or password",
                status_code=401
            )
        
        # Get branch and hospital
        branch = BranchAuthService.get_branch_by_id(branch_login.branch_id, db)
        if not branch:
            logger.error(f"Branch not found: {branch_login.branch_id}")
            raise DatabaseQueryException(
                operation="branch login",
                reason="Branch not found",
                custom_message="Branch not found",
                status_code=404
            )
        
        hospital = db.query(Hospital).filter(Hospital.hospital_id == branch.hospital_id).first()
        
        # Check if account is approved and active
        if branch_login.approved_status != 'approved' or not branch_login.is_active:
            logger.error(f"Account not approved/active: {email}, status: {branch_login.approved_status}")
            raise DatabaseQueryException(
                operation="branch login",
                reason="Account not approved",
                custom_message="Your account is pending approval. Please wait for approval to login.",
                status_code=403
            )
        
        # Reset login attempts on successful login
        branch_login.login_attempts = 0
        branch_login.last_login = datetime.now(timezone.utc)
        db.commit()
        
        # Send OTP to user email after successful login
        from ...service.ivf_otp_service import send_ivf_otp_to_user
        
        try:
            otp = send_ivf_otp_to_user(db, branch_login.login_id, branch_login.email, remember_me=False)
            logger.info(f"OTP sent to {branch_login.email} for login_id: {branch_login.login_id}")
        except Exception as e:
            logger.error(f"Failed to send OTP: {str(e)}")
            import traceback
            logger.error(f"OTP sending error traceback: {traceback.format_exc()}")
            raise DatabaseQueryException(
                operation="branch login",
                reason=f"OTP sending failed: {str(e)}",
                custom_message=f"Failed to send OTP: {str(e)}",
                status_code=500
            )
        
        logger.info(f"Branch login successful: login_id={branch_login.login_id}, OTP sent")
        
        return {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "hospital_id": hospital.hospital_id,
            "hospital_name": hospital.hospital_name,
            "branch_id": branch.branch_id,
            "branch_name": branch.branch_name,
            "department": branch_login.department,
            "otp_expiry": otp.expires_at,
            "message": "Login successful. Please check your email for OTP."
        }

    @staticmethod
    def verify_branch_email(
        token: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        Verify branch login email using a verification token.
        
        Production-ready verification flow following strict order:
        1. Validate token presence → 400 if missing
        2. Fetch record by verification_token → 400 if not found
        3. Check if already verified → 200 "Email already verified"
        4. Check token expiry (UTC-safe) → 400 if expired
        5. Mark as verified, set verified_at, clear token (prevent reuse), commit
        
        Note: Does NOT check is_active during verification.
        Email verification and account activation are separate concerns.
        
        Returns:
            Dict with message, login_id, email, hospital_id, branch_id, department
        """
        # Step 1: Validate token presence
        if not token or not token.strip():
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Missing token",
                custom_message="Invalid verification link",
                status_code=400
            )

        # Step 2: Fetch record by verification_token
        normalized_token = token.strip()
        branch_login = db.query(BranchLogin).filter(
            BranchLogin.verification_token == normalized_token
        ).first()

        if not branch_login:
            logger.warning(f"Token not found: email lookup failed")
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Token not found",
                custom_message="Invalid or expired verification link",
                status_code=400
            )

        # Step 3: Check if already verified
        if branch_login.is_verified:
            logger.info(f"Email already verified: login_id={branch_login.login_id}, email={branch_login.email}")
            # Fetch branch and hospital for response context
            branch = BranchAuthService.get_branch_by_id(branch_login.branch_id, db)
            if not branch:
                logger.error(f"Branch not found during verification: {branch_login.branch_id}")
                raise DatabaseQueryException(
                    operation="branch verify",
                    reason="Branch not found",
                    custom_message="Branch not found",
                    status_code=404
                )
            hospital = db.query(Hospital).filter(Hospital.hospital_id == branch.hospital_id).first()
            if not hospital:
                logger.error(f"Hospital not found during verification: {branch.hospital_id}")
                raise DatabaseQueryException(
                    operation="branch verify",
                    reason="Hospital not found",
                    custom_message="Hospital not found",
                    status_code=404
                )
            return {
                "message": "Email already verified",
                "login_id": branch_login.login_id,
                "email": branch_login.email,
                "hospital_id": hospital.hospital_id,
                "branch_id": branch.branch_id,
                "department": branch_login.department
            }

        # Step 4: Check token expiry
        now_utc = datetime.now(timezone.utc)
        token_expiry = branch_login.verification_token_expiry
        
        if not token_expiry or token_expiry < now_utc:
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Token expired or missing expiry",
                custom_message="Verification link expired",
                status_code=400
            )

        # Step 5: Mark as verified, activate account, and clear token
        branch_login.is_verified = True
        branch_login.is_active = True  # Activate account after email verification
        branch_login.verified_at = now_utc
        branch_login.verification_token = None
        branch_login.verification_token_expiry = None
        branch_login.login_attempts = 0
        
        try:
            db.commit()
            db.refresh(branch_login)
            logger.info(
                f"Email verified successfully: login_id={branch_login.login_id}, "
                f"email={branch_login.email}"
            )
        except Exception as e:
            logger.error(f"Failed to commit verification: {str(e)}")
            db.rollback()
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Database commit failed",
                custom_message="Verification failed. Please try again.",
                status_code=500
            )

        # Fetch branch and hospital for response
        branch = BranchAuthService.get_branch_by_id(branch_login.branch_id, db)
        if not branch:
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Branch not found",
                custom_message="Branch not found",
                status_code=404
            )
        hospital = db.query(Hospital).filter(Hospital.hospital_id == branch.hospital_id).first()
        if not hospital:
            raise DatabaseQueryException(
                operation="branch verify",
                reason="Hospital not found",
                custom_message="Hospital not found",
                status_code=404
            )

        return {
            "message": "Email verified successfully",
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "hospital_id": hospital.hospital_id,
            "branch_id": branch.branch_id,
            "department": branch_login.department
        }

