from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)

from ..config.database import Base


class IntegrationApiToken(Base):
    """Audit + denylist record for JWTs issued to external integrations (e.g. HMS).

    The JWT itself carries the auth payload — this row is the trail of issuance and
    the kill switch for revocation. `verify_token` consults this table to reject
    revoked tokens before the JWT's natural `exp`.
    """

    __tablename__ = "integration_api_tokens"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    jti = Column(String(64), nullable=False, unique=True, index=True)
    purpose = Column(String(64), nullable=False)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    hospital_id = Column(Integer, nullable=True, index=True)
    label = Column(String(255), nullable=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    revoked_by = Column(String, nullable=True)
    revoked_reason = Column(Text, nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_integration_token_hospital_purpose", "hospital_id", "purpose"),
        Index("idx_integration_token_active", "revoked_at", "expires_at"),
    )
