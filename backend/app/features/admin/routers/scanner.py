# backend/app/features/admin/routers/scanner.py
"""
Scanner control admin endpoints:
  POST   /scan/kill
  DELETE /queue/{user_id}
  POST   /trigger/scan
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.users.models import User
from app.features.admin.routers._shared import get_admin_user

router = APIRouter()


@router.post("/scan/kill", response_model=Dict[str, Any])
def admin_kill_scan(
    _: User = Depends(get_admin_user),
):
    """Force-stop the currently running scan."""
    from app.features.scanner.router import admin_force_kill_scan
    admin_force_kill_scan()
    return {"ok": True, "message": "Tarama durdurma sinyali gönderildi."}


@router.delete("/queue/{user_id}", response_model=Dict[str, Any])
def admin_remove_queue(
    user_id: int,
    _: User = Depends(get_admin_user),
):
    """Remove a specific user from the scan queue."""
    from app.features.scanner.router import admin_remove_user_from_queue
    removed = admin_remove_user_from_queue(user_id)
    return {"ok": removed, "user_id": user_id}


@router.post("/trigger/scan", response_model=Dict[str, Any])
def admin_trigger_scan(bg_tasks: BackgroundTasks, _: User = Depends(get_admin_user)):
    """Manually trigger the auto-scan task immediately in the background (force=True — throttle atlanır)."""
    from app.features.scanner.tasks import run_auto_scan
    bg_tasks.add_task(run_auto_scan, True)  # force=True
    return {"ok": True, "message": "Auto-scan task added to background (forced)."}
