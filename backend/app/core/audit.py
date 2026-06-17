# backend/app/core/audit.py
"""
Audit log — kullanıcı hareketlerini audit_logs tablosuna yazar.

Desteklenen action'lar: LOGIN, LOGOUT, REGISTER, SCAN, SETTINGS_CHANGE,
                        PASSWORD_CHANGE, API_KEY_CREATE, API_KEY_DELETE
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger("PivotRadar.Audit")


def log_action(
    db: Session,
    action: str,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    try:
        db.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, ip_address, user_agent, detail)
                VALUES (:uid, :action, :ip, :ua, CAST(:detail AS jsonb))
            """),
            {
                "uid":    user_id,
                "action": action[:50],
                "ip":     (ip_address or "")[:45],
                "ua":     (user_agent or "")[:500],
                "detail": __import__("json").dumps(detail) if detail else None,
            },
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Audit log yazılamadı (%s): %s", action, e)
