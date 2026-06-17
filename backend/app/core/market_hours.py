"""BIST market hours — thin wrapper over market_calendar for open/closed queries."""
from __future__ import annotations
from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.core.market_calendar import is_trading_day, get_market_status as _get_status

BIST_TZ    = ZoneInfo("Europe/Istanbul")
BIST_OPEN  = time(10, 0)
BIST_CLOSE = time(18, 0)


def _now_istanbul() -> datetime:
    return datetime.now(tz=BIST_TZ)


def is_market_open(now: datetime | None = None) -> bool:
    now = now or _now_istanbul()
    now_ist = now.astimezone(BIST_TZ)
    status = _get_status(now_ist.replace(tzinfo=None))
    return status["status"] == "OPEN"


def get_market_status(now: datetime | None = None) -> dict:
    now = now or _now_istanbul()
    now_ist = now.astimezone(BIST_TZ)
    return _get_status(now_ist.replace(tzinfo=None))
