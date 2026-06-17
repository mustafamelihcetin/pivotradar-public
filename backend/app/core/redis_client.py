# backend/app/core/redis_client.py
"""
Redis istemcisi — JTI blacklist, circuit breaker state, global rate limiter için.

Redis bağlantısı yoksa (geliştirme ortamı, Redis çalışmıyor) tüm operasyonlar
sessizce no-op döner. Bu sayede Redis'siz ortamda uygulama çökmez.
"""
import os
import logging

logger = logging.getLogger("PivotRadar.Redis")

_redis = None
_redis_available = False


def _init_redis():
    global _redis, _redis_available
    if _redis is not None:
        return
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        import redis as _redis_lib
        client = _redis_lib.Redis.from_url(url, socket_connect_timeout=2, decode_responses=True)
        client.ping()
        _redis = client
        _redis_available = True
        logger.info("Redis bağlantısı kuruldu: %s", url)
    except Exception as e:
        _redis_available = False
        logger.warning("Redis bağlantısı kurulamadı (%s) — in-memory fallback aktif", e)


def get_redis():
    """Bağlı Redis istemcisi döner. Bağlantı yoksa None döner."""
    if _redis is None:
        _init_redis()
    return _redis if _redis_available else None


def is_available() -> bool:
    if _redis is None:
        _init_redis()
    return _redis_available


def redis_set(key: str, value: str, ex: int = None) -> bool:
    """SET key value [EX seconds]. Başarısızsa False döner."""
    r = get_redis()
    if r is None:
        return False
    try:
        r.set(key, value, ex=ex)
        return True
    except Exception as e:
        logger.warning("redis_set hata: %s", e)
        return False


def redis_get(key: str):
    """GET key. Redis yoksa None döner."""
    r = get_redis()
    if r is None:
        return None
    try:
        return r.get(key)
    except Exception as e:
        logger.warning("redis_get hata: %s", e)
        return None


def redis_exists(key: str) -> bool:
    """EXISTS key."""
    r = get_redis()
    if r is None:
        return False
    try:
        return bool(r.exists(key))
    except Exception as e:
        logger.warning("redis_exists hata: %s", e)
        return False


def redis_hset(key: str, mapping: dict) -> bool:
    """HSET key field value [field value ...]"""
    r = get_redis()
    if r is None:
        return False
    try:
        r.hset(key, mapping=mapping)
        return True
    except Exception as e:
        logger.warning("redis_hset hata: %s", e)
        return False


def redis_hgetall(key: str) -> dict:
    """HGETALL key. Redis yoksa boş dict döner."""
    r = get_redis()
    if r is None:
        return {}
    try:
        return r.hgetall(key) or {}
    except Exception as e:
        logger.warning("redis_hgetall hata: %s", e)
        return {}


def redis_expire(key: str, seconds: int) -> bool:
    """EXPIRE key seconds."""
    r = get_redis()
    if r is None:
        return False
    try:
        r.expire(key, seconds)
        return True
    except Exception as e:
        logger.warning("redis_expire hata: %s", e)
        return False


def redis_zadd(key: str, mapping: dict) -> bool:
    """ZADD key score member"""
    r = get_redis()
    if r is None:
        return False
    try:
        r.zadd(key, mapping)
        return True
    except Exception as e:
        logger.warning("redis_zadd hata: %s", e)
        return False


def redis_zremrangebyscore(key: str, min_score, max_score) -> int:
    """ZREMRANGEBYSCORE key min max"""
    r = get_redis()
    if r is None:
        return 0
    try:
        return r.zremrangebyscore(key, min_score, max_score)
    except Exception as e:
        logger.warning("redis_zremrangebyscore hata: %s", e)
        return 0


def redis_zcard(key: str) -> int:
    """ZCARD key"""
    r = get_redis()
    if r is None:
        return 0
    try:
        return r.zcard(key)
    except Exception as e:
        logger.warning("redis_zcard hata: %s", e)
        return 0


def redis_expire_key(key: str, seconds: int) -> bool:
    return redis_expire(key, seconds)
