import json
import time
import asyncio
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Any, Optional
from app.features.users.router import get_current_user, get_current_user_optional
from ..logic.progress import read_progress_raw
from ..logic.state import STATE_LOCK, QUEUE, ACTIVE

router = APIRouter()

SCAN_TIMEOUT_SEC = 600

@router.get("/progress")
def api_progress(current_user: Optional[Any] = Depends(get_current_user_optional)):
    data = read_progress_raw()
    # Savunma katmanı: ERROR state hiçbir zaman frontend'e ulaşmamalı
    if data.get("state") == "ERROR":
        data = {"state": "IDLE", "percent": 0, "stage": "IDLE"}
    if data.get("state") == "SCANNING":
        elapsed = time.time() - data.get("ts", 0)
        if elapsed > 600:
            from ..logic.progress import write_progress
            write_progress("IDLE", 0, "IDLE", "Tarama zaman aşımına uğradı.")
            return {"state": "IDLE", "percent": 0}
    
    with STATE_LOCK:
        if current_user and ACTIVE["user_id"] == current_user.id:
            data["is_mine"] = True
        elif current_user:
            pos = next((i + 1 for i, q in enumerate(QUEUE) if q["user_id"] == current_user.id), None)
            if pos:
                data["state"] = "QUEUED"
                data["queue_pos"] = pos
                data["queue_total"] = len(QUEUE)
                data["is_mine"] = True
    return data

_STREAM_MAX_SEC = 300  # 5 dakika — browser yeniden bağlanır

@router.get("/progress/stream")
async def api_progress_stream(current_user: Optional[Any] = Depends(get_current_user_optional)):
    async def event_generator():
        loop = asyncio.get_event_loop()
        start_time = loop.time()
        last_heartbeat = start_time
        while True:
            now = loop.time()
            if now - start_time > _STREAM_MAX_SEC:
                yield "data: {\"state\":\"STREAM_TIMEOUT\"}\n\n"
                break

            data = read_progress_raw()
            if data.get("state") == "ERROR":
                data = {"state": "IDLE", "percent": 0, "stage": "IDLE"}
            with STATE_LOCK:
                if current_user and ACTIVE["user_id"] == current_user.id:
                    data["is_mine"] = True
                elif current_user:
                    pos = next((i + 1 for i, q in enumerate(QUEUE) if q["user_id"] == current_user.id), None)
                    if pos:
                        data["state"] = "QUEUED"
                        data["queue_pos"] = pos
                        data["queue_total"] = len(QUEUE)
                        data["is_mine"] = True

            yield f"data: {json.dumps(data)}\n\n"

            if now - last_heartbeat > 15:
                yield ": heartbeat\n\n"
                last_heartbeat = now

            await asyncio.sleep(1.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/scan/status")
def api_scan_status():
    with STATE_LOCK:
        is_running = ACTIVE["user_id"] is not None
        return {
            "is_running": is_running,
            "queue_depth": len(QUEUE),
            "active_user": ACTIVE["user_email"] if is_running else None
        }


_ALERT_NOISE = (
    "sqlalchemy", "alembic", "uvicorn", "fastapi",
    "apscheduler", "asyncio", "starlette", "httpx",
    # Altyapı/veri kaynağı — kullanıcıya teknik gürültü gösterme
    "PivotRadar.CircuitBreaker", "yfinance", "urllib3",
    # Veri kaynağı geçici hataları (BigPara/YF/GlobalSignals) — normal operasyonel durum, kullanıcıya gösterilmez
    "app.features.market_data",
    "PivotRadar.GlobalSignals",
)

@router.get("/status/alerts")
def api_status_alerts(
    since: float = Query(0.0, description="Unix timestamp — yalnızca bu süreden yeni girişler"),
):
    """Son ERROR/WARNING log girişlerini döner. Regular-user erişilebilir."""
    try:
        from app.features.admin.routers._shared import _LOG_BUFFER
        items = [
            e for e in _LOG_BUFFER
            if e["level"] in ("ERROR", "WARNING")
            and e["ts"] > since
            and not any(e["name"].startswith(n) for n in _ALERT_NOISE)
        ]
        items_sorted = sorted(items, key=lambda x: x["ts"], reverse=True)[:25]
        return {
            "items": [
                {"ts": e["ts"], "level": e["level"], "msg": e.get("raw", "")[:150]}
                for e in items_sorted
            ]
        }
    except Exception:
        return {"items": []}
