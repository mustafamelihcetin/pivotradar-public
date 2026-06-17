# app/shared/indicators/_helpers.py
"""Shared low-level helpers used by all indicator sub-modules."""
from __future__ import annotations
import numpy as np
import pandas as pd


def _num(s: pd.Series) -> pd.Series:
    if s is None:
        return pd.Series(dtype=float)
    return pd.to_numeric(s, errors="coerce")


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    if df is None:
        return pd.Series(dtype=float)
    if isinstance(df, pd.Series):
        if df.name and str(df.name).lower() == name.lower():
            return _num(df)
        df = df.to_frame()
    if df.empty:
        return pd.Series(dtype=float)
    for key in (name, name.lower(), name.upper(), name.capitalize()):
        if key in df.columns:
            return _num(df[key])
    return pd.Series(dtype=float)


def _last(x: pd.Series, default: float = np.nan) -> float:
    if x is None or len(x) == 0:
        return float(default)
    try:
        return float(x.iloc[-1])
    except Exception:
        return float(default)


def _as_float(x) -> float:
    try:
        x = float(x)
        if not np.isfinite(x):
            return 0.0
        return x
    except Exception:
        return 0.0


def _safe_div(a: float, b: float, default: float = np.nan) -> float:
    try:
        if b == 0 or (isinstance(b, float) and not np.isfinite(b)):
            return default
        return float(a / b)
    except Exception:
        return default


def _pct(a: float, b: float) -> float:
    if not np.isfinite(a) or not np.isfinite(b) or b == 0:
        return float("nan")
    return float((a / b - 1.0) * 100.0)
