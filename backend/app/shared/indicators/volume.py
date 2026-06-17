# app/shared/indicators/volume.py
"""Volume and pattern indicators: OBV, MFI, pocket pivot, inside bar, NR7, gap, Fibonacci proximity, pattern scores."""
from __future__ import annotations
from typing import Dict
import numpy as np
import pandas as pd

from app.shared.indicators._helpers import _num, _col, _pct, _safe_div
from app.shared.indicators.momentum import _slope, _ret


def _obv(close: pd.Series, volume: pd.Series) -> float:
    c = _num(close)
    v = _num(volume)
    if len(c) < 3:
        return float("nan")
    direction = np.sign(c.diff()).fillna(0.0)
    obv = (direction * v).fillna(0.0).cumsum()
    return float(obv.iloc[-1])


def _mfi(df: pd.DataFrame, period: int = 14) -> float:
    h = _col(df, "High")
    l = _col(df, "Low")
    c = _col(df, "Close")
    v = _col(df, "Volume")
    if len(c) < period + 2:
        return float("nan")
    tp = (h + l + c) / 3.0
    raw_mf = tp * v
    direction = tp.diff()
    pos_mf = raw_mf.where(direction > 0, 0.0)
    neg_mf = raw_mf.where(direction < 0, 0.0).abs()
    pos_sum = pos_mf.ewm(alpha=1 / period, adjust=False).mean()
    neg_sum = neg_mf.ewm(alpha=1 / period, adjust=False).mean().replace(0, np.nan)
    mfr = pos_sum / neg_sum
    mfi = 100 - (100 / (1 + mfr))
    return float(mfi.iloc[-1])


def _pocket_pivot(df: pd.DataFrame) -> float:
    c = _col(df, "Close")
    v = _col(df, "Volume")
    if len(c) < 15:
        return 0.0
    if float(c.iloc[-1]) <= float(c.iloc[-2]):
        return 0.0
    down_mask = c.diff().tail(10) < 0
    down_vol = v.tail(10).where(down_mask, 0.0)
    max_down_vol = float(down_vol.max())
    return 1.0 if float(v.iloc[-1]) > max_down_vol and max_down_vol > 0 else 0.0


def _inside_bar(df: pd.DataFrame) -> float:
    h = _col(df, "High")
    l = _col(df, "Low")
    if len(h) < 3:
        return 0.0
    return 1.0 if (h.iloc[-1] <= h.iloc[-2] and l.iloc[-1] >= l.iloc[-2]) else 0.0


def _nr7(df: pd.DataFrame) -> float:
    h = _col(df, "High")
    l = _col(df, "Low")
    if len(h) < 8:
        return 0.0
    rng = (h - l).abs().tail(7)
    return 1.0 if float(rng.iloc[-1]) <= float(rng.min()) else 0.0


def _gap_type(df: pd.DataFrame, thr_pct: float = 1.0) -> float:
    o = _col(df, "Open")
    c = _col(df, "Close")
    if len(c) < 3 or len(o) < 2:
        return 0.0
    prev_close = float(c.iloc[-2])
    open_now = float(o.iloc[-1])
    gp = _pct(open_now, prev_close)
    if not np.isfinite(gp):
        return 0.0
    if gp >= thr_pct:
        return 1.0
    if gp <= -thr_pct:
        return -1.0
    return 0.0


def _fib_zone_prox(close: pd.Series, high: pd.Series, low: pd.Series, window: int) -> float:
    close = _num(close)
    high = _num(high)
    low = _num(low)
    if len(close) < window + 2:
        return float("nan")
    hi = float(high.tail(window).max())
    lo = float(low.tail(window).min())
    c = float(close.iloc[-1])
    if not np.isfinite(hi) or not np.isfinite(lo) or hi == lo or c == 0:
        return float("nan")
    levels = [
        lo + (hi - lo) * r
        for r in (0.236, 0.382, 0.5, 0.618, 0.786)
    ]
    d = min(abs(c - lv) for lv in levels)
    return float((d / c) * 100.0)


def _simple_pattern_scores(df: pd.DataFrame) -> Dict[str, float]:
    h = _col(df, "High")
    l = _col(df, "Low")
    c = _col(df, "Close")
    if len(c) < 60:
        return {"flag_score": 0.0, "hs_score": 0.0, "cwh_score": 0.0, "channel_score": 0.0, "harm_conf": 0.0}

    y = c.tail(40).to_numpy(dtype=float)
    x = np.arange(len(y), dtype=float)
    x_mean = x.mean()
    y_mean = np.nanmean(y)
    ss_tot = float(np.nansum((y - y_mean) ** 2))
    b = _slope(c, 40)
    a = y_mean - b * x_mean
    y_hat = a + b * x
    ss_res = float(np.nansum((y - y_hat) ** 2))
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    channel_score = float(np.clip(r2, 0.0, 1.0))

    runup = _ret(c, 20)
    rng10 = float(h.tail(10).max() - l.tail(10).min())
    avg_rng20 = float((h.tail(20) - l.tail(20)).abs().mean())
    tight = 1.0 if (np.isfinite(rng10) and np.isfinite(avg_rng20) and avg_rng20 > 0 and (rng10 / avg_rng20) < 0.8) else 0.0
    flag_score = float(np.clip(_safe_div(runup, 10.0, default=0.0) * 0.6 + tight * 0.4, 0.0, 1.0))

    peaks = c.tail(50).rolling(3, center=True).max()
    peak_points = c.tail(50)[c.tail(50) == peaks].dropna()
    hs_score = float(1.0 - (1.0 if len(peak_points) >= 3 else 0.0))

    hi60 = float(h.tail(60).max())
    lo60 = float(l.tail(60).min())
    c_last = float(c.iloc[-1])
    recovery = _safe_div(c_last - lo60, hi60 - lo60, default=np.nan)
    cwh_score = float(np.clip(recovery if np.isfinite(recovery) else 0.0, 0.0, 1.0))

    return {"flag_score": flag_score, "hs_score": hs_score, "cwh_score": cwh_score, "channel_score": channel_score, "harm_conf": 0.0}
