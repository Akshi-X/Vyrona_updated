import sqlalchemy
from datetime import datetime

from ..config.database import Base


class User(Base):
    __tablename__ = "users"

    registration_id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, index=True)
    user_id = sqlalchemy.Column(sqlalchemy.String, unique=True, nullable=True)  # Assigned after approval
    first_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    last_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    email = sqlalchemy.Column(sqlalchemy.String, unique=True, nullable=False, index=True)
    password_hash = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    role = sqlalchemy.Column(sqlalchemy.String, nullable=False)  # Manager/Worker
    company_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.utcnow)
    updated_at = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)
    status = sqlalchemy.Column(sqlalchemy.Boolean, default=False)  # false until approved
    approved_status = sqlalchemy.Column(sqlalchemy.String, default="pending")  # pending/approved/rejected
