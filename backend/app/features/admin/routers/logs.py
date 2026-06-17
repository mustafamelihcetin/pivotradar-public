# backend/app/features/admin/routers/logs.py
"""
Logging and audit admin endpoints:
  GET  /anomaly/alerts
  POST /anomaly/run
  GET  /logs
  GET  /audit-logs
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.users.models import User
from app.features.admin.models import SystemSettings, AdminAuditLog
from app.features.admin.routers._shared import get_admin_user, _LOG_BUFFER

router = APIRouter()


@router.get("/anomaly/alerts", response_model=Dict[str, Any])
def admin_anomaly_alerts(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Son anomali kontrolünün sonucunu döndürür."""
    row = db.query(SystemSettings).filter(SystemSettings.key == "anomaly_alerts").first()
    if not row:
        return {"status": "no_data", "message": "Henüz anomali kontrolü çalışmadı veya her şey yolunda."}
    return {"status": "ok", "data": row.value}


@router.post("/anomaly/run", response_model=Dict[str, Any])
def admin_run_anomaly_check(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
):
    """Anomali kontrolünü manuel tetikler."""
    from app.features.admin.tasks import run_anomaly_check
    background_tasks.add_task(run_anomaly_check)
    return {"status": "triggered"}


@router.get("/logs", response_model=Dict[str, Any])
def admin_get_logs(
    level:  Optional[str] = Query(None),
    q:      Optional[str] = Query(None, description="Log mesajlarında metin arama"),
    limit:  int           = Query(200, ge=10, le=500),
    _: User = Depends(get_admin_user),
):
    """Return captured log entries (newest first) with optional search."""
    logs = list(reversed(list(_LOG_BUFFER)[-limit:]))
    if level:
        logs = [l for l in logs if l["level"] == level.upper()]
    if q:
        q_low = q.lower()
        logs = [l for l in logs if q_low in l["msg"].lower() or q_low in l["name"].lower()]
    return {"total": len(_LOG_BUFFER), "items": logs}


@router.get("/audit-logs")
def admin_get_audit_logs(
    limit: int = Query(50, ge=10, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Sistemdeki tüm idari işlemlerin dökümünü döner."""
    logs = (
        db.query(AdminAuditLog, User.email)
        .join(User, AdminAuditLog.admin_id == User.id)
        .order_by(AdminAuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [{
        "id":        l.AdminAuditLog.id,
        "admin":     l.email,
        "action":    l.AdminAuditLog.action,
        "target":    l.AdminAuditLog.target,
        "details":   l.AdminAuditLog.details,
        "timestamp": l.AdminAuditLog.timestamp.isoformat(),
    } for l in logs]
