"""Service for integration-purpose JWTs (HMS, etc.).

Handles:
- Password-only admin login (no OTP) — used out-of-band by an Admin user to mint a
  long-lived bearer token they hand to an external HMS.
- Issuing the JWT with a 1-year `exp`, recording a row in `integration_api_tokens`
  for audit + denylist lookup.
- Revocation, list, and active-token check used by the token middleware.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.auth.auth import create_access_token, pwd_context
from app.constants.app_constants import (
    INTEGRATION_TOKEN_EXPIRY_DAYS,
    INTEGRATION_TOKEN_PURPOSE,
)
from app.constants.enums import ActivityActorType, ActivityOutcome, UserRole
from app.exceptions import (
    AccountInactiveException,
    InvalidCredentialsException,
    UserNotApprovedException,
    UserNotFoundException,
)
from app.models.integration_api_token_model import IntegrationApiToken
from app.models.user_model import User
from app.service.account_locking_service import (
    check_account_lock_status,
    increment_failed_login_attempt,
    reset_login_attempts,
)
from app.service.activity_log_service import (
    ActivityActor,
    ActivityLogService,
    ActivityTarget,
)

logger = logging.getLogger(__name__)


class IntegrationAuthService:
    def __init__(self, db: Session):
        self.db = db

    def login_admin(self, email: str, password: str) -> dict:
        """Verify admin credentials, mint a 1-year JWT, persist a token record.

        Raises typed AppException subclasses on failure (caught upstream and turned
        into uniform 401/403/423 responses).
        """
        normalized_email = email.strip().lower()
        user: Optional[User] = (
            self.db.query(User).filter(User.email == normalized_email).first()
        )

        if not user:
            self._log_failure(actor_user=None, reason="user_not_found", email=normalized_email)
            raise UserNotFoundException(email=normalized_email)

        check_account_lock_status(user, self.db)

        if not user.status:
            self._log_failure(actor_user=user, reason="account_inactive")
            raise AccountInactiveException(user_id=user.user_id)

        if user.approved_status != "approved":
            self._log_failure(actor_user=user, reason="user_not_approved")
            raise UserNotApprovedException(user_id=user.user_id)

        role_value = user.role.value if hasattr(user.role, "value") else str(user.role)
        if role_value != UserRole.ADMIN.value:
            self._log_failure(actor_user=user, reason="role_not_admin", attempted_role=role_value)
            raise InvalidCredentialsException(email=normalized_email)

        if not pwd_context.verify(password, user.password_hash):
            increment_failed_login_attempt(user, self.db)
            self._log_failure(actor_user=user, reason="bad_password")
            raise InvalidCredentialsException(email=normalized_email)

        reset_login_attempts(user, self.db)

        jti = uuid.uuid4().hex
        issued_at = datetime.now(timezone.utc)
        expires_at = issued_at + timedelta(days=INTEGRATION_TOKEN_EXPIRY_DAYS)

        payload = {
            "sub": str(user.user_id),
            "branch_id": user.branch_id,
            "hospital_id": user.hospital_id,
            "department": user.department,
            "type": "hospital_user",
            "purpose": INTEGRATION_TOKEN_PURPOSE,
            "jti": jti,
            "iat": int(issued_at.timestamp()),
        }
        access_token = create_access_token(
            payload, expires_delta=timedelta(days=INTEGRATION_TOKEN_EXPIRY_DAYS)
        )

        record = IntegrationApiToken(
            jti=jti,
            purpose=INTEGRATION_TOKEN_PURPOSE,
            user_id=user.user_id,
            hospital_id=user.hospital_id,
            label=None,
            issued_at=issued_at,
            expires_at=expires_at,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        self._log_success(actor_user=user, record=record)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in_seconds": INTEGRATION_TOKEN_EXPIRY_DAYS * 24 * 3600,
            "expires_at": expires_at,
            "issued_at": issued_at,
            "jti": jti,
            "user_id": user.user_id,
            "hospital_id": user.hospital_id,
            "purpose": INTEGRATION_TOKEN_PURPOSE,
        }

    def is_token_active(self, jti: str) -> bool:
        """Return True iff a row exists for this jti, is not revoked, and not past exp.

        Called by TokenValidationMiddleware for any JWT that carries `purpose=hms_integration`.
        Tokens without our purpose claim bypass this check (regular session JWTs).
        """
        if not jti:
            return False
        record: Optional[IntegrationApiToken] = (
            self.db.query(IntegrationApiToken)
            .filter(IntegrationApiToken.jti == jti)
            .first()
        )
        if not record:
            return False
        if record.revoked_at is not None:
            return False
        if record.expires_at and record.expires_at < datetime.now(timezone.utc):
            return False
        return True

    def touch_last_used(self, jti: str) -> None:
        """Best-effort update of last_used_at; failure is non-fatal."""
        if not jti:
            return
        try:
            self.db.query(IntegrationApiToken).filter(
                IntegrationApiToken.jti == jti
            ).update({"last_used_at": datetime.now(timezone.utc)})
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update last_used_at for integration token jti=%s", jti)

    def list_tokens(
        self,
        hospital_id: Optional[int] = None,
        user_id: Optional[str] = None,
        include_revoked: bool = True,
    ) -> Tuple[List[IntegrationApiToken], int]:
        query = self.db.query(IntegrationApiToken)
        if hospital_id is not None:
            query = query.filter(IntegrationApiToken.hospital_id == hospital_id)
        if user_id is not None:
            query = query.filter(IntegrationApiToken.user_id == user_id)
        if not include_revoked:
            query = query.filter(IntegrationApiToken.revoked_at.is_(None))
        total = query.count()
        rows = query.order_by(IntegrationApiToken.issued_at.desc()).all()
        return rows, total

    def revoke_token(
        self,
        token_id: int,
        revoked_by_user: User,
        reason: Optional[str],
    ) -> Optional[IntegrationApiToken]:
        record: Optional[IntegrationApiToken] = (
            self.db.query(IntegrationApiToken)
            .filter(IntegrationApiToken.id == token_id)
            .first()
        )
        if not record:
            return None
        if record.revoked_at is not None:
            return record  # already revoked, idempotent

        record.revoked_at = datetime.now(timezone.utc)
        record.revoked_by = revoked_by_user.user_id
        record.revoked_reason = reason
        self.db.commit()
        self.db.refresh(record)

        ActivityLogService(self.db).log_activity(
            action="integration.auth.token_revoked",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=ActivityActor(
                actor_type=ActivityActorType.USER.value,
                actor_id=revoked_by_user.user_id,
                actor_label=f"{revoked_by_user.first_name} {revoked_by_user.last_name}".strip()
                or revoked_by_user.email,
                hospital_id=revoked_by_user.hospital_id,
            ),
            target=ActivityTarget(
                target_type="integration_api_token",
                target_id=str(record.id),
                target_label=record.purpose,
                hospital_id=record.hospital_id,
            ),
            metadata={
                "jti": record.jti,
                "purpose": record.purpose,
                "reason": reason,
            },
        )
        return record

    @staticmethod
    def is_active(record: IntegrationApiToken) -> bool:
        if record.revoked_at is not None:
            return False
        if record.expires_at and record.expires_at < datetime.now(timezone.utc):
            return False
        return True

    def _log_success(self, actor_user: User, record: IntegrationApiToken) -> None:
        ActivityLogService(self.db).log_activity(
            action="integration.auth.login",
            outcome=ActivityOutcome.SUCCESS.value,
            actor=ActivityActor(
                actor_type=ActivityActorType.USER.value,
                actor_id=actor_user.user_id,
                actor_label=f"{actor_user.first_name} {actor_user.last_name}".strip()
                or actor_user.email,
                hospital_id=actor_user.hospital_id,
            ),
            target=ActivityTarget(
                target_type="integration_api_token",
                target_id=str(record.id),
                target_label=record.purpose,
                hospital_id=record.hospital_id,
            ),
            metadata={
                "jti": record.jti,
                "purpose": record.purpose,
                "expires_at": record.expires_at.isoformat() if record.expires_at else None,
            },
        )

    def _log_failure(self, actor_user: Optional[User], reason: str, **extra) -> None:
        actor = (
            ActivityActor(
                actor_type=ActivityActorType.USER.value,
                actor_id=actor_user.user_id,
                actor_label=actor_user.email,
                hospital_id=actor_user.hospital_id,
            )
            if actor_user is not None
            else ActivityActor(
                actor_type=ActivityActorType.SYSTEM.value,
                actor_id=None,
                actor_label="integration.auth.login",
            )
        )
        try:
            ActivityLogService(self.db).log_activity(
                action="integration.auth.login",
                outcome=ActivityOutcome.FAILURE.value,
                actor=actor,
                target=None,
                metadata={"reason": reason, **extra},
            )
        except Exception:
            logger.exception("Failed to write integration.auth.login failure log")
