from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from . import models, schemas
from app.core import email as email_util
from app.features.users.router import get_current_user
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

SUPPORT_EMAIL = "destek@pivotradar.net"

router = APIRouter(prefix="/support", tags=["Support"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/contact", response_model=schemas.SupportMessageResponse)
def submit_contact_form(
    msg: schemas.SupportMessageCreate,
    db: Session = Depends(get_db)
):
    try:
        new_msg = models.SupportMessage(
            name=msg.name,
            email=msg.email,
            subject=msg.subject,
            message=msg.message,
            source=msg.source or "contact"
        )
        db.add(new_msg)
        db.commit()
        db.refresh(new_msg)

        html = email_util.support_email_html(
            name=msg.name,
            email=msg.email,
            subject_form=msg.subject,
            message=msg.message
        )
        email_util.send_email(
            to=SUPPORT_EMAIL,
            subject=f"PivotRadar Destek: {msg.subject}",
            html=html,
            reply_to=msg.email
        )
        return {"success": True, "message": "Mesajınız başarıyla iletildi. En kısa sürede geri dönüş yapacağız."}
    except Exception as e:
        logger.error(f"Contact form error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Mesaj gönderilemedi.")


def _ensure_support_table():
    """Tablo yoksa oluştur — ilk çalışmada veya migration başarısız olunca güvence."""
    try:
        from app.core.database import Base, engine
        Base.metadata.create_all(engine, tables=[models.SupportMessage.__table__], checkfirst=True)
    except Exception as e:
        logger.warning(f"Support table ensure: {e}")


@router.post("/report", response_model=schemas.SupportMessageResponse)
def submit_app_report(
    payload: schemas.UserReportCreate,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Kullanıcıların uygulama içi 'Sorun Bildir' formu."""
    _ensure_support_table()
    try:
        new_msg = models.SupportMessage(
            name=getattr(current_user, "full_name", None) or current_user.email,
            email=current_user.email,
            subject=payload.subject,
            message=payload.message,
            source="app_report",
            user_id=current_user.id
        )
        db.add(new_msg)
        db.commit()
        logger.info(f"App report from user {current_user.email}: {payload.subject}")
        return {"success": True, "message": "Raporunuz alındı, teşekkür ederiz."}
    except Exception as e:
        logger.error(f"App report error [{type(e).__name__}]: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Rapor gönderilemedi: {type(e).__name__}")


@router.get("/messages")
def get_messages(
    source: Optional[str] = None,
    unread_only: bool = False,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin: tüm destek mesajlarını listele."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Yalnızca adminler erişebilir.")
    q = db.query(models.SupportMessage)
    if source:
        q = q.filter(models.SupportMessage.source == source)
    if unread_only:
        q = q.filter(models.SupportMessage.is_read == False)
    msgs = q.order_by(models.SupportMessage.created_at.desc()).all()
    return msgs


@router.post("/messages/{msg_id}/read")
def mark_as_read(
    msg_id: int,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin: mesajı okundu olarak işaretle."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    msg = db.query(models.SupportMessage).filter(models.SupportMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404)
    msg.is_read = True
    db.commit()
    return {"ok": True}
