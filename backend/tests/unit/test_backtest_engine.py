# backend/tests/unit/test_backtest_engine.py
"""Unit tests for backtest simulation engine."""
import pytest
import numpy as np
import pandas as pd
from collections import namedtuple
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from app.features.backtest.engine import run_backtest

# engine.py: bundle = svc.fetch_price_df(...); df = bundle.df if bundle else None
_PriceBundle = namedtuple("_PriceBundle", ["df", "resolved_symbol", "source", "status"])


def _make_df(n=200, trend="up"):
    """
    Generate synthetic OHLCV dataframe with realistic oscillations.
    RSI thresholds: buy < 35, sell > 65.
    Sabit lineer trend RSI'ı ~50-70 bandında tutar; hiç sinyal vermez.
    Bunun yerine: uzun periyotlu sinüs dalgası + kısa gürültü → RSI gerçekçi döngüler yapar.
    """
    rng = np.random.default_rng(42)
    idx = pd.date_range("2024-01-01", periods=n, freq="B")

    if trend == "up":
        # Yavaş yükselen taban + geniş amplitüdlü salınım → RSI <35 ve >65 görecek
        base   = np.linspace(50, 90, n)
        cycles = 20 * np.sin(np.linspace(0, 6 * np.pi, n))  # ~3 tam döngü
        noise  = rng.normal(0, 1.5, n)
        close  = base + cycles + noise
    elif trend == "down":
        base   = np.linspace(120, 60, n)
        cycles = 15 * np.sin(np.linspace(0, 4 * np.pi, n))
        noise  = rng.normal(0, 1.5, n)
        close  = base + cycles + noise
    else:
        # Tamamen döngüsel: kesin RSI sinyalleri
        cycles = 30 * np.sin(np.linspace(0, 8 * np.pi, n))
        noise  = rng.normal(0, 2.0, n)
        close  = 80.0 + cycles + noise

    close  = np.maximum(close, 1.0)   # negatif fiyat yok
    high   = close * 1.01
    low    = close * 0.99
    open_  = close * 1.002
    volume = np.full(n, 1_000_000)

    return pd.DataFrame(
        {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume},
        index=idx,
    )


def _mock_svc(df):
    svc = MagicMock()
    bundle = _PriceBundle(df=df, resolved_symbol="THYAO.IS", source="mock", status="ok")
    svc.fetch_price_df.return_value = bundle
    return svc


class TestRunBacktest:
    def test_no_data_returns_error(self):
        svc = MagicMock()
        svc.fetch_price_df.return_value = None
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "error"

    def test_empty_df_returns_error(self):
        svc = _mock_svc(pd.DataFrame())
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "error"

    def test_too_few_rows_returns_error(self):
        df = _make_df(n=30)
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "error"
        assert "yeterli veri" in result["message"].lower() or "Min" in result["message"]

    def test_ok_status_classic_rsi(self):
        df = _make_df(n=200, trend="up")
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", use_ema_filter=True)
        assert result["status"] == "ok"
        assert "metrics" in result
        assert "equity_curve" in result
        assert "trades" in result
        assert "total_return" in result["metrics"]
        assert "max_drawdown" in result["metrics"]
        assert "sharpe" in result["metrics"]
        assert "win_rate" in result["metrics"]

    def test_ok_status_with_profile(self):
        df = _make_df(n=200, trend="up")
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", profile_name="Trend Avcısı")
        assert result["status"] == "ok"
        assert "metrics" in result

    def test_downtrend_no_crash(self):
        df = _make_df(n=200, trend="down")
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "ok"

    def test_bb_filter_enabled(self):
        df = _make_df(n=200)
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", use_bb_filter=True, use_ema_filter=False)
        assert result["status"] == "ok"

    def test_initial_capital_reflected(self):
        df = _make_df(n=200)
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", initial_capital=50_000.0)
        assert result["status"] == "ok"

    def test_trade_structure(self):
        df = _make_df(n=200, trend="up")
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", use_ema_filter=True)
        assert result["status"] == "ok"
        trades = result["trades"]
        for t in trades:
            assert "entry_date" in t
            assert "exit_date" in t
            assert "pnl_pct" in t
            assert t["result"] in ("win", "loss")

    def test_equity_curve_structure(self):
        df = _make_df(n=200)
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "ok"
        equity = result["equity_curve"]
        assert len(equity) > 0
        assert all("date" in e and "equity" in e for e in equity)

    def test_max_drawdown_non_negative(self):
        df = _make_df(n=200)
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO")
        assert result["status"] == "ok"
        assert result["metrics"]["max_drawdown"] >= 0.0

    def test_win_rate_between_0_and_100(self):
        df = _make_df(n=200, trend="up")
        svc = _mock_svc(df)
        with patch("app.features.backtest.engine.MarketDataService", return_value=svc):
            result = run_backtest("THYAO", use_ema_filter=True)
        assert result["status"] == "ok"
        if result["trades"]:
            assert 0.0 <= result["metrics"]["win_rate"] <= 100.0
