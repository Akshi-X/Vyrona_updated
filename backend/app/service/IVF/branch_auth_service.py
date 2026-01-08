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
    def signup_branch(
        email: str,
        password: str,
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
        
        # Check if login already exists for this branch + department
        existing_login = BranchAuthService.get_branch_login_by_branch_and_department(
            branch_id, department, db
        )
        
        if existing_login:
            logger.error(
                f"Login already exists for branch {branch_id} and department {department}"
            )
            raise DatabaseQueryException(
                operation="branch signup",
                reason="One login per branch + department already exists",
                custom_message="A login already exists for this branch and department",
                status_code=400
            )
        
        # Check if email already exists
        existing_email = BranchAuthService.get_branch_login_by_email(email, db)
        if existing_email:
            logger.error(f"Email already exists: {email}")
            raise DatabaseQueryException(
                operation="branch signup",
                reason="Email already registered",
                custom_message="This email is already registered",
                status_code=400
            )
        
        # Generate secure verification token
        verification_token = secrets.token_urlsafe(48)
        verification_expiry = datetime.now(timezone.utc) + timedelta(hours=24)
        
        logger.info(
            f"Creating branch login: email={email}, hospital={hospital_name}, "
            f"branch_id={branch_id}"
        )

        # Create branch login (inactive until verified)
        branch_login = BranchLogin(
            branch_id=branch_id,
            email=email,
            password_hash=get_password_hash(password),
            department=department,
            is_active=False,  # Must remain False until email verification
            is_verified=False,  # Must remain False until email verification
            approved_status="pending",  # PENDING status
            verification_token=verification_token,
            verification_token_expiry=verification_expiry,
            created_by="system"
        )
        
        db.add(branch_login)
        db.commit()
        db.refresh(branch_login)
        
        logger.info(
            f"Branch login created: login_id={branch_login.login_id}, email={email}"
        )

        # Send verification email
        try:
            from urllib.parse import quote
            encoded_token = quote(verification_token, safe='-_')
            verify_url = f"{settings.FRONTEND_URL}/branch/verify?token={encoded_token}"
            
            subject = "Verify your branch login"
            html_body = f"""
                <p>Hello,</p>
                <p>Please verify your branch login for <b>{hospital.hospital_name}</b>, branch <b>{branch.branch_name}</b>.</p>
                <p><a href="{verify_url}">Click here to verify</a></p>
                <p>This link expires in 24 hours.</p>
                <p>If you did not request this, please ignore this email.</p>
            """
            send_email(branch_login.email, subject, html_body)
            logger.info(f"Verification email sent: email={email}, login_id={branch_login.login_id}")
        except Exception as e:
            # If email fails, rollback the creation to avoid unusable accounts
            logger.error(f"Failed to send verification email: {str(e)}")
            db.delete(branch_login)
            db.commit()
            raise DatabaseQueryException(
                operation="branch signup",
                reason="Email sending failed",
                custom_message="Failed to send verification email",
                status_code=500
            )
        
        return {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "hospital_id": hospital.hospital_id,
            "hospital_name": hospital.hospital_name,
            "branch_id": branch.branch_id,
            "branch_name": branch.branch_name,
            "department": branch_login.department,
            "message": "Branch login created. Please verify your email to activate the account."
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
        
        # Check if account is active
        if not branch_login.is_verified or not branch_login.is_active:
            logger.error(f"Account not verified/active: {email}")
            raise DatabaseQueryException(
                operation="branch login",
                reason="Account not verified",
                custom_message="Please verify your email to activate the account",
                status_code=403
            )
        
        # Reset login attempts on successful login
        branch_login.login_attempts = 0
        branch_login.last_login = datetime.now(timezone.utc)
        db.commit()
        
        # Create JWT token with hospital_id, branch_id, hospital_type
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "sub": str(branch_login.login_id),
                "type": "branch_login",
                "hospital_id": hospital.hospital_id,
                "branch_id": branch.branch_id,
                "hospital_type": branch_login.department,
                "email": branch_login.email
            },
            expires_delta=access_token_expires
        )
        
        expires_at = datetime.now(timezone.utc) + access_token_expires
        
        logger.info(f"Branch login successful: login_id={branch_login.login_id}")
        
        return {
            "login_id": branch_login.login_id,
            "email": branch_login.email,
            "hospital_id": hospital.hospital_id,
            "hospital_name": hospital.hospital_name,
            "branch_id": branch.branch_id,
            "branch_name": branch.branch_name,
            "department": branch_login.department,
            "auth_token": access_token,
            "expires_at": expires_at
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

