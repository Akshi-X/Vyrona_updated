import sqlalchemy
from datetime import datetime, timedelta, timezone

from ..config.database import Base


class PasswordReset(Base):
    """
    Password Reset Token Model
    
    Stores password reset tokens for forgot password functionality.
    Each token is hashed for security and can only be used once.
    """
    __tablename__ = "password_resets"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    user_id = sqlalchemy.Column(sqlalchemy.String, nullable=False, index=True)
    email = sqlalchemy.Column(sqlalchemy.String, nullable=False, index=True)
    token_hash = sqlalchemy.Column(sqlalchemy.String, nullable=False)  # Hashed reset token
    created_at = sqlalchemy.Column(sqlalchemy.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = sqlalchemy.Column(sqlalchemy.DateTime(timezone=True), nullable=False)
    is_used = sqlalchemy.Column(sqlalchemy.Boolean, default=False)

