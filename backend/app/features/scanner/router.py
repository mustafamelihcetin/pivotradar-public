# backend/app/features/scanner/router.py
from fastapi import APIRouter
from .routers.api_status import router as status_router
from .routers.api_scan import router as scan_router
from .routers.api_public import router as public_router

# Root router for the scanner feature
router = APIRouter()

# --- Legacy Support / Helper for Bootstrap ---
from .logic.progress import write_progress as _write_progress
from .logic.state import STOP_EVENT as _STOP_EVENT
from .logic.state import ACTIVE as _ACTIVE
from .logic.state import QUEUE as _QUEUE
from .logic.progress import read_progress_raw
from .logic.queue_manager import push_to_scan_queue

def get_scan_state_for_admin():
    """Returns the current state of the scanner for admin monitoring."""
    progress = read_progress_raw()
    return {
        "active": _ACTIVE,
        "queue": _QUEUE,
        "progress": progress,
        "is_stopped": _STOP_EVENT.is_set()
    }

def admin_force_kill_scan():
    """Force-stop the currently running scan."""
    _STOP_EVENT.set()
    _ACTIVE["user_id"] = None
    _ACTIVE["user_email"] = None
    _ACTIVE["started_at"] = None

# Combine all sub-routers
router.include_router(status_router)
router.include_router(scan_router)
router.include_router(public_router)
