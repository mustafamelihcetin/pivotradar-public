# backend/app/core/ml_lock.py
"""
Shared distributed lock for all ML pipeline jobs.
Prevents concurrent runs of autonomous_calibration and ml_calibration_pipeline.
Uses the system_locks table (PostgreSQL advisory-style via INSERT ON CONFLICT).
"""
import logging
from sqlalchemy import text

logger = logging.getLogger("PivotRadar.MLLock")

ML_PIPELINE_LOCK_KEY = "ml_pipeline_lock"
ML_PIPELINE_LOCK_TTL = 1800  # 30 min — full pipeline can take longer than 10 min


def acquire_ml_lock(db) -> bool:
    """
    Try to acquire the ML pipeline lock.
    Returns True if acquired, False if already held by another job.
    Expired locks (TTL exceeded) are forcibly replaced.

    Fix: SELECT ile doğrulama kaldırıldı — SELECT her zaman satır döndürüyordu
    (başkasının tuttuğu lock dahil), bu yüzden her iki iş de "ben aldım" sanıyordu.
    Artık rowcount=0 → lock başkasında, rowcount=1 → lock bizde.
    """
    try:
        result = db.execute(
            text(
                "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
                "VALUES (:k, NOW(), NOW() + make_interval(secs => :ttl)) "
                "ON CONFLICT (lock_key) DO UPDATE "
                "SET acquired_at = NOW(), "
                "    expires_at  = NOW() + make_interval(secs => :ttl) "
                "WHERE system_locks.expires_at < NOW()"
            ),
            {"k": ML_PIPELINE_LOCK_KEY, "ttl": float(ML_PIPELINE_LOCK_TTL)},
        )
        db.commit()
        return result.rowcount > 0

    except Exception as e:
        logger.warning(f"[MLLock] acquire failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return False


def release_ml_lock(db) -> None:
    """Release the ML pipeline lock unconditionally."""
    try:
        db.execute(
            text("DELETE FROM system_locks WHERE lock_key = :k"),
            {"k": ML_PIPELINE_LOCK_KEY},
        )
        db.commit()
    except Exception as e:
        logger.warning(f"[MLLock] release failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
