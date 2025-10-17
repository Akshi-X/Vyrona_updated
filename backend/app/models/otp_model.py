import sqlalchemy
from datetime import datetime, timedelta
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class OTP(Base):
    __tablename__ = "otps"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    user_id = sqlalchemy.Column(sqlalchemy.String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    email = sqlalchemy.Column(sqlalchemy.String, nullable=False, index=True)
    otp_code = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.utcnow)
    expires_at = sqlalchemy.Column(sqlalchemy.DateTime, nullable=False)
    is_used = sqlalchemy.Column(sqlalchemy.Boolean, default=False)
    attempts = sqlalchemy.Column(sqlalchemy.Integer, default=0)
    
    # Relationship
    user = relationship("User", back_populates="otps")
