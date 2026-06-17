# core/ml_features_v2.py
from __future__ import annotations
import numpy as np
import pandas as pd

# V3: exact parity with RETRAIN_FEATURES in constants.py (20 features).
# Indicator-sourced features (momentum, breakout, trend, pattern_score, w52_position,
# bist100_trend_5d, vix_regime, usdtry_change_5d) default to 0.0 when indicators dict
# is not supplied — safe for offline/backtesting use.
FEATURES_V3 = [
    # OHLCV-derived
    "rsi14_x", "atr_pct", "vol_ratio20", "ret_1d",
    "ema20_gap", "ema50_gap", "range_pct", "body_pct",
    "w52_position", "volume_zscore", "ret_3d", "ret_acceleration",
    "ema_alignment_score",
    # Indicator features (from prism/scanner pipeline)
    "momentum", "breakout", "trend", "pattern_score",
    # Macro features
    "bist100_trend_5d", "vix_regime", "usdtry_change_5d",
    # V5 derived regime feature
    "market_regime",
    # V7 relative strength vs BIST100
    "rs_vs_bist100",
    # V8 pattern type ordinal encoding (-2 güçlü ayı .. +2 güçlü boğa)
    "pattern_type_encoded",
]

# FEATURES_V2 is now an alias for V3 — keeps the parity test green.
FEATURES_V2 = FEATURES_V3

def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()

def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    ma_up = up.ewm(alpha=1/period, adjust=False).mean()
    ma_down = down.ewm(alpha=1/period, adjust=False).mean()
    rs = ma_up / (ma_down.replace(0, np.nan))
    return 100 - (100 / (1 + rs))

def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low),
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()


