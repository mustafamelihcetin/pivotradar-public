# backend/app/core/task_history.py
import datetime
import time
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.features.scanner.models import SystemTaskLog
from app.core.time_utils import now_utc

def record_task_start(task_name: str) -> int:
    """Creates a new log entry and returns its ID."""
    db = SessionLocal()
    try:
        log = SystemTaskLog(
            task_name=task_name,
            started_at=now_utc().replace(tzinfo=None),
            status="running"
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log.id
    except Exception:
        return None
    finally:
        db.close()

def record_task_end(log_id: int, status: str, message: str = None):
    """Updates the log entry with end time and status."""
    if log_id is None: return
    db = SessionLocal()
    try:
        # SQLAlchemy 2.x: use db.get() instead of deprecated Query.get()
        log = db.get(SystemTaskLog, log_id)
        if log:
            log.finished_at = now_utc().replace(tzinfo=None)
            log.status = status
            log.message = message[:500] if message else None
            log.duration = (log.finished_at - log.started_at).total_seconds()
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

def get_last_success_time(task_name: str) -> datetime.datetime | None:
    """Returns the finished_at timestamp of the last successful run for a task."""
    db = SessionLocal()
    try:
        log = (
            db.query(SystemTaskLog)
            .filter(SystemTaskLog.task_name == task_name, SystemTaskLog.status == "success")
            .order_by(SystemTaskLog.finished_at.desc())
            .first()
        )
        return log.finished_at if log else None
    except Exception:
        return None
    finally:
        db.close()
