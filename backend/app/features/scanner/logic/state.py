# backend/app/features/scanner/logic/state.py
import threading
from typing import Dict, List, Any

# --- Constants ---
MAX_QUEUE_DEPTH    = 5
USER_COOLDOWN_SEC  = 120
SCAN_TIMEOUT_SEC   = 600
STALE_SECONDS      = 120

# --- Locks ---
STATE_LOCK     = threading.Lock()
SCAN_LOCK      = threading.Lock()
PROGRESS_LOCK  = threading.Lock()

# --- Shared State ---
# Queue: list of dicts {user_id, user_email, payload, queued_at}
QUEUE: List[Dict[str, Any]] = []

# Active scan info
ACTIVE: Dict[str, Any] = {"user_id": None, "user_email": None, "started_at": None}

# Stop event for worker
STOP_EVENT = threading.Event()

# Progress tracking (surgical write optimization)
LAST_WRITE_TIME = 0.0
LAST_PERCENT    = -1
