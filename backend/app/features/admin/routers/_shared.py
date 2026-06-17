# app/features/admin/routers/_shared.py
"""Shared utilities for all admin sub-routers."""
from __future__ import annotations

import math
import logging
import time
import threading
from collections import deque
from decimal import Decimal
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.features.users.models import User
from app.features.users.router import get_current_user
from app.features.admin.models import AdminAuditLog

logger = logging.getLogger(__name__)

# ── Admin rate limiting ────────────────────────────────────────────────────────
_ADMIN_RATE_LIMIT   = 300   # dakika başına max istek sayısı (admin başına)
_ADMIN_RATE_WINDOW  = 60.0  # saniye
_admin_rate_lock    = threading.Lock()
_admin_req_times: dict = {}  # user_id → deque[float]


def _check_admin_rate(user: User) -> None:
    """Admin endpoint'leri için dakika bazlı rate limiting."""
    uid  = user.id
    now  = time.monotonic()
    with _admin_rate_lock:
        if uid not in _admin_req_times:
            _admin_req_times[uid] = deque()
        q = _admin_req_times[uid]
        while q and q[0] < now - _ADMIN_RATE_WINDOW:
            q.popleft()
        if len(q) >= _ADMIN_RATE_LIMIT:
            raise HTTPException(429, "Admin API hız sınırı aşıldı. Lütfen bir dakika bekleyin.")
        q.append(now)


# ── DB maintenance mutex ───────────────────────────────────────────────────────
# VACUUM FULL ve REINDEX aynı anda çalışırsa PostgreSQL table lock çakışması olur.
DB_MAINTENANCE_LOCK = threading.Lock()

# ── In-memory log capture ─────────────────────────────────────────────────────
_MAX_LOG_LINES = 500
_LOG_BUFFER: deque = deque(maxlen=_MAX_LOG_LINES)


class _AdminLogHandler(logging.Handler):
    def emit(self, record):
        try:
            _LOG_BUFFER.append({
                "ts":    record.created,
                "level": record.levelname,
                "name":  record.name,
                "msg":   self.format(record),
                "raw":   record.getMessage(),
            })
        except Exception:
            pass


_handler = _AdminLogHandler()
_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
logging.getLogger().addHandler(_handler)


# ── Auth helpers ───────────────────────────────────────────────────────────────

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    is_admin = current_user.role == "ADMIN" or current_user.is_superuser
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin yetkisi (ADMIN rolü) gerekli.")
    _check_admin_rate(current_user)
    return current_user


def log_admin_action(
    db: Session,
    admin: User,
    action: str,
    target: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Admin audit log kaydı. Hata olursa session rollback yapılır, uygulama akışı kesilmez."""
    try:
        log = AdminAuditLog(admin_id=admin.id, action=action, target=target, details=details)
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error("Audit log yazılamadı (action=%s): %s", action, e)
        try:
            db.rollback()
        except Exception:
            pass


# ── Serialization helper ───────────────────────────────────────────────────────

def _san(obj):
    """Recursively sanitize non-finite floats and Decimals for JSON serialization."""
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _san(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_san(v) for v in obj]
    return obj
