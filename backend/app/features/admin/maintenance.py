# backend/app/features/admin/maintenance.py
import os
import logging
import datetime
from pathlib import Path
from app.core.database import SessionLocal
from sqlalchemy import text
from app.core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.Maintenance")

def run_smart_maintenance():
    """
    Sistem temizlik ve bakım görevi. 
    Sadece geçici dosyaları ve teknik logları temizler, ana verilere dokunmaz.
    """
    try:
        logger.info("MAINTENANCE: Starting smart cleanup...")
        
        # 1. Log Dosyalarını Temizle (>30 gün)
        log_dir = Path("logs")
        if log_dir.exists():
            from app.core.time_utils import now_utc
            cutoff = now_utc().timestamp() - (30 * 86400)
            for f in log_dir.glob("*.log*"):
                if f.stat().st_mtime < cutoff:
                    try:
                        f.unlink()
                        logger.debug(f"MAINTENANCE: Deleted old log file: {f.name}")
                    except Exception as _fe:
                        logger.debug(f"MAINTENANCE: Log dosyası silinemedi ({f.name}): {_fe}")

        # 2. Teknik Veritabanı Kayıtlarını Temizle (>30 gün)
        # Sadece sistem logları ve kullanıcı aktivite geçmişi
        db = SessionLocal()
        try:
            cutoff_30  = now_utc().replace(tzinfo=None) - datetime.timedelta(days=30)
            cutoff_90  = now_utc().replace(tzinfo=None) - datetime.timedelta(days=90)
            cutoff_180 = now_utc().replace(tzinfo=None) - datetime.timedelta(days=180)

            # System logs
            db.execute(text("DELETE FROM system_task_logs WHERE started_at < :cutoff"),
                       {"cutoff": cutoff_30})

            # UserActivity
            try:
                db.execute(text("DELETE FROM user_activities WHERE timestamp < :cutoff"),
                           {"cutoff": cutoff_30})
            except Exception:
                pass

            # scan_scores: evaluated, old rows — keep last 90 days
            # strategy_snapshot bloat: nullify snapshot on rows >90 days old (data already evaluated)
            try:
                db.execute(text("""
                    UPDATE scan_scores
                    SET strategy_snapshot = NULL
                    WHERE scan_date < :cutoff AND strategy_snapshot IS NOT NULL
                """), {"cutoff": cutoff_90.date()})
                deleted_scan = db.execute(text("""
                    DELETE FROM scan_scores
                    WHERE scan_date < :cutoff AND evaluated_at IS NOT NULL
                """), {"cutoff": cutoff_180.date()})
                logger.info(f"MAINTENANCE: Archived scan_scores snapshot nullified (>90d), "
                            f"deleted evaluated rows (>180d): {deleted_scan.rowcount}")
            except Exception as _se:
                logger.debug(f"MAINTENANCE scan_scores: {_se}")

            # symbol_data_cache: keep last 30 days, delete older batches
            try:
                deleted_cache = db.execute(text("""
                    DELETE FROM symbol_data_cache
                    WHERE scanned_at < :cutoff
                """), {"cutoff": cutoff_30})
                logger.info(f"MAINTENANCE: Deleted old symbol_data_cache rows: {deleted_cache.rowcount}")
            except Exception as _ce:
                logger.debug(f"MAINTENANCE symbol_data_cache: {_ce}")

            # rate_limit_records: expired entries
            try:
                db.execute(text("DELETE FROM rate_limit_records WHERE timestamp < :cutoff"),
                           {"cutoff": cutoff_30})
            except Exception:
                pass

            # token_blacklist: expired tokens
            try:
                db.execute(text("DELETE FROM token_blacklist WHERE expires_at < :now"),
                           {"now": now_utc().replace(tzinfo=None)})
            except Exception:
                pass

            db.commit()
        except Exception as e:
            logger.error(f"MAINTENANCE DB ERROR: {e}")
            db.rollback()
        finally:
            db.close()

        logger.info("MAINTENANCE: Cleanup COMPLETED.")
        
    except Exception as e:
        logger.error(f"MAINTENANCE ERROR: {e}", exc_info=True)
