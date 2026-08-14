"""
Database connection module for the Grading Service.
Connection pooling with a singleton engine for Azure Functions cold starts.
Owns the `ml_jobs` table used to track segmentation/grading jobs.
"""
import logging
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

_engine = None
_SessionLocal = None
_table_ready = False


def get_engine():
    """Get or create the database engine (singleton)."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            config.database_url,
            pool_pre_ping=True,
            echo=False,
            pool_size=2,
            max_overflow=5,
            pool_timeout=30,
            pool_recycle=3600,
            poolclass=QueuePool,
        )
        logger.info("Database engine created")
    return _engine


def get_session():
    """Get the session factory."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def ensure_ml_jobs_table_exists() -> None:
    """Ensure the ml_jobs table exists (idempotent)."""
    global _table_ready
    if _table_ready:
        return
    ddl = text("""
    CREATE TABLE IF NOT EXISTS ml_jobs (
        job_id BIGSERIAL PRIMARY KEY,
        kind VARCHAR(32) NOT NULL,
        input_image_id TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        progress INT NOT NULL DEFAULT 0,
        output JSONB,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
    """)
    try:
        with get_engine().begin() as conn:
            conn.execute(ddl)
        _table_ready = True
    except Exception as e:
        logger.error(f"Failed to ensure ml_jobs table: {e}")
        raise
