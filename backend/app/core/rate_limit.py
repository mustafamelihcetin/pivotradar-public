# backend/app/core/rate_limit.py
"""
Per-endpoint rate limiting dependency.

Kullanım:
    @router.post("/auth/login")
    async def login(request: Request, _=Depends(login_rate_limit), ...):
        ...

Her limiter bağımsız bir sayaç tutar — IP bazlı.
"""
import os
from datetime import timedelta
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)
from fastapi import Depends, HTTPException, Request, status
from .time_utils import now_utc

# IPs that are allowed to set X-Forwarded-For (e.g. your load balancer / nginx)
_TRUSTED_PROXIES: frozenset = frozenset(
    ip.strip()
    for ip in os.getenv("TRUSTED_PROXIES", "").split(",")
    if ip.strip()
)


class _EndpointLimiter:
    """DB-backed, IP bazlı bucketed rate limiter (P0.2 Optimized)."""

    def __init__(self, max_requests: int, window_seconds: int, label: str = ""):
        self.max_requests    = max_requests
        self.window_seconds  = window_seconds
        self.label           = label

    def _get_ip(self, request: Request) -> str:
        # CF-Connecting-IP is set by Cloudflare and cannot be spoofed by clients.
        # Use it first when present so per-user rate limiting works correctly behind Cloudflare.
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        client_ip = request.client.host if request.client else "unknown"
        if client_ip in _TRUSTED_PROXIES:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return client_ip

    def _get_key(self, request: Request) -> str:
        """Use user_id for authenticated requests, fall back to IP for guests."""
        ip = self._get_ip(request)
        try:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                from jose import jwt as _jwt
                from .settings import SECRET_KEY, ALGORITHM
                token = auth.split(" ", 1)[1]
                # verify_exp=False intentional: rate-limit by user identity even on expired tokens
                # to prevent bypass via deliberate token expiry. Only sub is consumed, not claims.
                payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False, "verify_aud": False})
                uid = payload.get("sub")
                token_type = payload.get("type", "")
                # Only accept access tokens for rate-limit key derivation
                if uid and token_type == "access":
                    return f"{self.label}:u{uid}"
        except Exception:
            pass
        return f"{self.label}:{ip}"

    def check(self, request: Request, db: "Session") -> None:
        from ..features.users.models import RateLimitRecord
        from sqlalchemy import func

        key = self._get_key(request)
        now = now_utc().replace(tzinfo=None)
        cutoff = now - timedelta(seconds=self.window_seconds)

        # 1. Aggregated Count (Sliding Window over buckets)
        total_hits = db.query(func.sum(RateLimitRecord.hits)).filter(
            RateLimitRecord.key == key,
            RateLimitRecord.timestamp >= cutoff
        ).scalar() or 0

        remaining = max(0, self.max_requests - int(total_hits))
        rl_headers = {
            "X-RateLimit-Limit":     str(self.max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Window":    str(self.window_seconds),
        }

        if total_hits >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Çok fazla istek. Lütfen {self.window_seconds}s bekleyin. ({self.label})",
                headers={"Retry-After": str(self.window_seconds), **rl_headers},
            )

        # Expose headers on request.state for middleware to forward
        if not hasattr(request.state, "rate_limit_headers"):
            request.state.rate_limit_headers = {}
        request.state.rate_limit_headers.update(rl_headers)

        # 2. Optimized Upsert (Bucket by Minute)
        bucket_ts = now.replace(second=0, microsecond=0)
        bucket = db.query(RateLimitRecord).filter(
            RateLimitRecord.key == key,
            RateLimitRecord.timestamp == bucket_ts
        ).first()

        if bucket:
            bucket.hits += 1
        else:
            new_hit = RateLimitRecord(key=key, timestamp=bucket_ts, hits=1)
            db.add(new_hit)

        try:
            db.commit()
        except Exception as _ce:
            db.rollback()
            logger.warning("rate_limit: db.commit failed: %s", _ce)


class _InProcessSlidingWindow:
    """
    Per-IP sliding window rate limiter.

    Redis varsa: ZADD/ZREMRANGEBYSCORE ile multi-worker güvenli.
    Redis yoksa: in-memory deque fallback (tek worker).
    """

    def __init__(self, max_requests: int, window_seconds: int):
        import collections
        import threading
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._buckets: dict = collections.defaultdict(collections.deque)

    def _get_ip(self, request: Request) -> str:
        # CF-Connecting-IP is set by Cloudflare and cannot be spoofed by clients.
        # Use it first when present so per-user rate limiting works correctly behind Cloudflare.
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        client_ip = request.client.host if request.client else "unknown"
        if client_ip in _TRUSTED_PROXIES:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return client_ip

    def _check_redis(self, ip: str) -> int:
        """Redis sliding window; count döner. Hata durumunda -1 döner."""
        import time
        from .redis_client import redis_zadd, redis_zremrangebyscore, redis_zcard, redis_expire, is_available
        if not is_available():
            return -1
        try:
            now = time.time()
            key = f"rl:global:{ip}"
            redis_zremrangebyscore(key, 0, now - self.window_seconds)
            redis_zadd(key, {str(now): now})
            count = redis_zcard(key)
            redis_expire(key, self.window_seconds * 2)
            return count
        except Exception:
            return -1

    def __call__(self, request: Request) -> None:
        import time
        ip = self._get_ip(request)

        count = self._check_redis(ip)
        if count == -1:
            # Redis yok — in-memory fallback
            now = time.monotonic()
            cutoff = now - self.window_seconds
            with self._lock:
                dq = self._buckets[ip]
                while dq and dq[0] < cutoff:
                    dq.popleft()
                count = len(dq)
                dq.append(now)

        remaining = max(0, self.max_requests - count)
        rl_headers = {
            "X-RateLimit-Limit":     str(self.max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Window":    str(self.window_seconds),
        }

        if count > self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Çok fazla istek. Lütfen {self.window_seconds}s bekleyin.",
                headers={"Retry-After": str(self.window_seconds), **rl_headers},
            )

        if not hasattr(request.state, "rate_limit_headers"):
            request.state.rate_limit_headers = {}
        request.state.rate_limit_headers.update(rl_headers)


# Global Limiter Instance — in-process, no DB hit per request
global_limiter = _InProcessSlidingWindow(max_requests=500, window_seconds=60)

# Limiter instances
_login_limiter    = _EndpointLimiter(max_requests=10, window_seconds=60,  label="login")
_analyze_limiter  = _EndpointLimiter(max_requests=6,  window_seconds=60,  label="analyze")
_register_limiter = _EndpointLimiter(max_requests=5,  window_seconds=300, label="register")


def _get_db_wrapper():
    from .database import get_db
    yield from get_db()


def login_rate_limit(request: Request, db: "Session" = Depends(_get_db_wrapper)) -> None:
    _login_limiter.check(request, db)


def analyze_rate_limit(request: Request, db: "Session" = Depends(_get_db_wrapper)) -> None:
    _analyze_limiter.check(request, db)


def register_rate_limit(request: Request, db: "Session" = Depends(_get_db_wrapper)) -> None:
    _register_limiter.check(request, db)
