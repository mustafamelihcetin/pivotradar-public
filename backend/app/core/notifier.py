# backend/app/core/notifier.py
"""
A-3: Merkezi bildirim motoru.

Öncelik sırası: Telegram → log.
Env vars:
  TELEGRAM_BOT_TOKEN — Bot token (@BotFather'dan alınır)
  TELEGRAM_CHAT_ID   — Mesajın gönderileceği chat/group ID
  NOTIFIER_ENABLED   — "0" ile tamamen kapat (test/dev ortamı)

Telegram yoksa hiçbir şey patlamaz; sadece WARNING log yazar.
"""
from __future__ import annotations

import logging
import os
from typing import Literal

logger = logging.getLogger("PivotRadar.Notifier")

Level = Literal["info", "warning", "critical"]

_ENABLED      = os.getenv("NOTIFIER_ENABLED", "1").strip() not in ("0", "false", "no")
_BOT_TOKEN    = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
_CHAT_ID      = os.getenv("TELEGRAM_CHAT_ID", "").strip()

_LEVEL_EMOJI = {
    "info":     "ℹ️",
    "warning":  "⚠️",
    "critical": "🚨",
}


def _send_telegram(text: str) -> bool:
    """Telegram Bot API üzerinden mesaj gönder. Başarıyı bool döndürür."""
    if not _BOT_TOKEN or not _CHAT_ID:
        return False
    try:
        import urllib.request
        import urllib.parse
        import json as _json

        url = f"https://api.telegram.org/bot{_BOT_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": _CHAT_ID,
            "text": text,
            "parse_mode": "HTML",
        }).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = _json.loads(resp.read())
            return bool(result.get("ok"))
    except Exception as _e:
        logger.warning("Telegram gönderimi başarısız: %s", _e)
        return False


def send_alert(title: str, message: str, level: Level = "warning") -> None:
    """
    Kullanım:
        from app.core.notifier import send_alert
        send_alert("Disk Kritik", "Disk dolmuş üzere.", level="critical")
    """
    if not _ENABLED:
        return

    emoji = _LEVEL_EMOJI.get(level, "ℹ️")
    full_text = f"{emoji} <b>{title}</b>\n{message}"

    # Telegram
    if _send_telegram(full_text):
        logger.info("Telegram alert gönderildi: %s", title)
        return

    # Fallback: log
    log_fn = logger.critical if level == "critical" else logger.warning
    log_fn("ALERT [%s]: %s — %s", level.upper(), title, message)
