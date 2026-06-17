# tests/unit/test_ohlcv_utils.py
"""Unit tests for OHLCV normalization and indicator utilities."""
import numpy as np
import pandas as pd
import pytest

from app.shared.ohlcv import (
    normalize_df_ohlcv,
    ensure_datetime_index,
    compute_rsi_wilder,
    compute_atr_wilder,
)


def _make_df(n=30):
    dates = pd.date_range("2024-01-01", periods=n)
    return pd.DataFrame({
        "Open": np.linspace(100, 110, n),
        "High": np.linspace(102, 112, n),
        "Low": np.linspace(98, 108, n),
        "Close": np.linspace(101, 111, n),
        "Volume": np.ones(n) * 1_000_000,
    }, index=dates)


class TestNormalizeDfOHLCV:
    def test_standard_columns_pass_through(self):
        df = _make_df()
        out = normalize_df_ohlcv(df)
        assert "Close" in out.columns
        assert len(out) == 30

    def test_none_returns_empty(self):
        out = normalize_df_ohlcv(None)
        assert out.empty

    def test_empty_returns_empty(self):
        out = normalize_df_ohlcv(pd.DataFrame())
        assert out.empty

    def test_lowercase_columns_normalized(self):
        df = pd.DataFrame({
            "open": [1.0], "high": [2.0], "low": [0.5],
            "close": [1.5], "volume": [1000.0]
        })
        out = normalize_df_ohlcv(df)
        assert "Close" in out.columns

    def test_multiindex_columns_flattened(self):
        arrays = [["Close", "Volume"], ["THYAO.IS", "THYAO.IS"]]
        tuples = list(zip(*arrays))
        idx = pd.MultiIndex.from_tuples(tuples)
        df = pd.DataFrame([[100.0, 1000.0]], columns=idx)
        out = normalize_df_ohlcv(df)
        assert not out.empty

    def test_missing_volume_defaults_to_zero(self):
        df = pd.DataFrame({
            "close": [1.0, 2.0], "open": [0.9, 1.9],
            "high": [1.1, 2.1], "low": [0.8, 1.8]
        })
        out = normalize_df_ohlcv(df)
        assert "Volume" in out.columns
        assert (out["Volume"] == 0.0).all()

    def test_contains_match_works(self):
        # column named 'close_THYAO.IS' should still be picked as Close
        df = pd.DataFrame({
            "close_thyao.is": [101.0, 102.0],
            "open_thyao.is": [100.0, 101.0],
            "high_thyao.is": [103.0, 104.0],
            "low_thyao.is": [99.0, 100.0],
            "volume_thyao.is": [5000.0, 6000.0],
        })
        out = normalize_df_ohlcv(df)
        assert "Close" in out.columns


class TestEnsureDatetimeIndex:
    def test_already_datetime_unchanged(self):
        df = _make_df()
        out = ensure_datetime_index(df)
        assert isinstance(out.index, pd.DatetimeIndex)

    def test_date_column_becomes_index(self):
        df = pd.DataFrame({
            "date": ["2024-01-01", "2024-01-02"],
            "Close": [100.0, 101.0]
        })
        out = ensure_datetime_index(df)
        assert isinstance(out.index, pd.DatetimeIndex)

    def test_none_returns_none(self):
        assert ensure_datetime_index(None) is None

    def test_empty_returns_empty(self):
        df = pd.DataFrame()
        out = ensure_datetime_index(df)
        assert out.empty


class TestComputeRsiWilder:
    def test_returns_series_of_same_length(self):
        close = pd.Series(np.linspace(100, 130, 50))
        rsi = compute_rsi_wilder(close)
        assert len(rsi) == 50

    def test_values_between_0_and_100(self):
        close = pd.Series(np.linspace(100, 130, 50))
        rsi = compute_rsi_wilder(close)
        valid = rsi.dropna()
        assert (valid >= 0).all() and (valid <= 100).all()

    def test_too_short_series_returns_nan(self):
        close = pd.Series([100.0, 101.0])
        rsi = compute_rsi_wilder(close, period=14)
        assert rsi.isna().all()

    def test_none_returns_nan_series(self):
        rsi = compute_rsi_wilder(None)
        assert len(rsi) == 0 or rsi.isna().all()


class TestComputeAtrWilder:
    def test_returns_series_of_same_length(self):
        df = _make_df(50)
        atr = compute_atr_wilder(df)
        assert len(atr) == 50

    def test_atr_nonnegative(self):
        df = _make_df(50)
        atr = compute_atr_wilder(df)
        valid = atr.dropna()
        assert (valid >= 0).all()

    def test_empty_df_returns_empty(self):
        atr = compute_atr_wilder(pd.DataFrame())
        assert len(atr) == 0 or atr.isna().all()

    def test_too_short_df_returns_nan(self):
        df = _make_df(5)
        atr = compute_atr_wilder(df, period=14)
        valid = atr.dropna()
        assert len(valid) == 0
