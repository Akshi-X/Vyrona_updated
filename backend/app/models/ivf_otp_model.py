import sqlalchemy
from datetime import datetime, timedelta
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

from ..config.database import Base


class IVFOTP(Base):
    __tablename__ = "ivf_otps"
    __table_args__ = {'schema': 'ivf'}

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    login_id = sqlalchemy.Column(sqlalchemy.Integer, nullable=False, index=True)  # Reference to branch_logins.login_id
    email = sqlalchemy.Column(sqlalchemy.String, nullable=False, index=True)
    otp_code = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.utcnow)
    expires_at = sqlalchemy.Column(sqlalchemy.DateTime, nullable=False)
    is_used = sqlalchemy.Column(sqlalchemy.Boolean, default=False)
    attempts = sqlalchemy.Column(sqlalchemy.Integer, default=0)
    remember_me = sqlalchemy.Column(sqlalchemy.Boolean, default=False)  # Remember Me preference for session duration
