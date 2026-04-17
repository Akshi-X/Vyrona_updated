from datetime import datetime, timezone

import sqlalchemy
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from ..config.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String, nullable=False)
    outcome = Column(String, nullable=False)
    actor_type = Column(String, nullable=False)
    actor_id = Column(String, nullable=True)
    actor_label = Column(String, nullable=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    target_label = Column(String, nullable=True)
    metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("idx_activity_log_action", "action"),
        Index("idx_activity_log_outcome", "outcome"),
        Index("idx_activity_log_actor", "actor_type", "actor_id"),
        Index("idx_activity_log_target", "target_type", "target_id"),
        Index("idx_activity_log_created_at", "created_at"),
        Index("idx_activity_log_metadata", "metadata", postgresql_using="gin"),
    )
