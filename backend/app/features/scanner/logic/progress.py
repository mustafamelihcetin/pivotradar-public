# backend/app/features/scanner/logic/progress.py
import logging
import time
import json
import threading
from app.core import settings
from .state import PROGRESS_LOCK, LAST_WRITE_TIME, LAST_PERCENT

logger = logging.getLogger(__name__)

def _write_progress_to_disk(payload: str):
    with PROGRESS_LOCK:
        try:
            settings.PROGRESS_FILE.write_text(payload, encoding="utf-8")
        except Exception as e:
            logger.warning("Progress write error: %s", e)

def write_progress(state: str, percent: int = 0, stage: str = "",
                   message: str = "", queue_pos: int = 0, queue_total: int = 0):
    global LAST_WRITE_TIME, LAST_PERCENT
    now = time.time()
    is_terminal   = state in ("DONE", "ERROR", "IDLE")
    pct_changed   = abs(percent - LAST_PERCENT) >= 2
    time_passed   = (now - LAST_WRITE_TIME) > 0.5

    if is_terminal or pct_changed or time_passed or stage:
        try:
            payload = json.dumps({
                "state":       state,
                "percent":     percent,
                "stage":       stage,
                "message":     message,
                "queue_pos":   queue_pos,
                "queue_total": queue_total,
                "ts":          now,
            })
            threading.Thread(target=_write_progress_to_disk, args=(payload,), daemon=True).start()
            
            LAST_WRITE_TIME = now
            LAST_PERCENT    = percent
        except Exception as e:
            logger.warning("Progress preparation error: %s", e)

_PROGRESS_STALE_SEC = 600  # 10 dakika sonra eski SCANNING state IDLE'a döner

def read_progress_raw() -> dict:
    if not settings.PROGRESS_FILE.exists():
        return {"state": "IDLE", "percent": 0, "stage": "IDLE"}
    try:
        data = json.loads(settings.PROGRESS_FILE.read_text(encoding="utf-8"))
        # Stale SCANNING state'i temizle — process crash'den sonra kalıp kalabilir
        if data.get("state") in ("SCANNING", "PROCESSING"):
            age = time.time() - data.get("ts", 0)
            if age > _PROGRESS_STALE_SEC:
                logger.warning("Stale progress state cleared (age=%.0fs): %s", age, data.get("state"))
                return {"state": "IDLE", "percent": 0, "stage": "IDLE", "message": "Zaman aşımı temizlendi"}
        # Stale ERROR state — geçmiş crash'den kalan, temizle ve dosyaya da yaz
        if data.get("state") == "ERROR":
            try:
                settings.PROGRESS_FILE.write_text(
                    '{"state":"IDLE","percent":0,"stage":"IDLE"}', encoding="utf-8"
                )
            except Exception:
                pass
            return {"state": "IDLE", "percent": 0, "stage": "IDLE"}
        return data
    except Exception:
        try:
            settings.PROGRESS_FILE.write_text('{"state":"IDLE","percent":0,"stage":"IDLE"}', encoding="utf-8")
        except Exception:
            pass
        return {"state": "IDLE", "percent": 0, "stage": "IDLE"}
