"""
Redis Service
Handles Redis connection and pub/sub functionality for quality monitoring
"""
import redis
import logging
from typing import Optional

from app.config.config import settings
from app.constants.kpi_constants import KPIConstants

logger = logging.getLogger(__name__)

# Global Redis client and pubsub instances
_redis_client: Optional[redis.Redis] = None
_pubsub: Optional[redis.client.PubSub] = None
_ln2_pubsub: Optional[redis.client.PubSub] = None  # Separate pubsub for LN2 readings (do not disturb quality channel)
_tank_kpi_pubsub: Optional[redis.client.PubSub] = None  # Tank KPI readings for Quality Tracking tabbed graph
_incubator_kpi_pubsub: Optional[redis.client.PubSub] = None  # Incubator KPI readings for live graph


def get_redis() -> redis.Redis:
    """Get or create Redis client"""
    global _redis_client
    if _redis_client is None:
        try:
            # Build connection parameters
            connection_params = {
                "host": settings.REDIS_HOST,
                "port": settings.REDIS_PORT,
                "db": settings.REDIS_DB,
                "decode_responses": True,  # Redis returns bytes by default that can be converted to strings
                "socket_connect_timeout": settings.REDIS_SOCKET_CONNECT_TIMEOUT,
                "socket_timeout": settings.REDIS_SOCKET_TIMEOUT
            }
            
            # Add SSL/TLS support for Azure Redis Cache
            if settings.REDIS_SSL:
                import ssl
                connection_params["ssl"] = True
                # Configure SSL certificate requirements
                if settings.REDIS_SSL_CERT_REQS:
                    cert_reqs_map = {
                        "required": ssl.CERT_REQUIRED,
                        "optional": ssl.CERT_OPTIONAL,
                        "none": ssl.CERT_NONE
                    }
                    connection_params["ssl_cert_reqs"] = cert_reqs_map.get(
                        settings.REDIS_SSL_CERT_REQS.lower(), 
                        ssl.CERT_REQUIRED
                    )
                else:
                    # Default to CERT_REQUIRED for Azure Redis
                    connection_params["ssl_cert_reqs"] = ssl.CERT_REQUIRED
                logger.info(f"SSL/TLS enabled for Redis connection")
            
            # Add username (Redis Labs / Redis 6+ ACL) if provided
            if settings.REDIS_USERNAME:
                connection_params["username"] = settings.REDIS_USERNAME
            # Add password if provided
            if settings.REDIS_PASSWORD:
                connection_params["password"] = settings.REDIS_PASSWORD
            
            _redis_client = redis.Redis(**connection_params)
            # Test connection
            _redis_client.ping()
            logger.info(f"Redis connection established successfully: {settings.REDIS_HOST}:{settings.REDIS_PORT} (SSL: {settings.REDIS_SSL})")
        except redis.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to Redis at {settings.REDIS_HOST}:{settings.REDIS_PORT}: {e}")
            logger.error("Common Azure Redis issues:")
            logger.error("1. Ensure REDIS_SSL=True for Azure Redis Cache")
            logger.error("2. Use port 6380 (SSL) instead of 6379 (non-SSL) for Azure Redis")
            logger.error("3. Check firewall rules allow your IP address")
            logger.error("4. Verify REDIS_PASSWORD matches the access key from Azure portal")
            raise
        except redis.exceptions.AuthenticationError as e:
            logger.error(f"Redis authentication failed: {e}")
            logger.error("Check that REDIS_PASSWORD matches your Azure Redis access key")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to Redis: {e}")
            raise
    return _redis_client


def get_pubsub() -> redis.client.PubSub:
    """Get or create Redis publish/subscribe - subscribes to both CGT and IVF channels"""
    global _pubsub
    if _pubsub is None:
        try:
            r = get_redis()
            _pubsub = r.pubsub()
            # Subscribe to both CGT (quality_channel) and IVF (ivf_quality_channel) channels
            _pubsub.subscribe('quality_channel', 'ivf_quality_channel')
            logger.info("Redis pub/sub subscription established for both CGT and IVF channels")
        except Exception as e:
            logger.error(f"Failed to create pub/sub connection: {e}")
            raise
    return _pubsub


def get_ln2_pubsub() -> redis.client.PubSub:
    """Get or create Redis pubsub for LN2 readings channel (separate from quality channels)."""
    global _ln2_pubsub
    if _ln2_pubsub is None:
        try:
            r = get_redis()
            _ln2_pubsub = r.pubsub()
            _ln2_pubsub.subscribe("ln2_readings_channel")
            logger.info("Redis pub/sub subscription established for ln2_readings_channel")
        except Exception as e:
            logger.error(f"Failed to create LN2 pub/sub connection: {e}")
            raise
    return _ln2_pubsub


def get_tank_kpi_pubsub() -> redis.client.PubSub:
    """Get or create Redis pubsub for tank KPI readings (Quality Tracking live graph)."""
    global _tank_kpi_pubsub
    if _tank_kpi_pubsub is None:
        try:
            r = get_redis()
            _tank_kpi_pubsub = r.pubsub()
            _tank_kpi_pubsub.subscribe("tank_kpi_readings_channel")
            logger.info("Redis pub/sub subscription established for tank_kpi_readings_channel")
        except Exception as e:
            logger.error(f"Failed to create tank KPI pub/sub connection: {e}")
            raise
    return _tank_kpi_pubsub


def get_incubator_kpi_pubsub() -> redis.client.PubSub:
    """Get or create Redis pubsub for incubator KPI readings (Incubator Quality Tracking live graph)."""
    global _incubator_kpi_pubsub
    if _incubator_kpi_pubsub is None:
        try:
            r = get_redis()
            _incubator_kpi_pubsub = r.pubsub()
            _incubator_kpi_pubsub.subscribe("incubator_kpi_readings_channel")
            logger.info("Redis pub/sub subscription established for incubator_kpi_readings_channel")
        except Exception as e:
            logger.error(f"Failed to create incubator KPI pub/sub connection: {e}")
            raise
    return _incubator_kpi_pubsub


def reset_redis_connection():
    """Reset Redis connections (useful for reconnection)"""
    global _redis_client, _pubsub, _ln2_pubsub, _tank_kpi_pubsub, _incubator_kpi_pubsub
    if _pubsub:
        try:
            _pubsub.close()
        except Exception:
            pass
    if _ln2_pubsub:
        try:
            _ln2_pubsub.close()
        except Exception:
            pass
    if _tank_kpi_pubsub:
        try:
            _tank_kpi_pubsub.close()
        except Exception:
            pass
    _pubsub = None
    _ln2_pubsub = None
    _tank_kpi_pubsub = None
    _incubator_kpi_pubsub = None
    _redis_client = None

