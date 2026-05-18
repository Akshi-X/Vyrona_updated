"""
Health check service.

Single source of truth for /health response (DB + Redis status).
Used by the health route and by exception handler when /health hits a validation error.
"""

from ..config.database import engine
from .redis_service import get_redis
from ..config.config import settings
from ..constants.status_constants import HEALTH_HEALTHY, HEALTH_UNHEALTHY
from sqlalchemy import text


def get_health_response() -> dict:
    """
    Run health checks (DB, Redis) and return the same structure as HealthCheckResponse.
    Used by main.py health route and by exception handler fallback for /health.
    """
    db_ok = False
    redis_ok = False

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    try:
        r = get_redis()
        r.ping()
        redis_ok = True
    except Exception:
        pass

    overall_status = HEALTH_HEALTHY if (db_ok and redis_ok) else HEALTH_UNHEALTHY

    return {
        "status": overall_status,
        "platform": "MyGrape",
        "service": "Supply Chain Tracking",
        "environment": settings.ENVIRONMENT,
        "database_connected": db_ok,
        "redis_connected": redis_ok,
    }
