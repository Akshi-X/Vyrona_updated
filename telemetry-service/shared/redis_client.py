"""
Redis client module for Azure Functions.
Uses singleton pattern to reuse connections across invocations.
"""
import redis
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

# Global Redis client (reused across invocations - singleton pattern)
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
            "socket_timeout": config.REDIS_SOCKET_TIMEOUT
        }
        
        # Enable SSL for Azure Redis Cache (port 6380)
        if config.REDIS_PORT == 6380:
            redis_kwargs["ssl"] = True
            redis_kwargs["ssl_cert_reqs"] = None  # Azure Redis uses self-signed certs
        
        if config.REDIS_PASSWORD:
            redis_kwargs["password"] = config.REDIS_PASSWORD
        
        _redis_client = redis.Redis(**redis_kwargs)
        try:
            _redis_client.ping()
            logger.info("✓ Redis connection established")
        except Exception as e:
            logger.error(f"✗ Failed to connect to Redis: {e}")
            raise
    return _redis_client
