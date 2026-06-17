# app/shared/indicators/momentum.py
"""Momentum and trend indicators: RSI, MACD, EMA, stochastic, slope, z-score."""
from __future__ import annotations
from typing import Tuple
import numpy as np
import pandas as pd

from app.shared.indicators._helpers import _num, _col, _pct, _safe_div


def _ema_last(s: pd.Series, span: int) -> float:
    s = _num(s)
    if len(s) < max(3, span + 2):
        return float("nan")
    return float(s.ewm(span=span, adjust=False).mean().iloc[-1])


def _slope(s: pd.Series, lookback: int) -> float:
    s = _num(s)
    if len(s) < lookback + 2:
        return float("nan")
    y = s.tail(lookback).to_numpy(dtype=float)
    x = np.arange(len(y), dtype=float)
    x = x - x.mean()
    y = y - np.nanmean(y)
    denom = float((x * x).sum())
    if denom == 0:
        return float("nan")
    return float((x * y).sum() / denom)


def _ret(close: pd.Series, n: int) -> float:
    close = _num(close)
    if len(close) < n + 2:
        return float("nan")
    return _pct(float(close.iloc[-1]), float(close.iloc[-1 - n]))


def _mom(close: pd.Series, n: int) -> float:
    close = _num(close)
    if len(close) < n + 2:
        return float("nan")
    return float(close.iloc[-1] - close.iloc[-1 - n])


def _rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder-style RSI. Returns a Series aligned to close."""
    c = _num(close)
    if len(c) == 0:
        return pd.Series(dtype=float)
    d = c.diff()
    up = d.clip(lower=0.0)
    dn = (-d).clip(lower=0.0)
    ma_up = up.ewm(alpha=1/period, adjust=False).mean()
    ma_dn = dn.ewm(alpha=1/period, adjust=False).mean().replace(0, np.nan)
    rs = ma_up / ma_dn
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def _zscore_last(s: pd.Series, win: int = 60) -> float:
    s = _num(s)
    if len(s) < win + 3:
        return float('nan')
    w = s.iloc[-win:]
    mu = float(w.mean())
    sd = float(w.std(ddof=0))
    if not np.isfinite(sd) or sd == 0:
        return float('nan')
    return float((float(s.iloc[-1]) - mu) / sd)


def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[float, float, float]:
    close = _num(close)
    if len(close) < slow + signal + 5:
        return (float("nan"), float("nan"), float("nan"))
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    macd_signal = macd_line.ewm(span=signal, adjust=False).mean()
    macd_hist = macd_line - macd_signal
    return (float(macd_line.iloc[-1]), float(macd_signal.iloc[-1]), float(macd_hist.iloc[-1]))


def _stoch(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> Tuple[float, float]:
    h = _col(df, 'High')
    l = _col(df, 'Low')
    c = _col(df, 'Close')
    if len(c) < k_period + d_period + 2:
        return (float('nan'), float('nan'))
    hh = h.rolling(k_period).max()
    ll = l.rolling(k_period).min()
    denom = (hh - ll).replace(0, np.nan)
    k = ((c - ll) / denom) * 100.0
    d = k.rolling(d_period).mean()
    return (float(k.iloc[-1]), float(d.iloc[-1]))
