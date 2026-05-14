from datetime import datetime, timezone
import sqlalchemy
from sqlalchemy import ForeignKey

from app.config.database import Base


class OnboardingState(Base):
    __tablename__ = "onboarding_state"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    user_id = sqlalchemy.Column(sqlalchemy.String, ForeignKey("users.user_id"), nullable=False, index=True)
    state = sqlalchemy.Column(sqlalchemy.JSON, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = sqlalchemy.Column(sqlalchemy.DateTime, nullable=True)
