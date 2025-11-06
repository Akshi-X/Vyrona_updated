"""
Redis Service
Handles Redis connection and pub/sub functionality for quality monitoring
"""
import redis
import logging
from typing import Optional

from app.config.config import settings

logger = logging.getLogger(__name__)

# Global Redis client and pubsub instances
_redis_client: Optional[redis.Redis] = None
_pubsub: Optional[redis.client.PubSub] = None


def get_redis() -> redis.Redis:
    """Get or create Redis client"""
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=settings.REDIS_DB,
                decode_responses=True,  # Redis returns bytes by default that can be converted to strings
                socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
                socket_timeout=settings.REDIS_SOCKET_TIMEOUT
            )
            # Test connection
            _redis_client.ping()
            logger.info(f"Redis connection established successfully: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
        except redis.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to Redis at {settings.REDIS_HOST}:{settings.REDIS_PORT}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to Redis: {e}")
            raise
    return _redis_client


def get_pubsub() -> redis.client.PubSub:
    """Get or create Redis publish/subscribe"""
    global _pubsub
    if _pubsub is None:
        try:
            r = get_redis()
            _pubsub = r.pubsub()
            _pubsub.subscribe('quality_channel')
            logger.info("Redis pub/sub subscription established")
        except Exception as e:
            logger.error(f"Failed to create pub/sub connection: {e}")
            raise
    return _pubsub


def reset_redis_connection():
    """Reset Redis connections (useful for reconnection)"""
    global _redis_client, _pubsub
    if _pubsub:
        try:
            _pubsub.close()
        except Exception:
            pass
    _pubsub = None
    _redis_client = None

