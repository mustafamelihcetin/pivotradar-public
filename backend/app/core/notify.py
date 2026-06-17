# backend/app/core/notify.py
"""
Admin bildirim sistemi.

notify_admin() — rate-limited SMTP e-posta gönderir.
  • Aynı alert_key için minimum 60 dakikada bir e-posta gönderilir.
  • SMTP yapılandırması .env'den okunur (SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD).
  • Hata durumunda sessizce loglar; asla exception fırlatmaz (non-blocking).
"""
import logging
import smtplib
import threading
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger("PivotRadar.Notify")

# ── Rate-limit state ──────────────────────────────────────────────────────────
_last_sent: dict[str, datetime.datetime] = {}
_lock = threading.Lock()
_COOLDOWN_MINUTES = 60  # Aynı alert için minimum bekleme süresi


def _is_rate_limited(alert_key: str) -> bool:
    with _lock:
        last = _last_sent.get(alert_key)
        if last is None:
            return False
        return (datetime.datetime.utcnow() - last).total_seconds() < _COOLDOWN_MINUTES * 60


def _mark_sent(alert_key: str) -> None:
    with _lock:
        _last_sent[alert_key] = datetime.datetime.utcnow()


# ── SMTP gönderim ─────────────────────────────────────────────────────────────

def _send_email(to: str, subject: str, body: str) -> bool:
    try:
        from app.core import settings

        host     = getattr(settings, "SMTP_HOST",     None) or ""
        port     = int(getattr(settings, "SMTP_PORT",     587))
        username = getattr(settings, "SMTP_USERNAME",  None) or ""
        password = getattr(settings, "SMTP_PASSWORD",  None) or ""
        from_    = getattr(settings, "SMTP_FROM",      None) or username

        if not host or not username or not password:
            logger.debug("[Notify] SMTP yapılandırması eksik — e-posta atlandı.")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = from_
        msg["To"]      = to
        msg.attach(MIMEText(body, "plain", "utf-8"))

        with smtplib.SMTP(host, port, timeout=10) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(username, password)
            srv.sendmail(from_, [to], msg.as_string())

        logger.info("[Notify] E-posta gönderildi: %s → %s", subject, to)
        return True

    except Exception as e:
        logger.warning("[Notify] E-posta gönderilemedi: %s", e)
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def notify_admin(
    subject: str,
    body: str,
    alert_key: str = "general",
    to: Optional[str] = None,
) -> bool:
    """
    Admin'e rate-limited e-posta gönderir.

    alert_key  — aynı anahtar için 60 dakikada en fazla 1 e-posta
    to         — None ise settings'den ADMIN_EMAIL okunur; yoksa SMTP_USERNAME kullanılır
    Dönüş      — True: gönderildi | False: rate-limit veya hata
    """
    if _is_rate_limited(alert_key):
        logger.debug("[Notify] Rate-limit aktif, atlandı: %s", alert_key)
        return False

    if to is None:
        try:
            from app.core import settings
            to = (
                getattr(settings, "ADMIN_EMAIL", None)
                or getattr(settings, "SMTP_MELIH_USERNAME", None)
                or getattr(settings, "SMTP_USERNAME", None)
                or ""
            )
        except Exception:
            to = ""

    if not to:
        logger.debug("[Notify] Hedef e-posta adresi bulunamadı.")
        return False

    sent = _send_email(to=to, subject=subject, body=body)
    if sent:
        _mark_sent(alert_key)
    return sent


def notify_startup_degraded(report: dict) -> None:
    """Startup sırasında sistem degraded ise admin'i bildir."""
    issues = []
    for k, v in report.items():
        if k in ("timestamp", "elapsed_ms", "overall", "scanner_reset",
                  "rate_limit_cleanup", "token_cleanup"):
            continue
        s = v.get("status", v) if isinstance(v, dict) else str(v)
        if str(s).startswith(("critical", "error", "missing")):
            issues.append(f"• {k}: {s}")

    if not issues:
        return

    notify_admin(
        subject="[PivotRadar] 🚨 Startup Uyarısı — Sistem Degraded",
        body=(
            f"Sistem başlangıcında ({report.get('timestamp', '')}) sorunlar tespit edildi:\n\n"
            + "\n".join(issues)
            + "\n\nSunucu: 46.62.141.179\nDetay: https://pivot-radar.com/api/health"
        ),
        alert_key="startup_degraded",
    )
