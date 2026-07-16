"""Redis client for session management and arq task queue."""

import logging
import redis.asyncio as redis
from arq import create_pool
from arq.connections import RedisSettings
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global Redis connection pool
redis_client: redis.Redis | None = None
redis_available: bool = False

# arq pool for enqueuing jobs
arq_pool = None


async def init_redis():
    """Initialize Redis connection and arq pool on app startup."""
    global redis_client, redis_available, arq_pool
    try:
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        # Test connection
        await redis_client.ping()
        redis_available = True
        print(f"[OK] Redis connected: {settings.REDIS_URL}")

        # Initialize arq pool
        try:
            arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
            print("[OK] arq pool initialized")
        except Exception as e:
            logger.warning(f"arq pool initialization failed: {e}")
            print(f"[WARN] arq pool initialization failed: {e}")

    except Exception as e:
        redis_available = False
        redis_client = None
        logger.warning(f"Redis connection failed: {e}")
        print(f"[WARN] Redis connection failed: {e}")
        print("[WARN] Session management will be disabled")


async def close_redis():
    """Close Redis connection and arq pool on app shutdown."""
    global redis_client, redis_available, arq_pool
    if arq_pool:
        await arq_pool.close()
        arq_pool = None
        print("[OK] arq pool closed")
    if redis_client:
        await redis_client.close()
        redis_client = None
        redis_available = False
        print("[OK] Redis connection closed")


def get_redis() -> redis.Redis | None:
    """Get Redis client. Returns None if not available."""
    return redis_client if redis_available else None


def get_arq_pool():
    """Get arq pool. Returns None if not available."""
    return arq_pool


def is_redis_available() -> bool:
    """Check if Redis is available."""
    return redis_available
