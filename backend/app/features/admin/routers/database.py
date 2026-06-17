# backend/app/features/admin/routers/database.py
"""
Database management admin endpoints:
  GET  /db/stats
  POST /db/prune
  GET  /db/tables
  GET  /db/table/{table_name}
  POST /db/vacuum
  POST /db/reindex
  POST /db/backup
  GET  /db/backups
  GET  /symbol/{symbol}/history
"""
import math
import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.features.users.models import User
from app.features.scanner.models import ScanScore
from app.features.admin.backup import create_json_backup, list_backups
from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
from app.core.time_utils import now_utc
from app.features.admin.routers._shared import get_admin_user, log_admin_action, _san, DB_MAINTENANCE_LOCK

router = APIRouter()


_ALLOWED_TABLES = frozenset({
    # K-3: "users" kaldırıldı — admin dump endpoint'i şifre hash, TOTP secret, reset token içeriyor.
    # Kullanıcı verisi için /admin/users endpoint'ini kullanın.
    "scan_scores", "strategy_profiles", "subscriptions",
    "user_activities", "user_portfolios", "system_settings",
    "admin_audit_logs", "symbol_data_cache", "rate_limit_records",
    "token_blacklist",
})


@router.get("/db/stats", response_model=Dict[str, Any])
def admin_db_stats(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    """Database growth metrics and table sizes."""
    from app.features.scanner.models import SystemTaskLog
    from sqlalchemy import text

    total_scores    = db.query(func.count(ScanScore.id)).scalar() or 0
    evaluated       = db.query(func.count(ScanScore.id)).filter(ScanScore.evaluated_at.isnot(None)).scalar() or 0
    unevaluated     = total_scores - evaluated
    neutral         = db.query(func.count(ScanScore.id)).filter(ScanScore.target_direction == "neutral").scalar() or 0
    # Gerçekten "eskimiş" sayısı: 180+ gün önce tarihlenmiş, hâlâ değerlendirilmemiş kayıtlar
    stale_cutoff    = now_utc().replace(tzinfo=None) - datetime.timedelta(days=180)
    stale_count     = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.is_(None),
        ScanScore.scanned_at < stale_cutoff,
    ).scalar() or 0
    task_logs       = db.query(func.count(SystemTaskLog.id)).scalar() or 0

    # Oldest / newest records
    oldest = db.query(func.min(ScanScore.scanned_at)).scalar()
    newest = db.query(func.max(ScanScore.scanned_at)).scalar()

    # Estimate table size in PostgreSQL
    table_size_bytes = None
    try:
        result = db.execute(text("SELECT pg_total_relation_size('scan_scores')")).fetchone()
        if result:
            table_size_bytes = int(result[0])
    except Exception:
        pass

    # Growth estimate: rows per day over last 7 days
    week_ago = now_utc().replace(tzinfo=None) - datetime.timedelta(days=7)
    recent_count = db.query(func.count(ScanScore.id)).filter(ScanScore.scanned_at >= week_ago).scalar() or 0
    rows_per_day = round(recent_count / 7, 1)

    return _san({
        "rows": {
            "total":       total_scores,
            "evaluated":   evaluated,
            "unevaluated": unevaluated,
            "stale":       stale_count,
            "neutral":     neutral,
            "task_logs":   task_logs,
        },
        "timeline": {
            "oldest": oldest.isoformat() if oldest else None,
            "newest": newest.isoformat() if newest else None,
            "days_span": (newest - oldest).days if oldest and newest else 0,
        },
        "size": {
            "table_bytes":   table_size_bytes,
            "table_mb":      round(table_size_bytes / 1024 / 1024, 2) if table_size_bytes else None,
        },
        "growth": {
            "rows_per_day_7d": rows_per_day,
            "est_monthly":     round(rows_per_day * 30),
            "est_yearly":      round(rows_per_day * 365),
        }
    })


