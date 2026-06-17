# backend/app/features/admin/routers/monitoring.py
"""
System monitoring admin endpoints:
  GET /live
  GET /diagnostics
  GET /scheduler/status
  GET /task-history
"""
import os
import time
import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, cast, Date

from app.core.database import get_db
from app.features.users.models import User
from app.features.scanner.models import ScanScore
from app.features.admin.routers._shared import get_admin_user, _san

router = APIRouter()


# ── Live system monitor ────────────────────────────────────────────────────────

@router.get("/live", response_model=Dict[str, Any])
def admin_live(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Real-time scan queue, active scan, and system state."""
    from app.features.scanner.router import get_scan_state_for_admin
    scan_state = get_scan_state_for_admin()

    # DB stats
    today = datetime.date.today()
    scans_today = db.query(func.count(ScanScore.id)).filter(
        cast(ScanScore.scanned_at, Date) == today
    ).scalar() or 0

    # Recent scans (last 10 sessions)
    recent_sessions = (
        db.query(
            ScanScore.scan_session_id,
            func.min(ScanScore.scanned_at).label("started_at"),
            func.count(ScanScore.id).label("symbol_count"),
            func.avg(ScanScore.qrs_score).label("avg_qrs"),
            ScanScore.profile_name,
        )
        .group_by(ScanScore.scan_session_id, ScanScore.profile_name)
        .order_by(desc("started_at"))
        .limit(10)
        .all()
    )

    sessions_list = [{
        "session_id":   r.scan_session_id,
        "started_at":   r.started_at.isoformat() if r.started_at else None,
        "symbol_count": r.symbol_count,
        "avg_qrs":      round(float(r.avg_qrs), 1) if r.avg_qrs else None,
        "profile":      r.profile_name,
    } for r in recent_sessions]

    # Process + System telemetry
    import platform as _platform
    _boot_time = None
    process_stats: dict = {}
    system_stats: dict = {}

    try:
        import psutil

        # ── Process (this app) ──────────────────────────────────────────────
        proc = psutil.Process(os.getpid())
        mem_info = proc.memory_info()
        _boot_time = psutil.boot_time()

        process_stats = {
            "pid":            os.getpid(),
            "mem_mb":         round(mem_info.rss / 1024 / 1024, 1),
            "mem_vms_mb":     round(mem_info.vms / 1024 / 1024, 1),
            "cpu_pct":        proc.cpu_percent(interval=None),
            "threads":        proc.num_threads(),
            "open_files":     len(proc.open_files()),
            "status":         proc.status(),
            "create_time":    proc.create_time(),
        }

        # ── CPU ─────────────────────────────────────────────────────────────
        cpu_times    = psutil.cpu_times_percent(interval=None)
        per_cpu_pct  = psutil.cpu_percent(percpu=True, interval=None)
        cpu_freq     = psutil.cpu_freq()

        # ── Memory ──────────────────────────────────────────────────────────
        mem          = psutil.virtual_memory()
        swap         = psutil.swap_memory()

        # ── Disk ────────────────────────────────────────────────────────────
        disk_root    = psutil.disk_usage('/')
        try:
            disk_io  = psutil.disk_io_counters()
            disk_read_mb  = round(disk_io.read_bytes  / 1024 / 1024, 1) if disk_io else None
            disk_write_mb = round(disk_io.write_bytes / 1024 / 1024, 1) if disk_io else None
        except Exception:
            disk_read_mb = disk_write_mb = None

        # ── Network ─────────────────────────────────────────────────────────
        try:
            net_io   = psutil.net_io_counters()
            net_sent_mb = round(net_io.bytes_sent / 1024 / 1024, 1)
            net_recv_mb = round(net_io.bytes_recv / 1024 / 1024, 1)
            net_pkt_drop = net_io.dropin + net_io.dropout
        except Exception:
            net_sent_mb = net_recv_mb = net_pkt_drop = None

        # ── System uptime ───────────────────────────────────────────────────
        uptime_sec   = int(time.time() - _boot_time) if _boot_time else None

        system_stats = {
            # CPU
            "cpu_usage":       round(psutil.cpu_percent(interval=None), 1),
            "cpu_count":       psutil.cpu_count(logical=True),
            "cpu_count_phys":  psutil.cpu_count(logical=False),
            "cpu_freq_mhz":    round(cpu_freq.current, 0) if cpu_freq else None,
            "cpu_freq_max_mhz":round(cpu_freq.max, 0)     if cpu_freq else None,
            "per_cpu_pct":     per_cpu_pct,
            "cpu_user_pct":    round(cpu_times.user, 1),
            "cpu_system_pct":  round(cpu_times.system, 1),
            "cpu_idle_pct":    round(cpu_times.idle, 1),
            # Memory
            "ram_usage":       round(mem.percent, 1),
            "ram_total_gb":    round(mem.total     / (1024**3), 2),
            "ram_used_gb":     round(mem.used      / (1024**3), 2),
            "ram_available_gb":round(mem.available / (1024**3), 2),
            "ram_cached_gb":   round(getattr(mem, 'cached', 0) / (1024**3), 2),
            "swap_usage":      round(swap.percent, 1),
            "swap_total_gb":   round(swap.total  / (1024**3), 2),
            "swap_used_gb":    round(swap.used   / (1024**3), 2),
            # Disk
            "disk_usage":      round(disk_root.percent, 1),
            "disk_total_gb":   round(disk_root.total / (1024**3), 1),
            "disk_used_gb":    round(disk_root.used  / (1024**3), 1),
            "disk_free_gb":    round(disk_root.free  / (1024**3), 1),
            "disk_read_total_mb":  disk_read_mb,
            "disk_write_total_mb": disk_write_mb,
            # Network
            "net_sent_mb":     net_sent_mb,
            "net_recv_mb":     net_recv_mb,
            "net_pkt_drop":    net_pkt_drop,
            # Uptime
            "uptime_sec":      uptime_sec,
            "boot_time":       _boot_time,
            # Host
            "hostname":        _platform.node(),
            "os":              f"{_platform.system()} {_platform.release()}",
            "python_version":  _platform.python_version(),
        }
    except Exception as exc:
        process_stats = {"pid": os.getpid(), "error": str(exc)}
        system_stats  = {}

    return _san({
        "scan":            scan_state,
        "scans_today":     scans_today,
        "recent_sessions": sessions_list,
        "process":         process_stats,
        "system":          system_stats,
        "ts":              time.time(),
    })


@router.get("/diagnostics", response_model=Dict[str, Any])
def admin_diagnostics(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Runs a full battery of system health checks."""
    from app.features.admin.diagnostics import run_system_diagnostics
    return _san(run_system_diagnostics(db))


@router.get("/scheduler/status", response_model=Dict[str, Any])
def admin_get_scheduler_status(_: User = Depends(get_admin_user)):
    """Fetch status of all background jobs."""
    try:
        from app.core.scheduler import scheduler_manager
        return {"ok": True, "jobs": scheduler_manager.get_jobs_info()}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/task-history", response_model=Dict[str, Any])
def admin_get_task_history(limit: int = 20, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    """Fetch recent background task execution logs."""
    from app.features.scanner.models import SystemTaskLog
    logs = db.query(SystemTaskLog).order_by(desc(SystemTaskLog.started_at)).limit(limit).all()
    items = [{
        "id":          h.id,
        "task_name":   h.task_name,
        "started_at":  h.started_at.isoformat() if h.started_at else None,
        "finished_at": h.finished_at.isoformat() if h.finished_at else None,
        "status":      h.status,
        "message":     h.message,
        "duration":    h.duration,
    } for h in logs]
    return {"ok": True, "items": items}


@router.get("/health-checks", response_model=Dict[str, Any])
def admin_health_checks(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Sistem sağlık kontrolleri — admin panelindeki 'Sistem Sağlığı' sekmesi için.
    Her kontrol bağımsız çalışır; biri başarısız olursa diğerleri etkilenmez.

    Kontroller:
      - db_connectivity: PostgreSQL bağlantısı
      - db_lock_stale: Süresi geçmiş system_locks tespiti
      - cache_freshness: SymbolDataCache'in son güncellenme zamanı
      - profile_cache_coverage: Her profil için DB cache varlığı
      - scheduler_health: APScheduler job'larının durumu
      - analyze_cache_l1: In-memory cache doluluk durumu
      - ml_model: ML model yüklü mü
      - scanner_not_stuck: Aktif tarama varsa başlangıç zamanı
    """
    import time as _time

    checks: list = []

    def _check(name: str, fn) -> dict:
        _t0 = _time.monotonic()
        try:
            result = fn()
            return {"name": name, "status": result.get("status", "ok"),
                    "message": result.get("message", ""), "ms": round((_time.monotonic() - _t0) * 1000)}
        except Exception as exc:
            return {"name": name, "status": "error", "message": str(exc),
                    "ms": round((_time.monotonic() - _t0) * 1000)}

    # DB bağlantısı
    def _db_conn():
        from sqlalchemy import text as _t
        db.execute(_t("SELECT 1"))
        return {"status": "ok", "message": "PostgreSQL bağlantısı sağlıklı."}
    checks.append(_check("db_connectivity", _db_conn))

    # Süresi geçmiş DB lock tespiti
    def _stale_locks():
        from sqlalchemy import text as _t
        rows = db.execute(_t(
            "SELECT COUNT(*) FROM system_locks WHERE expires_at < NOW()"
        )).scalar()
        if rows:
            return {"status": "warning", "message": f"{rows} süresi dolmuş kilit var — otomatik temizleme bekleniyor."}
        return {"status": "ok", "message": "Süresi dolmuş kilit yok."}
    checks.append(_check("db_lock_stale", _stale_locks))

    # SymbolDataCache tazeliği
    def _cache_freshness():
        from app.features.scanner.models import SymbolDataCache
        import datetime as _dt
        row = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
        if not row:
            return {"status": "error", "message": "SymbolDataCache boş — tarama yapılmamış."}
        age_h = (_dt.datetime.now(_dt.timezone.utc) - row.scanned_at.replace(tzinfo=_dt.timezone.utc)).total_seconds() / 3600
        if age_h > 48:
            return {"status": "error", "message": f"Cache {round(age_h, 1)} saat önce güncellenmiş — çok eski."}
        if age_h > 26:
            return {"status": "warning", "message": f"Cache {round(age_h, 1)} saat önce güncellenmiş."}
        return {"status": "ok", "message": f"Cache {round(age_h, 1)} saat önce güncellenmiş."}
    checks.append(_check("cache_freshness", _cache_freshness))

    # Her profil için DB cache varlığı
    def _profile_cache_coverage():
        from sqlalchemy import text as _t
        from app.features.scanner.routers.api_scan import _ALL_PROFILES
        rows = db.execute(_t(
            "SELECT profile_name FROM profile_score_cache WHERE expires_at > NOW()"
        )).fetchall()
        cached_profiles = {r[0] for r in rows}
        missing = [p for p in _ALL_PROFILES if p not in cached_profiles]
        if not missing:
            return {"status": "ok", "message": f"Tüm {len(_ALL_PROFILES)} profil DB cache'te mevcut."}
        return {"status": "warning",
                "message": f"{len(missing)} profil DB cache'te yok: {', '.join(missing)}"}
    checks.append(_check("profile_cache_coverage", _profile_cache_coverage))

    # Scheduler sağlık durumu
    def _scheduler():
        from app.core.scheduler import scheduler_manager
        if not scheduler_manager.scheduler.running:
            return {"status": "error", "message": "APScheduler çalışmıyor!"}
        jobs = scheduler_manager.get_jobs_info()
        auto_scan = next((j for j in jobs if j["id"] == "auto_scan"), None)
        if not auto_scan:
            return {"status": "warning", "message": "auto_scan job bulunamadı."}
        return {"status": "ok", "message": f"Scheduler aktif, {len(jobs)} job kayıtlı."}
    checks.append(_check("scheduler_health", _scheduler))

    # In-memory analyze cache L1
    def _l1_cache():
        from app.features.scanner.routers.api_scan import _ANALYZE_CACHE, _ANALYZE_CACHE_TTL, _ANALYZE_CACHE_LOCK
        with _ANALYZE_CACHE_LOCK:
            total = len(_ANALYZE_CACHE)
            valid = sum(1 for v in _ANALYZE_CACHE.values()
                        if (_time.monotonic() - v["ts"]) < _ANALYZE_CACHE_TTL)
        if valid == 0:
            return {"status": "warning", "message": f"L1 cache boş (toplam {total} giriş var, hepsi süresi dolmuş)."}
        return {"status": "ok", "message": f"L1 cache: {valid}/{total} giriş geçerli."}
    checks.append(_check("analyze_cache_l1", _l1_cache))

    # ML model
    def _ml_model():
        from app.features.scoring.ml.ml_calib import _CACHED
        if _CACHED is None:
            return {"status": "warning", "message": "ML modeli henüz yüklenmemiş veya eğitilmemiş."}
        return {"status": "ok", "message": "ML modeli belleğe yüklü."}
    checks.append(_check("ml_model", _ml_model))

    # Scanner takılı mı
    def _scanner_stuck():
        from app.features.scanner.logic.state import ACTIVE, STATE_LOCK
        with STATE_LOCK:
            started_at = ACTIVE.get("started_at")
        if started_at:
            elapsed = _time.time() - started_at
            if elapsed > 3600:
                return {"status": "error", "message": f"Tarama {round(elapsed/60)} dakikadır sürüyor — takılmış olabilir."}
            return {"status": "warning", "message": f"Tarama devam ediyor ({round(elapsed/60)} dakika)."}
        return {"status": "ok", "message": "Şu an aktif tarama yok."}
    checks.append(_check("scanner_not_stuck", _scanner_stuck))

    ok_count = sum(1 for c in checks if c["status"] == "ok")
    warn_count = sum(1 for c in checks if c["status"] == "warning")
    err_count = sum(1 for c in checks if c["status"] == "error")
    overall = "healthy" if err_count == 0 and warn_count == 0 else \
              "degraded" if err_count == 0 else "unhealthy"

    return {
        "ts": _time.time(),
        "overall": overall,
        "summary": {"ok": ok_count, "warning": warn_count, "error": err_count},
        "checks": checks,
    }


@router.get("/metrics", response_model=Dict[str, Any])
def admin_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Operasyonel sağlık göstergeleri — tek bakışta sistem durumu.

    Döndürür:
      - analyze_cache: hit/miss oranı, TTL, profil başına durum
      - db_locks: aktif system_locks (stale lock tespiti)
      - scheduler: job listesi ve sonraki çalışma zamanları
      - scanner: aktif tarama, kuyruk uzunluğu
      - last_scan: son başarılı taramanın zamanı ve sembol sayısı
    """
    from sqlalchemy import text
    import time as _time

    # ── Analyze cache istatistikleri ─────────────────────────────────────────
    cache_info: dict = {}
    try:
        from app.features.scanner.routers.api_scan import (
            _ANALYZE_CACHE, _ANALYZE_CACHE_LOCK, _ANALYZE_CACHE_TTL,
            _ANALYZE_INFLIGHT, _ALL_PROFILES
        )
        with _ANALYZE_CACHE_LOCK:
            total = len(_ANALYZE_CACHE)
            now_mono = _time.monotonic()
            valid = sum(
                1 for v in _ANALYZE_CACHE.values()
                if (now_mono - v["ts"]) < _ANALYZE_CACHE_TTL
            )
            inflight = len(_ANALYZE_INFLIGHT)
            profile_status = {}
            for prof in _ALL_PROFILES:
                import hashlib, json as _json
                raw = f"{prof}:1000:{_json.dumps({}, sort_keys=True)}"
                key = hashlib.md5(raw.encode()).hexdigest()
                entry = _ANALYZE_CACHE.get(key)
                if entry:
                    age_s = int(now_mono - entry["ts"])
                    profile_status[prof] = {
                        "cached": True,
                        "age_s": age_s,
                        "expires_in_s": max(0, _ANALYZE_CACHE_TTL - age_s),
                        "data_time": entry.get("data_time", ""),
                    }
                else:
                    profile_status[prof] = {"cached": False}
        cache_info = {
            "total_entries": total,
            "valid_entries": valid,
            "stale_entries": total - valid,
            "inflight": inflight,
            "ttl_s": _ANALYZE_CACHE_TTL,
            "profiles": profile_status,
        }
    except Exception as e:
        cache_info = {"error": str(e)}

    # ── DB locks ─────────────────────────────────────────────────────────────
    db_locks: list = []
    try:
        rows = db.execute(text(
            "SELECT lock_key, acquired_at, expires_at, "
            "  (expires_at < NOW()) AS is_expired, "
            "  EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS ttl_sec "
            "FROM system_locks ORDER BY acquired_at"
        )).fetchall()
        db_locks = [{
            "lock_key":    r[0],
            "acquired_at": r[1].isoformat() if r[1] else None,
            "expires_at":  r[2].isoformat() if r[2] else None,
            "is_expired":  r[3],
            "ttl_sec":     r[4],
        } for r in rows]
    except Exception as e:
        db_locks = [{"error": str(e)}]

    # ── Scheduler jobs ────────────────────────────────────────────────────────
    scheduler_info: list = []
    try:
        from app.core.scheduler import scheduler_manager
        scheduler_info = scheduler_manager.get_jobs_info()
    except Exception as e:
        scheduler_info = [{"error": str(e)}]

    # ── Scanner state ─────────────────────────────────────────────────────────
    scanner_state: dict = {}
    try:
        from app.features.scanner.logic.state import ACTIVE, QUEUE, STATE_LOCK
        with STATE_LOCK:
            started_at = ACTIVE.get("started_at")
            scanner_state = {
                "active_user_id":    ACTIVE.get("user_id"),
                "active_user_email": ACTIVE.get("user_email"),
                "running_since_s":   int(_time.time() - started_at) if started_at else None,
                "queue_length":      len(QUEUE),
            }
    except Exception as e:
        scanner_state = {"error": str(e)}

    # ── Son başarılı tarama ───────────────────────────────────────────────────
    last_scan: dict = {}
    try:
        from app.core.task_history import get_last_success_time
        last_success = get_last_success_time("auto_scan")
        last_scan["last_success_at"] = last_success.isoformat() if last_success else None
        if last_success:
            ago_min = int((_time.time() - last_success.timestamp()) / 60)
            last_scan["minutes_ago"] = ago_min

        # En son tarama oturumundan sembol sayısı
        latest = db.execute(text(
            "SELECT COUNT(*) FROM scan_scores WHERE scanned_at > NOW() - INTERVAL '3 hours'"
        )).scalar()
        last_scan["symbols_last_3h"] = latest
    except Exception as e:
        last_scan = {"error": str(e)}

    return {
        "ts":             _time.time(),
        "analyze_cache":  cache_info,
        "db_locks":       db_locks,
        "scheduler":      scheduler_info,
        "scanner":        scanner_state,
        "last_scan":      last_scan,
    }
