# backend/tests/unit/test_feature_builder.py
import pytest
import pandas as pd
import numpy as np
from app.shared.feature_builder import build_ml_features

def test_build_ml_features_basic():
    # Create dummy daily and weekly data
    dates_d = pd.date_range("2026-01-01", periods=100)
    df_daily = pd.DataFrame({
        "Open": np.linspace(100, 110, 100),
        "High": np.linspace(105, 115, 100),
        "Low": np.linspace(95, 105, 100),
        "Close": np.linspace(100, 110, 100),
        "Volume": np.linspace(1000, 2000, 100)
    }, index=dates_d)

    dates_w = pd.date_range("2026-01-01", periods=20, freq="W")
    df_weekly = pd.DataFrame({
        "Open": np.linspace(100, 110, 20),
        "High": np.linspace(105, 115, 20),
        "Low": np.linspace(95, 105, 20),
        "Close": np.linspace(100, 110, 20),
        "Volume": np.linspace(5000, 10000, 20)
    }, index=dates_w)

    feature_names = ["close", "rsi14_x", "ema20", "atr_pct", "vol_ratio20"]
    feats = build_ml_features(df_daily, df_weekly, feature_names)

    assert "_coverage" in feats
    assert feats["close"] == pytest.approx(110.0)
    assert "ema20" in feats
    assert "rsi14_x" in feats

def test_build_ml_features_empty():
    df_empty = pd.DataFrame()
    feature_names = ["close", "rsi14_x"]
    feats = build_ml_features(df_empty, df_empty, feature_names)
    
    assert feats["close"] == 0.0
    assert feats["rsi14_x"] == 0.0
    # Coverage is 1.0 because keys are present (even if values are 0.0)
    assert feats["_coverage"] == 1.0

def test_feature_builder_comprehensive():
    # Large dataset to satisfy all window requirements
    dates = pd.date_range("2025-01-01", periods=300)
    df = pd.DataFrame({
        "Open": np.random.randn(300).cumsum() + 100,
        "High": np.random.randn(300).cumsum() + 110,
        "Low": np.random.randn(300).cumsum() + 90,
        "Close": np.random.randn(300).cumsum() + 100,
        "Volume": np.random.randint(1000, 5000, 300)
    }, index=dates)
    
    # ensure high >= low
    df["High"] = df[["High", "Low", "Close", "Open"]].max(axis=1)
    df["Low"] = df[["High", "Low", "Close", "Open"]].min(axis=1)

    feature_names = [
        "ret_1d", "RET_T3", "RET_T10", "mom_5", "MAXDD_T3", "MAXDD_T10",
        "ema5", "ema20", "ema50", "ema200", "ema5_slope", "ema50_slope", "ema200_slope",
        "rsi14_x", "rsi14_y", "rsi14_z", "atr_pct", "atr_pct_z", "bb_width_pct",
        "stoch_k", "stoch_d", "macd_line", "macd_signal", "macd_hist", "mfi14",
        "adx14", "plus_di", "minus_di", "obv", "vol_ratio20", "vol_drop_30_10",
        "squeeze_kc", "to_peak60_pct", "inside_bar", "nr7", "gap_type", "pocket_pivot",
        "fib_zone_prox", "triangle_score", "wedge_score", "vcp_score", "sr_density", "sr_dist_pct",
        "flag_score", "hs_score", "cwh_score", "channel_score"
    ]
    
    feats = build_ml_features(df, df.resample('W-MON').last(), feature_names)
    assert feats["_coverage"] == 1.0

def test_feature_builder_helpers():
    from app.shared.feature_builder import _safe_div, _pct, _num
    assert _safe_div(10, 2) == 5.0
    assert np.isnan(_safe_div(10, 0))
    assert _pct(110, 100) == pytest.approx(10.0)
    assert _num(pd.Series(["1.5", "2.5"])).iloc[0] == 1.5
