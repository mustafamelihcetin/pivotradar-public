# feature_builder.py
# -*- coding: utf-8 -*-
"""
PivotRadar - ML Feature Builder

Goal:
- Produce a feature dict whose keys EXACTLY match the trained model's expected schema.
- Compute as many features as we realistically can from OHLCV (daily + weekly).
- Anything truly unavailable is filled with 0.0.
- Coverage metadata is added as _coverage (0..1) so the caller can warn when ML collapses.

Design rules:
- Never crash the scan if one indicator can't be computed.
- Prefer simple, deterministic calculations over heavy dependencies.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from app.shared.indicators._helpers import _num, _col, _last, _as_float, _safe_div, _pct
from app.shared.indicators.momentum import (
    _ema_last, _slope, _ret, _mom,
    _rsi_series, _zscore_last, _macd, _stoch,
)
from app.shared.indicators.volatility import (
    _atr_pct, _bb_width_pct, _squeeze_kc, _adx, _max_drawdown,
)
from app.shared.indicators.volume import (
    _obv, _mfi, _pocket_pivot, _inside_bar,
    _nr7, _gap_type, _fib_zone_prox, _simple_pattern_scores,
)

logger = logging.getLogger(__name__)

# Avoid per-symbol log spam: warn only a few times per process.
_WARNED_COVERAGE = 0


# -----------------------------
# Public API
# -----------------------------
def build_ml_features(
    df_daily: pd.DataFrame,
    df_weekly: pd.DataFrame,
    feature_names: List[str],
    extra_features: Dict[str, float] | None = None,
) -> Dict[str, float]:
    feats: Dict[str, float] = {}

    o = _col(df_daily, "Open")
    h = _col(df_daily, "High")
    l = _col(df_daily, "Low")
    c = _col(df_daily, "Close")
    v = _col(df_daily, "Volume")

    ow = _col(df_weekly, "Open")
    hw = _col(df_weekly, "High")
    lw = _col(df_weekly, "Low")
    cw = _col(df_weekly, "Close")
    vw = _col(df_weekly, "Volume")

    # daily raw
    feats["open"] = _as_float(_last(o))
    feats["high"] = _as_float(_last(h))
    feats["low"] = _as_float(_last(l))
    feats["close"] = _as_float(_last(c))
    feats["volume"] = _as_float(_last(v, 0.0))

    # weekly raw
    feats["open_w"] = _as_float(_last(ow))
    feats["high_w"] = _as_float(_last(hw))
    feats["low_w"] = _as_float(_last(lw))
    feats["close_w"] = _as_float(_last(cw))
    feats["volume_w"] = _as_float(_last(vw, 0.0))

    # returns / momentum (daily)
    feats["ret_1d"] = _as_float(_ret(c, 1))
    feats["RET_T3"] = _as_float(_ret(c, 3))
    feats["RET_T10"] = _as_float(_ret(c, 10))
    feats["mom_5"] = _as_float(_mom(c, 5))

    # drawdowns
    feats["MAXDD_T3"] = _as_float(_max_drawdown(c, 3))
    feats["MAXDD_T10"] = _as_float(_max_drawdown(c, 10))

    # EMAs
    feats["ema5"] = _as_float(_ema_last(c, 5))
    feats["ema20"] = _as_float(_ema_last(c, 20))
    feats["ema50"] = _as_float(_ema_last(c, 50))
    feats["ema200"] = _as_float(_ema_last(c, 200))

    feats["ema5_slope"] = _as_float(_slope(c, 5))
    feats["ema50_slope"] = _as_float(_slope(c, 50) if len(c) >= 55 else _slope(c, 30))
    feats["ema200_slope"] = _as_float(_slope(c, 200) if len(c) >= 205 else _slope(c, 60))

    feats["ema5_ema20_diff_pct"] = _as_float((_safe_div(feats["ema5"], feats["ema20"], default=np.nan) - 1.0) * 100.0)

    # RSI family (model expects rsi14_x/y/z)
    rsi14 = _rsi_series(c, 14)
    feats["rsi14_x"] = _as_float(_last(rsi14))
    feats["rsi14_y"] = _as_float(_last(rsi14.shift(1)))
    feats["rsi14_z"] = _as_float(_zscore_last(rsi14, 60))

    # ATR% (calc + z)
    # build ATR% series for z-score
    if len(c) >= 20:
        tr = pd.concat([(h - l).abs(), (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1/14, adjust=False).mean()
        atr_pct_series = (atr / c.replace(0, np.nan)) * 100.0
    else:
        atr_pct_series = pd.Series(dtype=float)

    feats["atr_pct"] = _as_float(_last(atr_pct_series)) if len(atr_pct_series) else _as_float(_atr_pct(df_daily, 14))
    feats["atr_pct_calc"] = feats["atr_pct"]
    feats["atr_pct_z"] = _as_float(_zscore_last(atr_pct_series, 60))

    # Bollinger width
    feats["bb_width_pct"] = _as_float(_bb_width_pct(c, 20, 2.0))

    # Stochastic
    st_k, st_d = _stoch(df_daily, 14, 3)
    feats["stoch_k"] = _as_float(st_k)
    feats["stoch_d"] = _as_float(st_d)

    # MACD / MFI / ADX
    macd_line, macd_signal, macd_hist = _macd(c)
    feats["macd_line"] = _as_float(macd_line)
    feats["macd_signal"] = _as_float(macd_signal)
    feats["macd_hist"] = _as_float(macd_hist)
    feats["mfi14"] = _as_float(_mfi(df_daily, 14))
    adx14, plus_di, minus_di = _adx(df_daily, 14)
    feats["adx14"] = _as_float(adx14)
    feats["plus_di"] = _as_float(plus_di)
    feats["minus_di"] = _as_float(minus_di)

    # OBV
    feats["obv"] = _as_float(_obv(c, v))

    # Volume ratios (model expects vol_ratio20, vol_drop_30_10)
    if len(v) >= 35:
        v10 = float(v.tail(10).mean())
        v30 = float(v.tail(30).mean())
        v20 = float(v.tail(20).mean())
        v_last = float(v.iloc[-1])
        feats["vol_ratio20"] = _as_float(_safe_div(v_last, v20, default=np.nan))
        feats["vol_drop_30_10"] = _as_float(_safe_div((v30 - v10), v30, default=np.nan) * 100.0)
    elif len(v) >= 25:
        v20 = float(v.tail(20).mean())
        v_last = float(v.iloc[-1])
        feats["vol_ratio20"] = _as_float(_safe_div(v_last, v20, default=np.nan))
        feats["vol_drop_30_10"] = 0.0
    else:
        feats["vol_ratio20"] = 0.0
        feats["vol_drop_30_10"] = 0.0

    # Squeeze (BB/KC ratio) and distance to peak
    feats["squeeze_kc"] = _as_float(_squeeze_kc(c, h, l, 20, 2.0, 1.5))
    if len(c) >= 65:
        peak60 = float(_num(c).rolling(60).max().iloc[-1])
        feats["to_peak60_pct"] = _as_float((_safe_div(float(c.iloc[-1]), peak60, default=np.nan) - 1.0) * 100.0)
    else:
        feats["to_peak60_pct"] = 0.0

    # Pattern scores (daily): keep 0..1 scale
    feats["inside_bar"] = _as_float(_inside_bar(df_daily))
    feats["nr7"] = _as_float(_nr7(df_daily))
    feats["gap_type"] = _as_float(_gap_type(df_daily, 1.0))
    feats["pocket_pivot"] = _as_float(_pocket_pivot(df_daily))
    feats["fib_zone_prox"] = _as_float(_fib_zone_prox(c, h, l, 120))

    # Simple geometry-based triangle / wedge
    def _triangle_wedge(df: pd.DataFrame, win: int = 20) -> Tuple[float, float]:
        try:
            if df is None or df.empty or len(df) < win + 2:
                return (0.0, 0.0)
            hh = _col(df, 'High').tail(win)
            ll = _col(df, 'Low').tail(win)
            x = np.arange(len(hh), dtype=float)
            sh = float(np.polyfit(x, hh.values.astype(float), 1)[0])
            sl = float(np.polyfit(x, ll.values.astype(float), 1)[0])
            # normalize by price scale
            scale = float(_last(_col(df,'Close').tail(win)))
            if not np.isfinite(scale) or scale == 0:
                scale = 1.0
            shn = sh / scale
            sln = sl / scale
            # triangle: highs down, lows up
            tri = 0.0
            if shn < 0 and sln > 0:
                tri = min(abs(shn), abs(sln)) / (abs(shn) + abs(sln) + 1e-9)
            # wedge: both slopes same sign but converging
            wed = 0.0
            if (shn < 0 and sln < 0) or (shn > 0 and sln > 0):
                wed = 1.0 - (abs(shn - sln) / (abs(shn) + abs(sln) + 1e-9))
            return (float(np.clip(tri, 0.0, 1.0)), float(np.clip(wed, 0.0, 1.0)))
        except Exception:
            return (0.0, 0.0)

    tri, wed = _triangle_wedge(df_daily, 20)
    feats["triangle_score"] = _as_float(tri)
    feats["wedge_score"] = _as_float(wed)

    # VCP score (volatility contraction): 0..1
    try:
        if len(atr_pct_series) >= 35:
            a10 = float(atr_pct_series.tail(10).mean())
            a30 = float(atr_pct_series.tail(30).mean())
            ratio = _safe_div(a10, a30, default=np.nan)
            feats["vcp_score"] = _as_float(np.clip(1.0 - float(ratio), 0.0, 1.0))
        else:
            feats["vcp_score"] = 0.0
    except Exception:
        feats["vcp_score"] = 0.0

    # SR density / distance (simple pivot-based)
    def _sr_metrics(df: pd.DataFrame, lookback: int = 120, band_pct: float = 2.0) -> Tuple[float, float]:
        try:
            if df is None or df.empty or len(df) < 30:
                return (0.0, 0.0)
            dd = df.tail(lookback)
            hh = _col(dd, 'High')
            ll = _col(dd, 'Low')
            cc = _col(dd, 'Close')
            px = float(cc.iloc[-1])
            if not np.isfinite(px) or px == 0:
                return (0.0, 0.0)
            # pivot levels
            piv = []
            for i in range(2, len(dd)-2):
                if hh.iloc[i] == hh.iloc[i-2:i+3].max():
                    piv.append(float(hh.iloc[i]))
                if ll.iloc[i] == ll.iloc[i-2:i+3].min():
                    piv.append(float(ll.iloc[i]))
            if not piv:
                return (0.0, 0.0)
            # unique by 1% bins
            uniq = sorted(set(round(p/(px*0.01)) for p in piv))
            density = float(len(uniq))
            # dist to nearest
            dists = [abs((p - px)/px)*100.0 for p in piv if np.isfinite(p)]
            dist = float(min(dists)) if dists else 0.0
            # focus band density
            band = [p for p in piv if abs((p - px)/px)*100.0 <= band_pct]
            band_bins = sorted(set(round(p/(px*0.01)) for p in band))
            density_band = float(len(band_bins))
            return (density_band, dist)
        except Exception:
            return (0.0, 0.0)

    sr_den, sr_dist = _sr_metrics(df_daily, 120, 2.0)
    feats["sr_density"] = _as_float(sr_den)
    feats["sr_dist_pct"] = _as_float(sr_dist)

    # Additional existing pattern family
    ps = _simple_pattern_scores(df_daily)
    feats["flag_score"] = _as_float(ps["flag_score"])
    feats["hs_score"] = _as_float(ps["hs_score"])
    feats["cwh_score"] = _as_float(ps["cwh_score"])
    feats["channel_score"] = _as_float(ps["channel_score"])
    feats["harm_conf"] = _as_float(ps["harm_conf"])

    # -----------------
    # WEEKLY (model expects *_w for most)
    # -----------------
    feats["ret_1d_w"] = _as_float(_ret(cw, 1))
    feats["mom_5_w"] = _as_float(_mom(cw, 5))

    feats["ema5_w"] = _as_float(_ema_last(cw, 5))
    feats["ema20_w"] = _as_float(_ema_last(cw, 20))
    feats["ema5_slope_w"] = _as_float(_slope(cw, 5))
    feats["ema5_ema20_diff_pct_w"] = _as_float((_safe_div(feats["ema5_w"], feats["ema20_w"], default=np.nan) - 1.0) * 100.0)

    # weekly RSI/ATR/Bands/Squeeze/Peak
    rsi14w = _rsi_series(cw, 14)
    feats["rsi14_w"] = _as_float(_last(rsi14w))

    if len(cw) >= 20:
        trw = pd.concat([(hw - lw).abs(), (hw - cw.shift(1)).abs(), (lw - cw.shift(1)).abs()], axis=1).max(axis=1)
        atrw = trw.ewm(alpha=1/14, adjust=False).mean()
        atr_pct_w_series = (atrw / cw.replace(0, np.nan)) * 100.0
    else:
        atr_pct_w_series = pd.Series(dtype=float)

    feats["atr_pct_w"] = _as_float(_last(atr_pct_w_series)) if len(atr_pct_w_series) else _as_float(_atr_pct(df_weekly, 14))
    feats["bb_width_pct_w"] = _as_float(_bb_width_pct(cw, 20, 2.0))
    feats["squeeze_kc_w"] = _as_float(_squeeze_kc(cw, hw, lw, 20, 2.0, 1.5))
    if len(cw) >= 30:
        peak60w = float(_num(cw).rolling(20).max().iloc[-1])
        feats["to_peak60_pct_w"] = _as_float((_safe_div(float(cw.iloc[-1]), peak60w, default=np.nan) - 1.0) * 100.0)
    else:
        feats["to_peak60_pct_w"] = 0.0

    # weekly volume ratios
    if len(vw) >= 25:
        v20w = float(vw.tail(20).mean())
        feats["vol_ratio20_w"] = _as_float(_safe_div(float(vw.iloc[-1]), v20w, default=np.nan))
    else:
        feats["vol_ratio20_w"] = 0.0

    # weekly derived pattern family
    feats["inside_bar_w"] = _as_float(_inside_bar(df_weekly))
    feats["nr7_w"] = _as_float(_nr7(df_weekly))
    feats["gap_type_w"] = _as_float(_gap_type(df_weekly, 1.0))
    feats["pocket_pivot_w"] = _as_float(_pocket_pivot(df_weekly))
    feats["fib_zone_prox_w"] = _as_float(_fib_zone_prox(cw, hw, lw, 52))

    triw, wedw = _triangle_wedge(df_weekly, 20)
    feats["triangle_score_w"] = _as_float(triw)
    feats["wedge_score_w"] = _as_float(wedw)

    try:
        if len(atr_pct_w_series) >= 20:
            a5 = float(atr_pct_w_series.tail(5).mean())
            a15 = float(atr_pct_w_series.tail(15).mean())
            ratio = _safe_div(a5, a15, default=np.nan)
            feats["vcp_score_w"] = _as_float(np.clip(1.0 - float(ratio), 0.0, 1.0))
        else:
            feats["vcp_score_w"] = 0.0
    except Exception:
        feats["vcp_score_w"] = 0.0

    sr_den_w, sr_dist_w = _sr_metrics(df_weekly, 52, 2.0)
    feats["sr_density_w"] = _as_float(sr_den_w)
    feats["sr_dist_pct_w"] = _as_float(sr_dist_w)

    psw = _simple_pattern_scores(df_weekly)
    feats["flag_score_w"] = _as_float(psw["flag_score"])
    feats["hs_score_w"] = _as_float(psw["hs_score"])
    feats["cwh_score_w"] = _as_float(psw["cwh_score"])
    feats["channel_score_w"] = _as_float(psw["channel_score"])
    feats["harm_conf_w"] = _as_float(psw["harm_conf"])

    # Ensure keys that exist in model schema but are not yet implemented (keep deterministic 0.0)
    feats.setdefault("inside_bar", feats.get("inside_bar", 0.0))

    # ── V3 Extended technical features ───────────────────────────────────────
    try:
        # 52-week position (0=52w low, 1=52w high)
        _h52 = _num(h).tail(252).max()
        _l52 = _num(l).tail(252).min()
        if np.isfinite(_h52) and np.isfinite(_l52) and _h52 > _l52:
            _c_last = float(c.iloc[-1])
            feats["w52_position"] = float(np.clip((_c_last - _l52) / (_h52 - _l52), 0.0, 1.0))
        else:
            feats["w52_position"] = 0.5
    except Exception:
        feats["w52_position"] = 0.5

    try:
        # Volume z-score (20-day rolling)
        _v20m = float(_num(v).rolling(20).mean().iloc[-1])
        _v20s = float(_num(v).rolling(20).std().iloc[-1])
        _v_last = float(v.iloc[-1])
        feats["volume_zscore"] = float((_v_last - _v20m) / _v20s) if (np.isfinite(_v20s) and _v20s > 0) else 0.0
    except Exception:
        feats["volume_zscore"] = 0.0

    try:
        feats["ret_3d"] = _as_float(_ret(c, 3))
    except Exception:
        feats["ret_3d"] = 0.0

    try:
        r1 = float(_ret(c, 1))
        r3 = float(_ret(c, 3))
        feats["ret_acceleration"] = float(r1 - r3 / 3.0) if np.isfinite(r1) and np.isfinite(r3) else 0.0
    except Exception:
        feats["ret_acceleration"] = 0.0

    try:
        # EMA alignment score: 0-3
        _c_last = float(c.iloc[-1])
        _e5  = feats.get("ema5",  float("nan"))
        _e20 = feats.get("ema20", float("nan"))
        _e50 = feats.get("ema50", float("nan"))
        _align = 0
        if np.isfinite(_c_last) and np.isfinite(_e5) and _c_last > _e5:
            _align += 1
        if np.isfinite(_e5) and np.isfinite(_e20) and _e5 > _e20:
            _align += 1
        if np.isfinite(_e20) and np.isfinite(_e50) and _e20 > _e50:
            _align += 1
        feats["ema_alignment_score"] = float(_align)
    except Exception:
        feats["ema_alignment_score"] = 0.0

    # Macro features: default 0.0 — overridden by extra_features when passed
    feats.setdefault("bist100_trend_5d", 0.0)
    feats.setdefault("vix_regime", 0.0)
    feats.setdefault("usdtry_change_5d", 0.0)

    # ── Merge caller-supplied extra features (e.g. macro signals) ─────────────
    if extra_features:
        for _k, _v in extra_features.items():
            try:
                feats[_k] = float(_v) if _v is not None else 0.0
            except (TypeError, ValueError):
                feats[_k] = 0.0

    # placeholders (avoid leakage)
    feats["TIME2TARGET_T3"] = 0.0
    feats["TIME2TARGET_T10"] = 0.0

    # -----------------------------
    # Emit exact schema dict (ONLY model features) + coverage metadata
    # -----------------------------
    out: Dict[str, float] = {}
    produced = 0
    missing: List[str] = []
    for name in feature_names:
        # Some trained pipelines emit transformed feature names (e.g. "num__RSI_14", "prep__ATR%").
        # We must satisfy the model's expected column names, but we can source values from the base feature keys.
        if name in feats:
            out[name] = _as_float(feats[name])
            produced += 1
            continue

        # Alias probing (deterministic)
        base = name.split("__")[-1] if "__" in name else name
        cand_keys = [
            base,
            base.lower(),
            base.upper(),
            base.replace(" ", "_"),
            base.replace("_", ""),
        ]
        hit = None
        for ck in cand_keys:
            if ck in feats:
                hit = ck
                break

        if hit is not None:
            out[name] = _as_float(feats[hit])
            produced += 1
        else:
            out[name] = 0.0
            missing.append(name)

    total = max(len(feature_names), 1)
    coverage = produced / total

    # Caller (analysis_engine) reads _coverage; keep it stable.
    out["_coverage"] = float(coverage)
    out["_produced"] = float(produced)
    out["_total"] = float(len(feature_names))

    global _WARNED_COVERAGE
    if feature_names and coverage < 0.60 and _WARNED_COVERAGE < 5:
        _WARNED_COVERAGE += 1
        sample = ", ".join(missing[:12])
        logger.warning(
            "ML feature coverage low: %.0f%% (%d/%d). Missing -> 0.0. Sample missing: %s",
            coverage * 100.0,
            produced,
            len(feature_names),
            sample,
        )

    return out
