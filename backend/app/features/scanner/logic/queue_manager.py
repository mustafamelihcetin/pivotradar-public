# backend/app/features/scanner/logic/queue_manager.py
import time
import json
import threading
from typing import Dict, Any
from app.core import settings
from .state import STATE_LOCK, QUEUE, ACTIVE, MAX_QUEUE_DEPTH

# Tek yetkili SCAN_THREAD referansı — state.py'daki kopya hiç güncellenmiyordu
SCAN_THREAD = None
from .progress import write_progress

USER_LAST_SCAN: Dict[int, float] = {}
COOLDOWN_FILE = settings.RUNTIME_DIR / "user_cooldowns.json"

def load_cooldowns():
    try:
        if COOLDOWN_FILE.exists():
            raw = COOLDOWN_FILE.read_text(encoding="utf-8")
            data = json.loads(raw)
            USER_LAST_SCAN.update({int(k): float(v) for k, v in data.items()})
    except (json.JSONDecodeError, ValueError):
        # Corrupt file — reset instead of crashing
        import logging as _l
        _l.getLogger(__name__).warning("Cooldown file corrupt, resetting: %s", COOLDOWN_FILE)
        try:
            COOLDOWN_FILE.unlink(missing_ok=True)
        except Exception:
            pass
    except Exception:
        pass

def save_cooldowns():
    try:
        COOLDOWN_FILE.write_text(json.dumps({str(k): v for k, v in USER_LAST_SCAN.items()}), encoding="utf-8")
    except Exception: pass

load_cooldowns()

def push_to_scan_queue(user_id: int, user_email: str, payload_dict: dict, max_queue: int = 5, cooldown: int = 5):
    global SCAN_THREAD
    now = time.time()
    
    with STATE_LOCK:
        # 1. Cooldown check
        last_time = USER_LAST_SCAN.get(user_id, 0)
        if (now - last_time) < cooldown:
            wait_sec = int(cooldown - (now - last_time))
            return {"ok": False, "detail": f"Çok sık tarama yapıyorsunuz. Lütfen {wait_sec} sn bekleyin."}

        # 2. Duplicate check
        if any(q["user_id"] == user_id for q in QUEUE) or ACTIVE["user_id"] == user_id:
            return {"ok": False, "detail": "Zaten bir tarama isteğiniz sırada veya çalışıyor."}

        # 3. Capacity check
        if len(QUEUE) >= max_queue:
            return {"ok": False, "detail": "Sistem yoğun, lütfen daha sonra tekrar deneyin."}

        # 4. Add to queue
        task = {
            "user_id": user_id,
            "user_email": user_email,
            "payload": payload_dict,
            "queued_at": now
        }
        QUEUE.append(task)
        USER_LAST_SCAN[user_id] = now
        save_cooldowns()

        # 5. Ensure worker is running — thread oluştur, START lock dışında yap
        _need_start = False
        from .worker import scan_worker
        if ACTIVE["user_id"] is None:
            if SCAN_THREAD is None or not SCAN_THREAD.is_alive():
                SCAN_THREAD = threading.Thread(target=scan_worker, daemon=True, name="scan-worker")
                _need_start = True

        result = {"ok": True, "pos": len(QUEUE), "total": len(QUEUE)}

    # STATE_LOCK serbest bırakıldıktan sonra thread başlat — deadlock önlemi
    if _need_start:
        SCAN_THREAD.start()

    return result
