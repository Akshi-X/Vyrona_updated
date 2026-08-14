"""
Async Redis client for pub/sub — used by the ML grading SSE bridge to await
job progress/completion published by the grading-service on ml:job:{job_id}.
"""
import logging
from typing import Optional

import redis.asyncio as aioredis

from app.config.config import settings

logger = logging.getLogger(__name__)

_client: Optional[aioredis.Redis] = None


def get_async_redis() -> aioredis.Redis:
    """Get or create the async Redis client (singleton)."""
    global _client
    if _client is None:
        kwargs = {
            "host": settings.REDIS_HOST,
            "port": settings.REDIS_PORT,
            "db": settings.REDIS_DB,
            "decode_responses": True,
            "socket_connect_timeout": settings.REDIS_SOCKET_CONNECT_TIMEOUT,
            "socket_timeout": settings.REDIS_SOCKET_TIMEOUT,
        }
        if settings.REDIS_USERNAME:
            kwargs["username"] = settings.REDIS_USERNAME
        if settings.REDIS_PASSWORD:
            kwargs["password"] = settings.REDIS_PASSWORD
        if settings.REDIS_SSL:
            kwargs["ssl"] = True
            kwargs["ssl_cert_reqs"] = settings.REDIS_SSL_CERT_REQS
        _client = aioredis.Redis(**kwargs)
    return _client


_pubsub_client: Optional[aioredis.Redis] = None


def get_pubsub_redis() -> aioredis.Redis:
    """Client dedicated to pub/sub reads.

    Identical to get_async_redis() except it carries no socket_timeout: a
    subscriber legitimately waits minutes between messages while a model runs,
    and redis-py falls back to socket_timeout on blocking reads, which would
    tear the subscription down mid-job.
    """
    global _pubsub_client
    if _pubsub_client is None:
        kwargs = {
            "host": settings.REDIS_HOST,
            "port": settings.REDIS_PORT,
            "db": settings.REDIS_DB,
            "decode_responses": True,
            "socket_connect_timeout": settings.REDIS_SOCKET_CONNECT_TIMEOUT,
            "socket_timeout": None,
            "health_check_interval": 30,
        }
        if settings.REDIS_USERNAME:
            kwargs["username"] = settings.REDIS_USERNAME
        if settings.REDIS_PASSWORD:
            kwargs["password"] = settings.REDIS_PASSWORD
        if settings.REDIS_SSL:
            kwargs["ssl"] = True
            kwargs["ssl_cert_reqs"] = settings.REDIS_SSL_CERT_REQS
        _pubsub_client = aioredis.Redis(**kwargs)
    return _pubsub_client


def job_channel(job_id: int) -> str:
    return f"ml:job:{job_id}"
