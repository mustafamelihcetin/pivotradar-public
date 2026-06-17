# backend/app/core/self_heal.py
"""
Self-healing subsystem.

startup_heal()  — bootstrap'ta bir kez çağrılır; önceki çökmeden kalan hasarı onarır.
runtime_status()— periyodik watchdog tarafından çağrılır; sistemin anlık sağlığını döner.

Kapsanan senaryolar:
  1. Scanner stuck (önceki crash'ten kalan RUNNING state)      → IDLE'a sıfırla
  2. ML model dosyası bozuk/kayıp                              → rules-only fallback işareti
  3. DB bağlantısı kesildi                                     → pool_pre_ping zaten yapar; health'e raporla
  4. Redis çöktü                                               → in-memory fallback zaten var; health'e raporla
  5. Disk dolmak üzere (< 10% boş)                            → CRITICAL log + health uyarısı
  6. Bellek kritik (> 90%)                                     → WARNING log + health uyarısı
  7. Rate-limit tablosu şişirilmiş                            → 7 günden eski kayıtları temizle
  8. Süresi dolmuş token blacklist kayıtları                  → temizle
"""
import os
import json
import time
import logging
import datetime
import threading
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger("PivotRadar.SelfHeal")

# ── Disk eşikleri ──────────────────────────────────────────────────────────────
_DISK_WARN_PCT  = 20.0   # %20 altında uyarı
_DISK_CRIT_PCT  = 10.0   # %10 altında kritik

# ── Bellek eşikleri ────────────────────────────────────────────────────────────
_MEM_WARN_PCT   = 85.0
_MEM_CRIT_PCT   = 95.0

# ── Paylaşılan sağlık raporu (runtime_status() sonucu buraya yazılır) ──────────
_health_cache: Dict[str, Any] = {}
_health_lock  = threading.Lock()


def get_cached_health() -> Dict[str, Any]:
    with _health_lock:
        return dict(_health_cache)


def _update_health(key: str, value: Any) -> None:
    with _health_lock:
        _health_cache[key] = value


# ── 1. Scanner stuck reset ─────────────────────────────────────────────────────

def _heal_scanner_state() -> str:
    """Progress dosyasında RUNNING varsa IDLE'a döndür (crash recovery)."""
    try:
        from app.core import settings as _s
        pf: Path = _s.PROGRESS_FILE
        if pf.exists():
            raw = pf.read_text(encoding="utf-8")
            data = json.loads(raw)
            if data.get("state") in ("RUNNING", "STARTING"):
                pf.write_text(
                    json.dumps({
                        "state": "IDLE", "percent": 0,
                        "stage": "IDLE", "msg": "Başlangıç sıfırlaması — önceki çalışma yarıda kesildi."
                    }),
                    encoding="utf-8",
                )
                logger.warning("[SelfHeal] Scanner state RUNNING → IDLE (crash recovery).")
                return "reset"
        return "ok"
    except Exception as e:
        logger.debug("[SelfHeal] Scanner state check skipped: %s", e)
        return "skip"


# ── 2. ML model sağlığı ────────────────────────────────────────────────────────

_PROFILE_MODEL_NAMES = [
    "global",  # ml_isotonic.json
    "aggressive", "breakout", "reversal", "safe_harbor",
    "scalper", "trend_hunter", "value_scout",
]

def _check_ml_models() -> Dict[str, str]:
    """Flat model dosyalarını kontrol eder: ml_isotonic.json + ml_isotonic_PROFILE.json"""
    results = {}
    try:
        from app.core import settings as _s
        model_dir = Path(_s.PROJECT_ROOT) / "models"
        if not model_dir.exists():
            return {"global": "missing_dir"}

        for profile in _PROFILE_MODEL_NAMES:
            fname = "ml_isotonic.json" if profile == "global" else f"ml_isotonic_{profile}.json"
            mf = model_dir / fname
            if not mf.exists():
                results[profile] = "missing"
                continue
            try:
                data = json.loads(mf.read_text(encoding="utf-8"))
                if not data.get("x") or not data.get("y"):
                    results[profile] = "corrupt"
                else:
                    results[profile] = "ok"
            except Exception:
                results[profile] = "corrupt"
    except Exception as e:
        logger.debug("[SelfHeal] ML model check failed: %s", e)
        results["error"] = str(e)
    return results


