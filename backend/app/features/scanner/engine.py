# engine.py — backward-compatible re-export shim
# -*- coding: utf-8 -*-
"""
PivotRadar - Analysis Engine (re-export shim)

All implementation has been split into focused sub-modules:
  _engine_constants.py  — RSI thresholds, chunk sizes, timeouts, etc.
  _engine_ml.py         — _pick_latest_ml_model() and MLScorer loading logic
  _engine_pipeline.py   — run_pipeline() and all helper functions

This file exists solely for backward compatibility so that any caller doing:
    from app.features.scanner.engine import run_pipeline
    from app.features.scanner.engine import _call_rules_score
continues to work unchanged.
"""

from ._engine_constants import (  # noqa: F401
    _RSI_EXTREME_OVERBOUGHT,
    _RSI_OVERBOUGHT,
    _ML_CAP_EXTREME,
    _ML_CAP_OVERBOUGHT,
    CHUNK_SIZE,
    _FUTURE_TIMEOUT,
)
from ._engine_ml import _pick_latest_ml_model, MLScorer  # noqa: F401
from app.features.market_data.service import MarketDataService  # noqa: F401
from app.features.charts.patterns import detect_patterns_validated  # noqa: F401
from ._engine_pipeline import (  # noqa: F401
    run_pipeline,
    _call_rules_score,
    SimpleTA,
    ta,
    logger,
    _env_bool,
    _fmt_float,
    _ensure_float,
    _feat_nonzero_stats,
    _assert_ml_strict,
    _parse_int_param,
    _parse_float_param,
)

__all__ = ["run_pipeline"]
