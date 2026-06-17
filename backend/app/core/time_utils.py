from __future__ import annotations

from datetime import UTC, datetime


def now_utc() -> datetime:
    """Return a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def isoformat_z(dt: datetime | None = None) -> str:
    """Return an ISO-8601 timestamp with a trailing Z."""
    current = dt or now_utc()
    return current.astimezone(UTC).isoformat().replace("+00:00", "Z")
