from datetime import datetime, timezone
import sqlalchemy
from sqlalchemy import ForeignKey

from app.config.database import Base


class OnboardingEvent(Base):
    __tablename__ = "onboarding_events"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, index=True)
    user_id = sqlalchemy.Column(sqlalchemy.String, ForeignKey("users.user_id"), nullable=False, index=True)
    event_id = sqlalchemy.Column(sqlalchemy.String, nullable=True, index=True)
    event_type = sqlalchemy.Column(sqlalchemy.String, nullable=False, index=True)
    level_id = sqlalchemy.Column(sqlalchemy.String, nullable=True, index=True)
    payload = sqlalchemy.Column(sqlalchemy.JSON, nullable=True)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=lambda: datetime.now(timezone.utc))
