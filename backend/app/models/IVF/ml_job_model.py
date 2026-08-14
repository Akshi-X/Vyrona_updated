from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB

from ...config.database import Base


class MlJob(Base):
    """Embryo analysis job tracked by the grading-service.

    Rows are created and advanced by the Azure Functions app
    (grading-service/shared/job_handler.py); the backend reads them to resolve
    a job that finished before the SSE client subscribed.
    """
    __tablename__ = "ml_jobs"

    job_id = Column(BigInteger, primary_key=True, autoincrement=True)
    kind = Column(String(32), nullable=False)  # 'analysis'
    input_image_id = Column(Text, nullable=False)
    status = Column(String(16), nullable=False, default="pending")  # pending|running|completed|failed
    progress = Column(Integer, nullable=False, default=0)
    output = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)
