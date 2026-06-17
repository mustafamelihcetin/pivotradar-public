# pipeline/_context.py
"""
_ScanContext: Paralel sembol işleme için paylaşılan durum nesnesi.
Thread-safe — tüm mutable alanlar lock korumalı.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


@dataclass
class ScanContext:
    """Shared state for parallel symbol processing — replaces closure variables."""
    bulk_cache:            Dict[str, Any]
    data_svc:              Any             # MarketDataService
    ml_scorer:             Any             # Optional[MLScorer]
    params:                Dict[str, Any]
    p_name:                str
    candidate_symbols:     list
    total_symbols:         int
    stop_check:            Optional[Callable[[], bool]]
    progress_cb:           Optional[Callable]
    use_ml:                bool
    use_patterns:          bool
    strict_ml:             bool
    debug_scoring:         bool
    fetch_errors:          Dict[str, int]
    processed_count_lock:  threading.Lock
    global_signals:        Dict[str, Any] = field(default_factory=dict)
    local_processed_count: list = field(default_factory=lambda: [0])
    ml_err_counter:        list = field(default_factory=lambda: [0])
    last_progress_ts:      list = field(default_factory=lambda: [0.0])


# Backward compat alias (existing code uses _ScanContext)
_ScanContext = ScanContext
