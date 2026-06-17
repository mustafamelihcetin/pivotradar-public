# backend/app/core/auth_cache.py
"""
JTI blacklist — access token revocation.

Redis varsa: Redis SET ile TTL (multi-worker güvenli).
Redis yoksa: in-memory fallback (tek worker, geliştirme ortamı).

Logout'ta JTI buraya eklenir. Her get_current_user çağrısında kontrol edilir.
"""
import time
import threading
from typing import Dict

from .redis_client import redis_set, redis_exists, is_available as redis_is_available

# ── In-memory fallback ────────────────────────────────────────────────────────
_lock = threading.Lock()
_blacklist: Dict[str, float] = {}
_PRUNE_INTERVAL: float = 300.0
_last_prune: float = 0.0


def _prune_expired() -> None:
    global _last_prune
    now = time.time()
    if now - _last_prune < _PRUNE_INTERVAL:
        return
    expired = [jti for jti, exp in _blacklist.items() if exp < now]
    for jti in expired:
        del _blacklist[jti]
    _last_prune = now


# ── Public API ────────────────────────────────────────────────────────────────

def add_to_blacklist(jti: str, expires_at: float) -> None:
    """JTI'yi blacklist'e ekle. expires_at: unix timestamp."""
    ttl = int(expires_at - time.time())
    if ttl <= 0:
        return

    if redis_is_available():
        redis_set(f"jti:blacklist:{jti}", "1", ex=ttl)
    else:
        with _lock:
            _blacklist[jti] = expires_at
            _prune_expired()


def is_blacklisted(jti: str) -> bool:
    """JTI'nin blacklist'te olup olmadığını kontrol et."""
    if redis_is_available():
        return redis_exists(f"jti:blacklist:{jti}")

    with _lock:
        _prune_expired()
        exp = _blacklist.get(jti)
        if exp is None:
            return False
        if exp < time.time():
            del _blacklist[jti]
            return False
        return True
