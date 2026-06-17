"""BIST market calendar — holiday and half-day data from exchange_calendars (XIST).

Uses the official exchange_calendars library which sources its XIST schedule from
Borsa İstanbul's published announcements. No manual holiday maintenance needed.
"""
import datetime
from functools import lru_cache
from typing import Optional

try:
    import exchange_calendars as xcals
    import pandas as pd
    _XCALS_AVAILABLE = True
except ImportError:
    _XCALS_AVAILABLE = False

from app.core.time_utils import now_utc

# Fallback holiday list — exported for tests; also used when exchange_calendars is unavailable.
BIST_HOLIDAYS_2026 = _FALLBACK_HOLIDAYS = {
    datetime.date(2026, 1, 1),
    datetime.date(2026, 3, 19),
    datetime.date(2026, 3, 20),
    datetime.date(2026, 3, 21),
    datetime.date(2026, 3, 22),
    datetime.date(2026, 4, 23),
    datetime.date(2026, 5, 1),
    datetime.date(2026, 5, 19),
    datetime.date(2026, 5, 26),
    datetime.date(2026, 5, 27),
    datetime.date(2026, 5, 28),
    datetime.date(2026, 5, 29),
    datetime.date(2026, 5, 30),
    datetime.date(2026, 7, 15),
    datetime.date(2026, 8, 30),
    datetime.date(2026, 10, 28),
    datetime.date(2026, 10, 29),
}

HALF_DAYS_2026 = _FALLBACK_HALF_DAYS = {
    datetime.date(2026, 3, 19),
    datetime.date(2026, 5, 26),
    datetime.date(2026, 10, 28),
}


@lru_cache(maxsize=1)
def _get_calendar():
    return xcals.get_calendar("XIST")


def is_trading_day(d: datetime.date) -> bool:
    if d.weekday() >= 5:
        return False
    if not _XCALS_AVAILABLE:
        return d not in (_FALLBACK_HOLIDAYS - _FALLBACK_HALF_DAYS)
    try:
        return bool(_get_calendar().is_session(pd.Timestamp(d)))
    except Exception:
        return d not in (_FALLBACK_HOLIDAYS - _FALLBACK_HALF_DAYS)


def is_half_day(d: datetime.date) -> bool:
    if not _XCALS_AVAILABLE:
        return d in _FALLBACK_HALF_DAYS
    try:
        cal = _get_calendar()
        ts = pd.Timestamp(d)
        # exchange_calendars exposes early_closes as a DatetimeIndex
        return ts in cal.early_closes
    except Exception:
        return d in _FALLBACK_HALF_DAYS


def add_trading_days(start_date: datetime.date, n: int) -> datetime.date:
    if n <= 0:
        return start_date
    current = start_date
    added = 0
    while added < n:
        current += datetime.timedelta(days=1)
        if is_trading_day(current):
            added += 1
    return current


def count_trading_days(start_date: datetime.date, end_date: datetime.date) -> int:
    if start_date >= end_date:
        return 0
    count = 0
    curr = start_date
    while curr < end_date:
        if is_trading_day(curr):
            count += 1
        curr += datetime.timedelta(days=1)
    return count


def get_market_status(ist_now: Optional[datetime.datetime] = None) -> dict:
    if ist_now is None:
        ist_now = now_utc().replace(tzinfo=None) + datetime.timedelta(hours=3)

    d = ist_now.date()

    if not is_trading_day(d):
        return {"status": "CLOSED", "message": "Piyasa Kapalı (Hafta Sonu / Tatil)"}

    minutes = ist_now.hour * 60 + ist_now.minute
    half = is_half_day(d)
    close_min = 13 * 60 if half else 18 * 60  # 13:00 yarım gün, 18:00 normal

    if minutes < 580:  # 09:40
        return {"status": "CLOSED", "message": "Piyasa Henüz Açılmadı"}
    if 580 <= minutes < 600:  # 09:40–10:00
        return {"status": "PRE-MARKET", "message": "Piyasa Açılış Hazırlığında"}
    if 600 <= minutes < close_min:
        suffix = " (Yarım Gün)" if half else ""
        return {"status": "OPEN", "message": f"Piyasa Açık{suffix}"}
    if close_min <= minutes < close_min + 10:
        return {"status": "CLOSING", "message": "Piyasa Kapanış Seansında"}

    return {"status": "CLOSED", "message": "Piyasa Kapandı"}
