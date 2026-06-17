# backend/tests/unit/test_market_data_service.py
"""Unit tests for market data service helpers."""
import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from app.features.market_data.service import _clean_stale_df, _is_from_last_trading_day


def _make_ohlcv(n=10, start="2024-01-01"):
    idx = pd.date_range(start, periods=n, freq="B")
    return pd.DataFrame({
        "Open":   np.linspace(100, 110, n),
        "High":   np.linspace(101, 111, n),
        "Low":    np.linspace(99,  109, n),
        "Close":  np.linspace(100, 110, n),
        "Volume": [1_000_000] * n,
    }, index=idx)


class TestCleanStaleDf:
    def test_empty_df_passthrough(self):
        result = _clean_stale_df(pd.DataFrame())
        assert result.empty

    def test_removes_negative_prices(self):
        df = _make_ohlcv(5)
        df.loc[df.index[2], "Close"] = -1.0
        df.loc[df.index[2], "Low"] = -1.0
        result = _clean_stale_df(df)
        assert (result["Close"] > 0).all()

    def test_removes_high_less_than_low(self):
        df = _make_ohlcv(5)
        df.loc[df.index[1], "High"] = 50.0
        df.loc[df.index[1], "Low"] = 99.0
        result = _clean_stale_df(df)
        assert (result["High"] >= result["Low"]).all()

    def test_removes_zero_volume_rows(self):
        df = _make_ohlcv(6)
        df.loc[df.index[3], "Volume"] = 0
        result = _clean_stale_df(df)
        assert (result["Volume"] > 0).all()

    def test_forward_fills_gaps(self):
        df = _make_ohlcv(10)
        df = df.drop(df.index[3:5])
        result = _clean_stale_df(df)
        assert not result["Close"].isna().any()

    def test_preserves_valid_data(self):
        df = _make_ohlcv(10)
        result = _clean_stale_df(df)
        assert len(result) == len(df)

    def test_handles_missing_volume_column(self):
        df = _make_ohlcv(5).drop(columns=["Volume"])
        result = _clean_stale_df(df)
        assert not result.empty

    def test_handles_exception_gracefully(self):
        bad_df = pd.DataFrame({"junk": [1, 2, 3]})
        result = _clean_stale_df(bad_df)
        assert isinstance(result, pd.DataFrame)


class TestIsFromLastTradingDay:
    def test_old_timestamp_returns_false(self):
        ts = datetime(2020, 1, 2)
        result = _is_from_last_trading_day(ts)
        assert result is False

    def test_exception_returns_false(self):
        with patch("app.features.market_data.service.now_utc", side_effect=Exception("oops")):
            result = _is_from_last_trading_day(datetime.now())
            assert result is False

    def test_recent_date_returns_bool(self):
        from app.core.time_utils import now_utc
        recent = now_utc().replace(tzinfo=None)
        result = _is_from_last_trading_day(recent)
        assert isinstance(result, bool)