@router.post("/db/prune", response_model=Dict[str, Any])
def admin_db_prune(
    mode: str = Query("neutral"),
    older_than_days: int = Query(90, ge=7, le=3650),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Safe DB cleanup without touching ML training data.

    mode=neutral   → delete neutral-direction records older than N days (no calibration value)
    mode=evaluated → delete evaluated records beyond retention window (keeps ML-useful data)
    mode=stale     → delete duplicate same-date records keeping only the latest per (symbol, date)
    """
    _VALID_MODES = {"neutral", "evaluated", "stale"}
    if mode not in _VALID_MODES:
        from fastapi import HTTPException
        raise HTTPException(400, f"Geçersiz mode '{mode}'. Kabul edilen: {', '.join(sorted(_VALID_MODES))}")

    cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=older_than_days)
    deleted = 0

    if mode == "neutral":
        # Neutral predictions have no target_price and will never be calibrated
        deleted = db.query(ScanScore).filter(
            ScanScore.target_direction == "neutral",
            ScanScore.scanned_at < cutoff,
        ).delete(synchronize_session=False)

    elif mode == "evaluated":
        # Remove old evaluated records beyond retention window (keeps raw un-evaluated for future calibration)
        deleted = db.query(ScanScore).filter(
            ScanScore.evaluated_at.isnot(None),
            ScanScore.evaluated_at < cutoff,
        ).delete(synchronize_session=False)

    elif mode == "stale":
        # Delete unevaluated records older than N days (likely will never mature)
        deleted = db.query(ScanScore).filter(
            ScanScore.evaluated_at.is_(None),
            ScanScore.scanned_at < cutoff,
        ).delete(synchronize_session=False)

    db.commit()
    return {"ok": True, "mode": mode, "older_than_days": older_than_days, "deleted": deleted}


@router.get("/db/tables")
def admin_db_tables(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    """List all PostgreSQL user tables with row counts and sizes."""
    from sqlalchemy import text
    try:
        rows = db.execute(text("""
            SELECT
                relname                                                              AS name,
                n_live_tup                                                           AS live_rows,
                n_dead_tup                                                           AS dead_rows,
                pg_total_relation_size(schemaname || '.' || relname)                AS total_bytes,
                pg_relation_size(schemaname || '.' || relname)                      AS table_bytes,
                pg_indexes_size(schemaname || '.' || relname)                       AS index_bytes,
                to_char(last_analyze,    'YYYY-MM-DD HH24:MI')                      AS last_analyze,
                to_char(last_autovacuum, 'YYYY-MM-DD HH24:MI')                      AS last_vacuum
            FROM pg_stat_user_tables
            ORDER BY total_bytes DESC NULLS LAST
        """)).fetchall()
        return _san([{
            "name":         r[0],
            "live_rows":    int(r[1] or 0),
            "dead_rows":    int(r[2] or 0),
            "total_bytes":  int(r[3] or 0),
            "table_bytes":  int(r[4] or 0),
            "index_bytes":  int(r[5] or 0),
            "total_mb":     round(int(r[3] or 0) / 1024 / 1024, 3),
            "last_analyze": r[6],
            "last_vacuum":  r[7],
        } for r in rows])
    except Exception as e:
        raise HTTPException(500, f"Tablo listesi alınamadı: {e}")


@router.get("/db/table/{table_name}", response_model=Dict[str, Any])
def admin_get_table_data(
    table_name: str,
    page:      int = Query(1, ge=1),
    per_page:  int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Fetch raw rows from a specific table with pagination (Admin only)."""
    from sqlalchemy import text
    if table_name not in _ALLOWED_TABLES:
        raise HTTPException(400, f"Geçersiz tablo adı: {table_name}")
    try:
        # 1. Get total count
        count_res = db.execute(text(f'SELECT count(*) FROM "{table_name}"')).fetchone()
        total = count_res[0] if count_res else 0

        # 2. Get rows — table name validated against whitelist above
        offset = (page - 1) * per_page
        rows_res = db.execute(text(f'SELECT * FROM "{table_name}" LIMIT :lim OFFSET :off'), {"lim": per_page, "off": offset})

        # Convert to list of dicts
        columns = rows_res.keys()
        items = []
        for r in rows_res:
            d = {}
            for i, col in enumerate(columns):
                val = r[i]
                if isinstance(val, (datetime.datetime, datetime.date)):
                    val = val.isoformat()
                elif isinstance(val, float):
                    val = _san(val)
                d[col] = val
            items.append(d)

        return {
            "table":    table_name,
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    math.ceil(total / per_page) if total > 0 else 1,
            "items":    items,
            "columns":  list(columns)
        }
    except Exception as e:
        raise HTTPException(500, f"Tablo verisi alınamadı ({table_name}): {e}")


@router.post("/db/vacuum", summary="DB Vakumlama", description="PostgreSQL VACUUM komutunu çalıştırarak ölü satırları temizler ve disk alanını optimize eder.", response_model=Dict[str, Any])
def admin_db_vacuum(
    table: str = Query("scan_scores"),
    full: bool = Query(False),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """PostgreSQL VACUUM komutunu çalıştırır. Eş zamanlı maintenance işlemi varsa 409 döner."""
    if table not in _ALLOWED_TABLES:
        raise HTTPException(400, f"Geçersiz tablo adı: {table}")
    if not DB_MAINTENANCE_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Başka bir bakım işlemi (vacuum/reindex) devam ediyor. Lütfen bekleyin.")
    try:
        cmd = f"VACUUM {'FULL' if full else ''} ANALYZE \"{table}\""
        connection = db.get_bind().raw_connection()
        connection.set_isolation_level(0)  # AUTOCOMMIT — VACUUM transaction içinde çalışamaz
        cursor = connection.cursor()
        cursor.execute(cmd)
        cursor.close()
        connection.close()
        log_admin_action(db, admin, "DB_VACUUM", table, {"full": full})
        return {"ok": True, "message": f"{table} vakumlandı.", "full": full}
    except Exception as e:
        raise HTTPException(500, f"Vakum hatası: {e}")
    finally:
        DB_MAINTENANCE_LOCK.release()


@router.post("/db/reindex", summary="DB Index Yenileme", description="PostgreSQL REINDEX komutunu çalıştırarak bozulmuş veya şişmiş indexleri yeniden oluşturur.", response_model=Dict[str, Any])
def admin_db_reindex(
    table: str = Query("scan_scores"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """PostgreSQL REINDEX komutunu çalıştırır. Eş zamanlı maintenance işlemi varsa 409 döner."""
    if table not in _ALLOWED_TABLES:
        raise HTTPException(400, f"Geçersiz tablo adı: {table}")
    if not DB_MAINTENANCE_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Başka bir bakım işlemi (vacuum/reindex) devam ediyor. Lütfen bekleyin.")
    try:
        connection = db.get_bind().raw_connection()
        connection.set_isolation_level(0)
        cursor = connection.cursor()
        cursor.execute(f"REINDEX TABLE \"{table}\"")
        cursor.close()
        connection.close()
        log_admin_action(db, admin, "DB_REINDEX", table)
        return {"ok": True, "message": f"{table} indexleri yenilendi."}
    except Exception as e:
        raise HTTPException(500, f"Reindex hatası: {e}")
    finally:
        DB_MAINTENANCE_LOCK.release()


@router.post("/db/backup", summary="Yedekleme Oluştur", description="Tüm kritik tabloları JSON formatında dışa aktararak db_backups dizinine kaydeder.", response_model=Dict[str, Any])
def admin_db_backup(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Sistemin tam JSON yedeğini oluşturur."""
    try:
        filename = create_json_backup(db)
        from app.features.admin.utils import log_admin_action as _log
        _log(db, admin, "DB_BACKUP", filename)
        return {"ok": True, "filename": filename}
    except Exception as e:
        raise HTTPException(500, f"Yedekleme hatası: {e}")


@router.get("/db/backups", summary="Yedekleri Listele", description="Mevcut JSON yedek dosyalarının listesini, boyutlarını ve tarihlerini döner.")
def admin_db_list_backups(_: User = Depends(get_admin_user)):
    """Mevcut yedek dosyalarını listeler."""
    return {"backups": list_backups()}


@router.get("/db/backup/download", summary="Yedek İndir")
def admin_db_backup_download(
    filename: str = Query(...),
    _: User = Depends(get_admin_user),
):
    """Belirtilen yedek dosyasını indirir."""
    from pathlib import Path
    from fastapi.responses import FileResponse
    from app.features.admin.backup import BACKUP_DIR
    import re
    # Path traversal koruması — yalnızca BACKUP_DIR içindeki dosyalara izin ver
    if not re.match(r'^[\w\-\.]+$', filename) or '..' in filename:
        raise HTTPException(400, "Geçersiz dosya adı.")
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(404, "Yedek dosyası bulunamadı.")
    media = "application/octet-stream"
    if filename.endswith(".json"):
        media = "application/json"
    return FileResponse(str(filepath), media_type=media, filename=filename)


@router.get("/symbol/{symbol}/history", response_model=Dict[str, Any])
def admin_symbol_history(
    symbol: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """QRS score history for a specific symbol — for trend/drift analysis."""
    rows = (
        db.query(ScanScore)
        .filter(ScanScore.symbol == symbol.upper())
        .order_by(ScanScore.scan_date)
        .limit(500)
        .all()
    )
    return _san([{
        "scan_date":      r.scan_date.isoformat(),
        "qrs_score":      r.qrs_score,
        "ml_score":       r.ml_score,
        "close_price":    r.close_price,
        "target_hit":     r.target_hit,
        "actual_return":  r.actual_return_pct,
    } for r in rows])
