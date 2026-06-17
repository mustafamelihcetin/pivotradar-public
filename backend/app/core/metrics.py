# backend/app/core/metrics.py
"""
PivotRadar — Business Metrics Registry

Thread-safe in-memory counters/gauges. Exposed via /metrics (Prometheus format).
Scanner, ML ve pipeline katmanları bu modülü import ederek metrik kaydeder.

Kullanım:
    from app.core.metrics import record_scan_complete, record_ml_inference

Prometheus /metrics endpoint (main.py) bu modülden okur.
"""
from __future__ import annotations

import time
import threading
from typing import Dict, Any

_lock = threading.Lock()

# ── Counters (monotonically increasing) ───────────────────────────────────────
_counters: Dict[str, float] = {
    "scans_total":            0.0,   # Toplam tamamlanan tarama sayısı
    "scans_failed":           0.0,   # Başarısız tarama sayısı
    "signals_generated":      0.0,   # Üretilen sinyal sayısı (qrs_score > 0)
    "ml_inferences_total":    0.0,   # ML model inference sayısı
    "cache_hits_total":       0.0,   # SymbolDataCache hit sayısı
    "cache_misses_total":     0.0,   # SymbolDataCache miss sayısı
    "backup_runs_total":      0.0,   # Backup çalışma sayısı
}

# ── Gauges (current value) ─────────────────────────────────────────────────────
_gauges: Dict[str, float] = {
    "last_scan_duration_seconds": 0.0,   # Son taramanın süresi
    "last_scan_symbol_count":     0.0,   # Son taramadaki sembol sayısı
    "last_ml_inference_ms":       0.0,   # Son ML inference süresi (ms)
    "last_scan_timestamp":        0.0,   # Son tarama Unix timestamp
    "last_backup_timestamp":      0.0,   # Son backup Unix timestamp
    "active_scan_running":        0.0,   # 1=tarama aktif, 0=idle
}


def _inc(name: str, value: float = 1.0) -> None:
    with _lock:
        if name in _counters:
            _counters[name] += value


def _set(name: str, value: float) -> None:
    with _lock:
        if name in _gauges:
            _gauges[name] = value


def get_all() -> Dict[str, Any]:
    with _lock:
        return {
            "counters": dict(_counters),
            "gauges":   dict(_gauges),
        }


# ── Public API: Scanner ────────────────────────────────────────────────────────

def record_scan_start() -> float:
    """Tarama başladığında çağır. Başlangıç zamanını döndürür."""
    _set("active_scan_running", 1.0)
    return time.monotonic()


def record_scan_complete(start_time: float, symbol_count: int, signal_count: int) -> None:
    """Tarama tamamlandığında çağır."""
    duration = time.monotonic() - start_time
    _inc("scans_total")
    _inc("signals_generated", signal_count)
    _set("last_scan_duration_seconds", round(duration, 2))
    _set("last_scan_symbol_count", float(symbol_count))
    _set("last_scan_timestamp", time.time())
    _set("active_scan_running", 0.0)


def record_scan_failed() -> None:
    _inc("scans_failed")
    _set("active_scan_running", 0.0)


# ── Public API: ML ─────────────────────────────────────────────────────────────

def record_ml_inference(duration_ms: float) -> None:
    """ML inference tamamlandığında çağır."""
    _inc("ml_inferences_total")
    _set("last_ml_inference_ms", round(duration_ms, 2))


# ── Public API: Cache ──────────────────────────────────────────────────────────

def record_cache_hit() -> None:
    _inc("cache_hits_total")


def record_cache_miss() -> None:
    _inc("cache_misses_total")


# ── Public API: Backup ─────────────────────────────────────────────────────────

def record_backup_complete() -> None:
    _inc("backup_runs_total")
    _set("last_backup_timestamp", time.time())


def get_last_scan_minutes_ago() -> float | None:
    """Son taramanın kaç dakika önce olduğunu döndürür. Hiç tarama yoksa None."""
    with _lock:
        ts = _gauges.get("last_scan_timestamp", 0.0)
    if ts == 0.0:
        return None
    return round((time.time() - ts) / 60, 1)


def get_last_backup_hours_ago() -> float | None:
    """Son backup'ın kaç saat önce olduğunu döndürür. Bilinmiyorsa None."""
    with _lock:
        ts = _gauges.get("last_backup_timestamp", 0.0)
    if ts == 0.0:
        return None
    return round((time.time() - ts) / 3600, 1)


def get_cache_hit_rate() -> float | None:
    """Cache hit rate [0.0-1.0]. Hiç istek yoksa None."""
    with _lock:
        hits   = _counters["cache_hits_total"]
        misses = _counters["cache_misses_total"]
    total = hits + misses
    if total == 0:
        return None
    return round(hits / total, 3)
