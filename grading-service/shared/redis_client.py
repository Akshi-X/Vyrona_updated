"""
Redis client for the Grading Service.
Singleton connection reused across invocations. Used to publish job
progress and completion events on the `ml:job:{job_id}` channel.
"""
import json
import logging
import sys
from pathlib import Path

import redis

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

_redis_client = None


def get_redis_client():
    """Get or create Redis client (singleton pattern)."""
    global _redis_client
    if _redis_client is None:
        redis_kwargs = {
            "host": config.REDIS_HOST,
            "port": config.REDIS_PORT,
            "db": config.REDIS_DB,
            "decode_responses": True,
            "socket_connect_timeout": config.REDIS_SOCKET_CONNECT_TIMEOUT,
            "socket_timeout": config.REDIS_SOCKET_TIMEOUT,
        }
        if config.REDIS_SSL:
            redis_kwargs["ssl"] = True
            redis_kwargs["ssl_cert_reqs"] = None  # Azure Redis uses self-signed certs
        if config.REDIS_USERNAME:
            redis_kwargs["username"] = config.REDIS_USERNAME
        if config.REDIS_PASSWORD:
            redis_kwargs["password"] = config.REDIS_PASSWORD

        _redis_client = redis.Redis(**redis_kwargs)
        try:
            _redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
    return _redis_client


def job_channel(job_id: int) -> str:
    return f"ml:job:{job_id}"


def publish_job_event(job_id: int, event: dict) -> None:
    """Publish a JSON job event on the job's channel. Best-effort."""
    try:
        get_redis_client().publish(job_channel(job_id), json.dumps(event))
    except Exception as e:
        logger.error(f"Failed to publish job event for {job_id}: {e}")