def build_features_v3(df: pd.DataFrame, indicators: dict = None) -> pd.DataFrame:
    """
    Build training-aligned feature matrix from OHLCV + optional indicators dict.

    Produces columns matching FEATURES_V3 / RETRAIN_FEATURES exactly.
    Indicator features (momentum, breakout, trend, etc.) are sourced from the
    `indicators` dict when provided; otherwise filled with 0.0.
    """
    d = df.copy()
    for c in ["open", "high", "low", "close", "volume"]:
        if c not in d.columns:
            raise ValueError(f"V3 requires column: {c}")

    close = d["close"].astype(float)
    high  = d["high"].astype(float)
    low   = d["low"].astype(float)
    open_ = d["open"].astype(float)
    vol   = d["volume"].astype(float)

    # RSI-14 (name matches RETRAIN_FEATURES: rsi14_x)
    d["rsi14_x"] = _rsi(close, 14)

    # ATR%
    atr = _atr(high, low, close, 14)
    d["atr_pct"] = (atr / close) * 100.0

    # Volume ratio: last / 20-day mean (vol_ratio20)
    v20_mean = vol.rolling(20).mean().replace(0, np.nan)
    d["vol_ratio20"] = vol / v20_mean

    # 1-day return (ret_1d)
    d["ret_1d"] = np.log(close / close.shift(1))

    # EMA gaps
    ema5  = _ema(close, 5)
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    d["ema20_gap"] = (close / ema20) - 1.0
    d["ema50_gap"] = (close / ema50) - 1.0

    # Candle geometry
    d["range_pct"] = ((high - low) / close) * 100.0
    d["body_pct"]  = ((close - open_) / close) * 100.0

    # 52-week position (0 = 52w-low, 1 = 52w-high)
    h52 = high.rolling(252, min_periods=20).max()
    l52 = low.rolling(252, min_periods=20).min()
    span = (h52 - l52).replace(0, np.nan)
    d["w52_position"] = ((close - l52) / span).clip(0.0, 1.0)

    # Volume z-score (20-day)
    v_mean = vol.rolling(20).mean()
    v_std  = vol.rolling(20).std().replace(0, np.nan)
    d["volume_zscore"] = (vol - v_mean) / v_std

    # 3-day return
    d["ret_3d"] = np.log(close / close.shift(3))

    # Return acceleration: ret_1d rate of change vs 3-day avg
    d["ret_acceleration"] = d["ret_1d"] - (d["ret_3d"] / 3.0)

    # EMA alignment score (0-3): close>ema5, ema5>ema20, ema20>ema50
    d["ema_alignment_score"] = (
        (close > ema5).astype(float) +
        (ema5  > ema20).astype(float) +
        (ema20 > ema50).astype(float)
    )

    # Indicator features: scalar broadcast from the indicators dict or 0.0
    ind = indicators or {}
    ind_feat_names = [
        "momentum", "breakout", "trend", "pattern_score",
        "bist100_trend_5d", "vix_regime", "usdtry_change_5d",
        "rs_vs_bist100",
    ]
    for feat in ind_feat_names:
        raw = ind.get(feat, 0.0)
        if raw is None:
            raw = 0.0
        elif isinstance(raw, bool):
            raw = 1.0 if raw else 0.0
        d[feat] = float(raw)

    # V8: formasyon tipi ordinal encoding — pattern_name string'inden türetilir
    _PATTERN_ENC = {
        "Çift Dip": 2.0, "Ters Baş Omuz": 2.0, "Üçlü Dip": 2.0, "Kupa Sap": 2.0, "Alçalan Takoz": 2.0,
        "Yükselen Kanal": 1.0, "Yükselen Üçgen": 1.0, "Bayrak": 1.0, "Flama": 1.0,
        "Daralan Üçgen": 0.0, "Range/Kutu": 0.0, "Genişleyen Üçgen": 0.0,
        "Destek Hattı": 0.5, "Direnç Hattı": -0.5,
        "Alçalan Kanal": -1.0, "Alçalan Üçgen": -1.0,
        "Baş Omuz": -2.0, "Çift Tepe": -2.0, "Üçlü Tepe": -2.0, "Yükselen Takoz": -2.0,
    }
    _pname = str(ind.get("pattern_name", "") or "").strip()
    d["pattern_type_encoded"] = _PATTERN_ENC.get(_pname, 0.0)

    # Derived regime feature: combines vix_regime (0/1/2) and bist100 trend direction
    # Result: vix_regime * 10 + trend_dir  where trend_dir in {-1, 0, 1}
    _vix_r = d["vix_regime"].iloc[0] if hasattr(d["vix_regime"], "iloc") else float(d["vix_regime"])
    _bist_t = d["bist100_trend_5d"].iloc[0] if hasattr(d["bist100_trend_5d"], "iloc") else float(d["bist100_trend_5d"])
    _trend_dir = 1 if _bist_t > 0.01 else (-1 if _bist_t < -0.01 else 0)
    d["market_regime"] = float(_vix_r) * 10.0 + float(_trend_dir)

    out = d[FEATURES_V3].copy()
    out = out.replace([np.inf, -np.inf], np.nan)
    out = out.ffill().bfill()

    # Feature-aware NaN imputation: semantically correct defaults per feature
    _NAN_DEFAULTS = {
        "rsi14_x":            50.0,   # nötr RSI
        "vol_ratio20":         1.0,   # ortalama hacim (0 = veri yok, yanıltıcı)
        "momentum":            0.0,   # momentum yok
        "breakout":            0.0,   # kırılım yok
        "trend":               0.0,   # nötr trend
        "pattern_score":          0.0,   # pattern yok
        "pattern_type_encoded":   0.0,  # nötr formasyon
        "ema20_gap":           0.0,   # EMA sapması yok
        "ema50_gap":           0.0,
        "w52_position":        0.5,   # 52 hafta ortası
        "volume_zscore":       0.0,   # ortalama hacim z-skoru
        "vix_regime":          0.0,   # düşük VIX (varsayılan)
        "usdtry_change_5d":    0.0,
        "bist100_trend_5d":    0.0,
        "ema_alignment_score": 0,
        "market_regime":       0.0,   # normal VIX + nötr trend
    }
    for col, default_val in _NAN_DEFAULTS.items():
        if col in out.columns:
            out[col] = out[col].fillna(default_val)

    # Kalan NaN'lar için güvenli fallback
    out = out.fillna(0.0)
    return out


def build_features(df: pd.DataFrame, indicators: dict = None) -> pd.DataFrame:
    """Alias for build_features_v3 — kept for API compatibility."""
    return build_features_v3(df, indicators=indicators)
