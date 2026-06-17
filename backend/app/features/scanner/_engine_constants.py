# _engine_constants.py
# -*- coding: utf-8 -*-
"""
PivotRadar - Engine-level constants and configuration.

All module-level constants and config (RSI thresholds, chunk sizes, etc.)
extracted from engine.py for clarity and reuse.
"""

# ── Engine-level scoring constants ───────────────────────────────────────────
# RSI above this level signals extreme overbought — dampened ML ceiling applied
_RSI_EXTREME_OVERBOUGHT = 95.0
_RSI_OVERBOUGHT         = 85.0
# ML score ceilings applied when RSI is extreme/overbought to avoid false confidence
_ML_CAP_EXTREME         = 94.8
_ML_CAP_OVERBOUGHT      = 98.5

# Bulk OHLC prefetch chunk size — 50 keeps each yf.download call under ~10s
# and allows progress updates every ~50 symbols instead of every 150.
CHUNK_SIZE = 50

# Per-symbol future timeout (seconds) — prevents single-symbol hangs from
# freezing the entire pipeline indefinitely.
_FUTURE_TIMEOUT = 90