# ── 3. DB bağlantısı ──────────────────────────────────────────────────────────

def _check_db() -> str:
    try:
        from app.core.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as e:
        logger.error("[SelfHeal] DB health check FAIL: %s", e)
        return f"error: {e}"


# ── 4. Redis bağlantısı ───────────────────────────────────────────────────────

def _check_redis() -> str:
    try:
        from app.core.redis_client import is_available, get_redis
        if not is_available():
            return "unavailable"
        r = get_redis()
        r.ping()
        return "ok"
    except Exception as e:
        logger.warning("[SelfHeal] Redis health check FAIL: %s", e)
        return f"error: {e}"


# ── 5. Disk alanı ─────────────────────────────────────────────────────────────

def _check_disk() -> Dict[str, Any]:
    try:
        import shutil
        total, used, free = shutil.disk_usage("/")
        free_pct = (free / total) * 100 if total else 100.0
        status = "ok"
        if free_pct < _DISK_CRIT_PCT:
            status = "critical"
            logger.critical("[SelfHeal] DISK KRİTİK: %.1f%% boş (%dMB). Log rotasyonunu kontrol et.", free_pct, free // 1024 // 1024)
            try:
                from app.core.notifier import send_alert
                send_alert("🖥️ Disk Kritik", f"Disk dolmak üzere: %.1f%% boş (%dMB)" % (free_pct, free // 1024 // 1024), level="critical")
            except Exception:
                pass
        elif free_pct < _DISK_WARN_PCT:
            status = "warning"
            logger.warning("[SelfHeal] Disk uyarısı: %.1f%% boş (%dMB).", free_pct, free // 1024 // 1024)
        return {"status": status, "free_pct": round(free_pct, 1), "free_mb": free // 1024 // 1024}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── 6. Bellek kullanımı ───────────────────────────────────────────────────────

def _check_memory() -> Dict[str, Any]:
    try:
        import psutil
        vm = psutil.virtual_memory()
        used_pct = vm.percent
        status = "ok"
        if used_pct > _MEM_CRIT_PCT:
            status = "critical"
            logger.critical("[SelfHeal] BELLEK KRİTİK: %.1f%% kullanımda.", used_pct)
        elif used_pct > _MEM_WARN_PCT:
            status = "warning"
            logger.warning("[SelfHeal] Bellek uyarısı: %.1f%% kullanımda.", used_pct)
        return {"status": status, "used_pct": round(used_pct, 1), "available_mb": vm.available // 1024 // 1024}
    except ImportError:
        return {"status": "skip", "detail": "psutil not installed"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── 7. Rate-limit tablo temizliği ─────────────────────────────────────────────

def _cleanup_rate_limit_table() -> int:
    """7 günden eski rate-limit kayıtlarını sil. Startup'ta çalışır."""
    try:
        from app.core.database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=7)
            result = db.execute(
                text("DELETE FROM rate_limit_records WHERE timestamp < :cutoff"),
                {"cutoff": cutoff}
            )
            db.commit()
            deleted = result.rowcount
            if deleted > 0:
                logger.info("[SelfHeal] Rate-limit tablo temizliği: %d kayıt silindi.", deleted)
            return deleted
        finally:
            db.close()
    except Exception as e:
        logger.debug("[SelfHeal] Rate-limit cleanup skipped: %s", e)
        return 0


# ── 8. Token blacklist temizliği ──────────────────────────────────────────────

def _cleanup_token_blacklist() -> int:
    """Süresi dolmuş token_blacklist kayıtlarını sil."""
    try:
        from app.core.database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            now = datetime.datetime.utcnow()
            result = db.execute(
                text("DELETE FROM token_blacklist WHERE expires_at < :now"),
                {"now": now}
            )
            db.commit()
            deleted = result.rowcount
            if deleted > 0:
                logger.info("[SelfHeal] Token blacklist temizliği: %d kayıt silindi.", deleted)
            return deleted
        finally:
            db.close()
    except Exception as e:
        logger.debug("[SelfHeal] Token blacklist cleanup skipped: %s", e)
        return 0


# ── Public API ─────────────────────────────────────────────────────────────────

def startup_heal() -> Dict[str, Any]:
    """
    Bootstrap'ta bir kez çağrılır.
    Önceki çökmeden kalan hasarı onarır ve başlangıç sağlık raporunu döner.
    """
    t0 = time.monotonic()
    report: Dict[str, Any] = {"timestamp": datetime.datetime.utcnow().isoformat()}

    report["scanner_reset"]      = _heal_scanner_state()
    report["rate_limit_cleanup"] = _cleanup_rate_limit_table()
    report["token_cleanup"]      = _cleanup_token_blacklist()
    report["ml_models"]          = _check_ml_models()
    report["db"]                 = _check_db()
    report["redis"]              = _check_redis()
    report["disk"]               = _check_disk()
    report["memory"]             = _check_memory()
    report["elapsed_ms"]         = int((time.monotonic() - t0) * 1000)

    # Genel durum: herhangi bir bileşen critical/error ise overall=degraded
    _critical = any(
        str(v.get("status", v) if isinstance(v, dict) else v).startswith(("critical", "error"))
        for k, v in report.items()
        if k not in ("timestamp", "elapsed_ms", "rate_limit_cleanup", "token_cleanup", "scanner_reset")
    )
    report["overall"] = "degraded" if _critical else "healthy"

    _update_health("last_startup", report)
    logger.info("[SelfHeal] Startup tamamlandı (%dms) — overall=%s", report["elapsed_ms"], report["overall"])
    return report


_EXPECTED_JOBS = {
    "auto_scan",
    "autonomous_calibration",
    "ml_calibration_pipeline",
    "system_maintenance",
    "anomaly_check",
    "jsonb_cleanup",
}

def _ensure_scheduler_jobs() -> None:
    """Her 5 dakikada çalışır. Eksik job'ları tespit edip yeniden kaydeder."""
    try:
        from app.core.scheduler import scheduler_manager
        existing = {j["id"] for j in scheduler_manager.get_jobs()}
        missing = _EXPECTED_JOBS - existing
        if not missing:
            return
        logger.warning("[Watchdog] Eksik scheduler job'lar tespit edildi: %s — yeniden kaydediliyor", missing)
        from app.core.bootstrap import _setup_scheduler as _ss
        _ss()
        logger.info("[Watchdog] Scheduler job'lar yeniden kaydedildi.")
    except Exception as e:
        logger.warning("[Watchdog] Scheduler job kontrolü başarısız: %s", e)


def runtime_status() -> Dict[str, Any]:
    """
    Periyodik watchdog tarafından çağrılır (scheduler her 5 dakikada bir).
    Mevcut sistem sağlığını döner ve _health_cache'i günceller.
    """
    t0 = time.monotonic()
    report: Dict[str, Any] = {"timestamp": datetime.datetime.utcnow().isoformat()}

    report["db"]     = _check_db()
    report["redis"]  = _check_redis()
    report["disk"]   = _check_disk()
    report["memory"] = _check_memory()

    _critical = any(
        str(v.get("status", v) if isinstance(v, dict) else v).startswith(("critical", "error"))
        for v in [report["db"], report["redis"], report["disk"], report["memory"]]
    )
    report["overall"] = "degraded" if _critical else "healthy"
    report["elapsed_ms"] = int((time.monotonic() - t0) * 1000)

    _update_health("last_runtime", report)
    _update_health("overall", report["overall"])

    # Scheduler job watchdog — eksik job'ları yeniden kaydet
    _ensure_scheduler_jobs()

    # Kritik durum → Telegram/log üzerinden bildir
    if _critical:
        try:
            from app.core.notifier import send_alert
            issues = []
            for k, v in report.items():
                s = v.get("status", v) if isinstance(v, dict) else v
                if str(s).startswith(("critical", "error")):
                    issues.append(f"{k}: {s}")
            if issues:
                send_alert(
                    title="PivotRadar Watchdog: Sistem Uyarısı",
                    message=(
                        f"Tarih: {report['timestamp']}\n"
                        + "\n".join(f"• {i}" for i in issues)
                    ),
                    level="critical",
                )
        except Exception as _ne:
            logger.debug("[SelfHeal] Notification gönderilemedi: %s", _ne)

    return report
