# pipeline/_helpers.py
"""
Yardımcı fonksiyonlar ve SimpleTA: _engine_pipeline.py'den ayrıştırıldı.
Tüm bu fonksiyonlar pure / yan etkisiz — test edilmesi kolay.
"""
from __future__ import annotations

import os
import inspect
import logging
from typing import Any, Dict

import numpy as np
import pandas as pd

from app.features.scoring.yzdsh_rules import rules_score

logger = logging.getLogger("PivotRadar.Engine")

# ── rules_score arity tespiti (bir kez yapılır) ───────────────────────────────
try:
    _RULESCORE_ARITY = len(inspect.signature(rules_score).parameters)
except Exception:
    _RULESCORE_ARITY = 4


def call_rules_score(*args, **kwargs) -> float:
    """rules_score()'u geriye dönük uyumlu şekilde çağırır.

    Desteklenen çağrı biçimleri:
      - positional: (rsi, breakout, trend, atr_pct, vol_ratio)
      - positional: (rsi, trend, atr_pct, vol_ratio)
      - keyword: rsi=..., trend=..., atr_pct=..., vol_ratio=...
    """
    def _get(name, *aliases, default=None):
        for k in (name,) + aliases:
            if k in kwargs:
                return kwargs[k]
        return default

    rsi       = _get("rsi")
    breakout  = _get("breakout", default=None)
    trend     = _get("ema_fast_over_slow", "trend", default=None)
    atr_pct   = _get("atr_pct", "atr_percent", default=None)
    vol_ratio = _get("vol_ratio", "volume_ratio", default=None)

    if rsi is None and len(args) >= 1:
        rsi = args[0]
    if len(args) >= 5:
        if breakout  is None: breakout  = args[1]
        if trend     is None: trend     = args[2]
        if atr_pct   is None: atr_pct   = args[3]
        if vol_ratio is None: vol_ratio = args[4]
    elif len(args) == 4:
        if trend     is None: trend     = args[1]
        if atr_pct   is None: atr_pct   = args[2]
        if vol_ratio is None: vol_ratio = args[3]

    def _f(v, d=0.0):
        try:
            f = float(v) if v is not None else d
            return f if np.isfinite(f) else d
        except Exception:
            return d

    rsi_f = _f(rsi); trend_f = _f(trend); atr_f = _f(atr_pct)
    vol_f = _f(vol_ratio); brk_f = _f(breakout)
    p_name = _get("profile_name", default="DENGELİ (STANDARD)")

    try:
        if _RULESCORE_ARITY >= 6:
            return float(rules_score(rsi_f, bool(trend_f > 0.5), atr_f, vol_f, p_name, brk_f))
        if _RULESCORE_ARITY >= 5:
            return float(rules_score(rsi_f, bool(trend_f > 0.5), atr_f, vol_f, p_name))
        return float(rules_score(rsi_f, trend_f, atr_f, vol_f))
    except Exception as e:
        logger.error("[RULE_SCORE_ERR] %s", e)
        return 0.0


# ── Minimal TA (pure pandas) ──────────────────────────────────────────────────

class SimpleTA:
    @staticmethod
    def rsi(series: pd.Series, length: int = 14) -> pd.Series:
        s = pd.to_numeric(series, errors="coerce")
        delta = s.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        return (100 - (100 / (1 + rs))).fillna(50)

    @staticmethod
    def ema(series: pd.Series, length: int = 10) -> pd.Series:
        s = pd.to_numeric(series, errors="coerce")
        return s.ewm(span=length, adjust=False).mean()

    @staticmethod
    def atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
        h = pd.to_numeric(high, errors="coerce")
        lv = pd.to_numeric(low, errors="coerce")
        c = pd.to_numeric(close, errors="coerce")
        tr1 = (h - lv).abs()
        tr2 = (h - c.shift()).abs()
        tr3 = (lv - c.shift()).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.ewm(alpha=1 / length, adjust=False).mean()


ta = SimpleTA


# ── Debug / parse helpers ─────────────────────────────────────────────────────

def env_bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def fmt_float(x: Any) -> str:
    try:
        if x is None:
            return "None"
        xf = float(x)
        if not np.isfinite(xf):
            return "nan"
        return f"{xf:.4f}"
    except Exception:
        return "nan"


def ensure_float(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return float(default)
        xf = float(x)
        if not np.isfinite(xf):
            return float(default)
        return xf
    except Exception:
        return float(default)


def feat_nonzero_stats(feats: Dict[str, Any]) -> tuple[int, int, list[tuple[str, float]]]:
    if not isinstance(feats, dict) or not feats:
        return (0, 0, [])
    items: list[tuple[str, float]] = []
    nonzero = 0
    for k, v in feats.items():
        if k == "_coverage":
            continue
        try:
            fv = float(v)
            if np.isfinite(fv) and abs(fv) > 1e-12:
                nonzero += 1
                items.append((k, fv))
        except Exception:
            continue
    items.sort(key=lambda kv: abs(kv[1]), reverse=True)
    return (nonzero, len([k for k in feats.keys() if k != "_coverage"]), items[:8])


def assert_ml_strict(ml_feats: Dict[str, Any], expected: list[str]) -> None:
    """Zero-tolerance ML feature gate. Exception fırlatır."""
    if not expected:
        raise ValueError("ml_expected_empty")
    missing = [f for f in expected if f not in ml_feats]
    if missing:
        raise ValueError("ml_missing_features:" + ",".join(missing[:20]))
    bad: list[str] = []
    for f in expected:
        try:
            v = float(ml_feats.get(f))
            if not np.isfinite(v):
                bad.append(f)
        except Exception:
            bad.append(f)
    if bad:
        raise ValueError("ml_non_finite:" + ",".join(bad[:20]))


def parse_int_param(p_dict: Dict[str, Any], key: str, default: int) -> int:
    try:
        val = p_dict.get(key)
        return int(val) if val is not None else default
    except Exception:
        return default


def parse_float_param(p_dict: Dict[str, Any], key: str, default: float) -> float:
    try:
        val = p_dict.get(key)
        val = str(val).replace(",", ".")
        return float(val)
    except Exception:
        return default
