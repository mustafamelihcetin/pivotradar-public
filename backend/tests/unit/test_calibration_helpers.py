# backend/tests/unit/test_calibration_helpers.py
"""Unit tests for calibration pure helpers."""
import pytest
from unittest.mock import MagicMock, patch
import datetime

from app.features.admin.calibration import (
    _directional_hit,
    _magnitude_deviation,
    run_calibration,
)


class TestDirectionalHit:
    def test_bullish_positive_return(self):
        assert _directional_hit("bullish", 2.5) is True

    def test_bullish_negative_return(self):
        assert _directional_hit("bullish", -1.0) is False

    def test_bullish_zero_return(self):
        assert _directional_hit("bullish", 0.0) is False

    def test_bearish_negative_return(self):
        assert _directional_hit("bearish", -3.0) is True

    def test_bearish_positive_return(self):
        assert _directional_hit("bearish", 1.5) is False

    def test_bearish_zero_return(self):
        assert _directional_hit("bearish", 0.0) is False

    def test_neutral_direction(self):
        assert _directional_hit("neutral", 5.0) is False

    def test_unknown_direction(self):
        assert _directional_hit("sideways", 1.0) is False


class TestMagnitudeDeviation:
    def test_bullish_on_target(self):
        # entry=100, target=110 → pred=10%, actual=10% → deviation=0
        pred, dev = _magnitude_deviation("bullish", 100.0, 110.0, 10.0)
        assert pred == pytest.approx(10.0, rel=1e-3)
        assert dev == pytest.approx(0.0, abs=0.01)

    def test_bullish_overshot(self):
        # entry=100, target=110 → pred=10%, actual=15% → deviation=5
        pred, dev = _magnitude_deviation("bullish", 100.0, 110.0, 15.0)
        assert pred == pytest.approx(10.0, rel=1e-3)
        assert dev == pytest.approx(5.0, abs=0.1)

    def test_bearish_on_target(self):
        # entry=100, target=90 → pred=10%, actual=-10% → deviation≈0
        pred, dev = _magnitude_deviation("bearish", 100.0, 90.0, -10.0)
        assert pred == pytest.approx(10.0, rel=1e-3)
        assert dev == pytest.approx(0.0, abs=0.01)

    def test_bearish_wrong_direction(self):
        # entry=100, target=90 → pred=10%, actual=+5% → large deviation
        pred, dev = _magnitude_deviation("bearish", 100.0, 90.0, 5.0)
        assert pred == pytest.approx(10.0, rel=1e-3)
        assert dev > 10.0  # expected 10%, got -5% (bearish normalized to -5%) → 15% deviation

    def test_zero_entry_price(self):
        pred, dev = _magnitude_deviation("bullish", 0.0, 110.0, 5.0)
        assert pred == 0.0
        assert dev == 5.0

    def test_no_target_price(self):
        pred, dev = _magnitude_deviation("bullish", 100.0, 0.0, 5.0)
        assert pred == 0.0

    def test_neutral_direction(self):
        pred, dev = _magnitude_deviation("neutral", 100.0, 110.0, 5.0)
        assert pred == 0.0
        assert dev == 0.0


class TestRunCalibration:
    def _make_db(self, rows):
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.limit.return_value = q
        q.all.return_value = rows
        db.query.return_value = q
        return db

    def test_no_pending_rows(self):
        db = self._make_db([])
        with patch("app.features.admin.calibration.MarketDataService"):
            with patch("app.features.admin.utils.add_business_days", return_value=datetime.date(2025, 1, 1)):
                result = run_calibration(db)
        assert result["evaluated"] == 0
        assert "message" in result

    def test_returns_evaluated_count(self):
        import pandas as pd
        import numpy as np

        row = MagicMock()
        row.symbol = "THYAO"
        row.target_direction = "bullish"
        row.target_price = 110.0
        row.close_price = 100.0
        row.predicted_days = 14
        row.scan_date = datetime.date(2026, 1, 1)
        row.scanned_at = datetime.datetime(2026, 1, 1)

        idx = pd.date_range("2026-01-01", periods=20, freq="B")
        df = pd.DataFrame({
            "Close": np.linspace(100, 115, 20),
            "High":  np.linspace(101, 116, 20),
            "Low":   np.linspace(99, 114, 20),
            "Open":  np.linspace(100, 115, 20),
            "Volume": [1000] * 20,
        }, index=idx)

        mock_svc = MagicMock()
        mock_svc.fetch_price_df.return_value = (df, "yfinance", "ok")

        eval_date = datetime.date(2026, 1, 20)

        with patch("app.features.admin.calibration.MarketDataService", return_value=mock_svc):
            with patch("app.features.admin.utils.add_business_days", return_value=eval_date):
                result = run_calibration(db=self._make_db([row]))

        assert "evaluated" in result
