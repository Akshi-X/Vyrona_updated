from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..config.database import Base


class PushSubscription(Base):
    """A single browser/device Web Push subscription for a user.

    One user can have many rows (multiple browsers/devices). `enabled` is the
    per-device toggle; `users.push_enabled` is the account-wide kill switch.
    """

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True, index=True)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    user_agent = Column(String(255), nullable=True)
    device_label = Column(String(120), nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    failure_count = Column(Integer, nullable=False, default=0)

    user = relationship("User", backref="push_subscriptions")
