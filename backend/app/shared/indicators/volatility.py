# app/shared/indicators/volatility.py
"""Volatility indicators: ATR, Bollinger Bands, Squeeze, ADX, max-drawdown."""
from __future__ import annotations
from typing import Tuple
import numpy as np
import pandas as pd

from app.shared.indicators._helpers import _num, _col


def _atr_pct(df: pd.DataFrame, period: int = 14) -> float:
    h = _col(df, "High")
    l = _col(df, "Low")
    c = _col(df, "Close")
    if len(c) < period + 2:
        return float("nan")
    prev_close = c.shift(1)
    tr = pd.concat([(h - l).abs(), (h - prev_close).abs(), (l - prev_close).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / period, adjust=False).mean()
    atr_last = float(atr.iloc[-1])
    close_last = float(c.iloc[-1])
    if not np.isfinite(atr_last) or not np.isfinite(close_last) or close_last == 0:
        return float("nan")
    return float((atr_last / close_last) * 100.0)


def _bb_width_pct(close: pd.Series, period: int = 20, n_std: float = 2.0) -> float:
    close = _num(close)
    if len(close) < period + 2:
        return float("nan")
    ma = close.rolling(period).mean()
    sd = close.rolling(period).std(ddof=0)
    upper = ma + n_std * sd
    lower = ma - n_std * sd
    ma_last = float(ma.iloc[-1])
    if not np.isfinite(ma_last) or ma_last == 0:
        return float("nan")
    return float((float(upper.iloc[-1]) - float(lower.iloc[-1])) / ma_last * 100.0)


def _squeeze_kc(
    close: pd.Series,
    high: pd.Series,
    low: pd.Series,
    period: int = 20,
    bb_std: float = 2.0,
    kc_mult: float = 1.5,
) -> float:
    """Squeeze ratio. >1 = BB wider than KC; <1 = squeeze."""
    c = _num(close)
    h = _num(high)
    l = _num(low)
    if len(c) < period + 5:
        return float("nan")
    sd = c.rolling(period).std(ddof=0)
    bb_width = bb_std * sd * 2.0
    tr = pd.concat(
        [(h - l).abs(), (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1
    ).max(axis=1)
    atr = tr.ewm(alpha=1 / period, adjust=False).mean()
    kc_width = kc_mult * atr * 2.0
    denom = float(kc_width.iloc[-1])
    if not np.isfinite(denom) or denom == 0:
        return float("nan")
    return float(float(bb_width.iloc[-1]) / denom)


def _adx(df: pd.DataFrame, period: int = 14) -> Tuple[float, float, float]:
    h = _col(df, "High")
    l = _col(df, "Low")
    c = _col(df, "Close")
    if len(c) < period + 2:
        return (float("nan"), float("nan"), float("nan"))
    up_move = h.diff()
    down_move = -l.diff()
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
    prev_close = c.shift(1)
    tr = pd.concat(
        [(h - l).abs(), (h - prev_close).abs(), (l - prev_close).abs()], axis=1
    ).max(axis=1)
    atr = tr.ewm(alpha=1 / period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr.replace(0, np.nan))
    minus_di = 100 * (minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr.replace(0, np.nan))
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=1 / period, adjust=False).mean()
    return (float(adx.iloc[-1]), float(plus_di.iloc[-1]), float(minus_di.iloc[-1]))


def _max_drawdown(close: pd.Series, window: int) -> float:
    close = _num(close)
    if len(close) < window + 2:
        return float("nan")
    w = close.tail(window).to_numpy(dtype=float)
    peak = np.maximum.accumulate(w)
    dd = (w / np.where(peak == 0, np.nan, peak) - 1.0) * 100.0
    return float(np.nanmin(dd))
