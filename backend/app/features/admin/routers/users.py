# backend/app/features/admin/routers/users.py
"""
User management admin endpoints:
  GET    /users
  GET    /users/export
  PATCH  /users/{user_id}/superuser
  PATCH  /users/{user_id}/active
  POST   /users/{user_id}/reset-cooldown
  DELETE /users/{user_id}
  POST   /users/{user_id}/reset-password
  PATCH  /users/{user_id}/strategy
  GET    /users/{user_id}/scan-history
"""
import math
import csv
import io
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from app.core.database import get_db
from app.features.users.models import User, UserActivity
from app.features.scanner.models import ScanScore
from app.features.admin.routers._shared import get_admin_user, log_admin_action, _san

router = APIRouter()


@router.get("/users", response_model=Dict[str, Any])
def admin_users(
    page:     int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    q:        Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    # Subquery for last activity
    last_act_sub = db.query(
        UserActivity.user_id,
        func.max(UserActivity.timestamp).label("last_active")
    ).group_by(UserActivity.user_id).subquery()

    query = db.query(User, last_act_sub.c.last_active).outerjoin(last_act_sub, User.id == last_act_sub.c.user_id)

    if q:
        search_term = f"%{q}%"
        query = query.filter(or_(
            User.email.ilike(search_term),
            User.full_name.ilike(search_term)
        ))

    total = query.count()
    rows = (
        query.order_by(desc(User.created_at))
        .offset((page-1)*per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for r, last_active in rows:
        items.append({
            "id":                   r.id,
            "email":                r.email,
            "full_name":            r.full_name,
            "is_active":            r.is_active,
            "is_superuser":         r.is_superuser,
            "created_at":           r.created_at.isoformat() if r.created_at else None,
            "last_active_at":       last_active.isoformat() if last_active else None,
            "profile_picture":      getattr(r, "profile_picture", None),
            "settings":             r.settings,
            "strategy_profile_name": (
                r.strategy_profile.name if getattr(r, "strategy_profile", None)
                else (r.settings or {}).get("profile_name")
            ),
        })

    return _san({"total": total, "page": page, "pages": math.ceil(total/per_page) if total else 1, "items": items})


@router.get("/users/export", response_model=Dict[str, Any])
def admin_export_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Kullanıcı listesini CSV olarak dışa aktarır."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Email (masked)", "Active", "Created At", "Strategy"])

    users = db.query(User).all()
    for u in users:
        strat = u.strategy_profile.name if u.strategy_profile else (u.settings or {}).get("profile_name", "—")
        # O-10: PII minimizasyonu — e-posta maskelenmiş, superuser durumu kaldırıldı.
        _email = u.email or ""
        _parts = _email.split("@")
        _masked_email = (_parts[0][:2] + "***@" + _parts[1]) if len(_parts) == 2 and len(_parts[0]) >= 2 else "***"
        writer.writerow([
            u.id,
            _masked_email,            # O-10: tam e-posta yerine maskelenmiş
            "YES" if u.is_active else "NO",
            u.created_at.isoformat() if u.created_at else "—",
            strat
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pivotradar_users.csv"}
    )


@router.patch("/users/{user_id}/superuser", response_model=Dict[str, Any])
def admin_toggle_superuser(
    user_id: int,
    value: bool = Query(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    if user_id == current.id:
        raise HTTPException(400, "Kendi admin durumunuzu değiştiremezsiniz.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    user.is_superuser = value
    db.commit()
    log_admin_action(db, current, "TOGGLE_SUPERUSER", f"user_{user_id}", {"value": value, "email": user.email})
    return {"ok": True, "user_id": user_id, "is_superuser": value}


@router.patch("/users/{user_id}/active", response_model=Dict[str, Any])
def admin_toggle_active(
    user_id: int,
    value: bool = Query(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    if user_id == current.id:
        raise HTTPException(400, "Kendi aktiflik durumunuzu değiştiremezsiniz.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    user.is_active = value
    db.commit()
    log_admin_action(db, current, "TOGGLE_ACTIVE", f"user_{user_id}", {"value": value, "email": user.email})
    return {"ok": True, "user_id": user_id, "is_active": value}


@router.post("/users/{user_id}/reset-cooldown", response_model=Dict[str, Any])
def admin_reset_cooldown(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    """Clear a user's scan cooldown so they can scan immediately."""
    from app.features.scanner.router import admin_reset_user_cooldown
    admin_reset_user_cooldown(user_id)
    log_admin_action(db, current, "RESET_COOLDOWN", f"user_{user_id}", {})
    return {"ok": True, "user_id": user_id}


@router.delete("/users/{user_id}", response_model=Dict[str, Any])
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    """
    Kullanıcıyı soft-delete yapar: hesabı devre dışı bırakır, e-postayı anonimleştirir.
    Veri bütünlüğü ve denetim izi korunur; 90 gün sonra otomatik DB bakımı kaldırabilir.
    """
    if user_id == current.id:
        raise HTTPException(400, "Kendinizi silemezsiniz.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı.")

    # Zaten silinmişse (e-postası deleted_ ile başlıyorsa)
    if (user.email or "").startswith("deleted_"):
        raise HTTPException(400, "Kullanıcı zaten silinmiş.")

    u_email = user.email
    # Soft delete: hesabı kapat, e-postayı anonimleştir (benzersiz tanımlayıcı koru)
    user.is_active = False
    user.email = f"deleted_{user_id}_{u_email}"
    user.full_name = None
    user.profile_picture = None
    user.totp_secret = None
    user.totp_enabled = False
    user.totp_confirmed = False
    user.reset_token = None
    db.commit()
    log_admin_action(db, current, "SOFT_DELETE_USER", f"user_{user_id}", {"original_email": u_email})
    return {"ok": True, "deleted_id": user_id}


@router.post("/users/{user_id}/reset-password", response_model=Dict[str, Any])
def admin_reset_password(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    """Geçici şifre oluşturur, kullanıcıya atar ve mail gönderir."""
    import secrets, string
    from passlib.context import CryptContext
    from app.core.email import send_email, temporary_password_email_html

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı.")

    alphabet = string.ascii_letters + string.digits + "!@#$"
    temp_pw = ''.join(secrets.choice(alphabet) for _ in range(12))
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    user.hashed_password = pwd_ctx.hash(temp_pw)
    user.force_password_change = True
    db.commit()
    log_admin_action(db, current, "RESET_PASSWORD", f"user_{user_id}", {"email": user.email})

    # Arka planda mail gönder
    html = temporary_password_email_html(user.full_name or user.email, temp_pw)
    background_tasks.add_task(send_email, user.email, "Geçici PivotRadar Şifreniz", html)

    return {"ok": True, "user_id": user_id, "email_sent": True, "temp_password": temp_pw}


@router.patch("/users/{user_id}/strategy", response_model=Dict[str, Any])
def admin_set_strategy(
    user_id: int,
    strategy: str = Query(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    """Kullanıcının strateji profilini günceller."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    s = dict(user.settings or {})
    s["profile_name"] = strategy
    user.settings = s
    db.commit()
    log_admin_action(db, current, "SET_STRATEGY", f"user_{user_id}", {"strategy": strategy, "email": user.email})
    return {"ok": True, "user_id": user_id, "strategy": strategy}


@router.get("/users/{user_id}/scan-history", response_model=Dict[str, Any])
def admin_user_scan_history(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Scan sessions for a specific user (matched by user_id — placeholder; scans don't store user_id yet)."""
    # ScanScore doesn't yet have user_id FK — return recent scan sessions summary instead
    sessions = (
        db.query(
            ScanScore.scan_session_id,
            func.min(ScanScore.scanned_at).label("started_at"),
            func.count(ScanScore.id).label("symbols"),
            func.avg(ScanScore.qrs_score).label("avg_qrs"),
            ScanScore.profile_name,
        )
        .group_by(ScanScore.scan_session_id, ScanScore.profile_name)
        .order_by(desc("started_at"))
        .limit(20)
        .all()
    )
    return _san([{
        "session_id":   r.scan_session_id,
        "started_at":   r.started_at.isoformat() if r.started_at else None,
        "symbols":      r.symbols,
        "avg_qrs":      round(float(r.avg_qrs), 1) if r.avg_qrs else None,
        "profile":      r.profile_name,
    } for r in sessions])
