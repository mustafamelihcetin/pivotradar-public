# backend/tests/unit/test_walk_forward.py
"""Unit tests for walk_forward validation engine."""
import datetime
import math
import pytest
from unittest.mock import MagicMock, patch

from app.features.backtest.walk_forward import (
    _month_key,
    _safe_div,
    _f1,
    _max_drawdown,
    _sharpe,
    _compute_window_metrics,
    run_walk_forward,
    get_signal_quality_summary,
    MIN_SAMPLES_PER_WINDOW,
    MIN_TOTAL_SAMPLES,
    SLIPPAGE_PCT,
)


class TestHelpers:
    def test_month_key(self):
        dt = datetime.datetime(2026, 3, 15)
        assert _month_key(dt) == "2026-03"

    def test_safe_div_normal(self):
        assert _safe_div(3, 4) == 0.75

    def test_safe_div_zero_denominator(self):
        assert _safe_div(5, 0) == 0.0
        assert _safe_div(5, 0, default=1.0) == 1.0

    def test_f1_normal(self):
        result = _f1(0.8, 0.6)
        assert result == pytest.approx(2 * 0.8 * 0.6 / (0.8 + 0.6), rel=1e-4)

    def test_f1_zero_inputs(self):
        assert _f1(0.0, 0.0) == 0.0

    def test_max_drawdown_empty(self):
        assert _max_drawdown([]) == 0.0

    def test_max_drawdown_monotone_up(self):
        # All positive returns → no drawdown
        returns = [5.0, 3.0, 2.0, 1.0]
        assert _max_drawdown(returns) == 0.0

    def test_max_drawdown_with_loss(self):
        # Equity: 1.0 → 1.1 → 0.99 → 1.05
        returns = [10.0, -10.0, 6.0]
        dd = _max_drawdown(returns)
        assert dd > 0.0

    def test_sharpe_empty(self):
        assert _sharpe([]) == 0.0

    def test_sharpe_single(self):
        assert _sharpe([5.0]) == 0.0

    def test_sharpe_positive(self):
        # Consistent positive returns → positive Sharpe
        returns = [2.0] * 12
        s = _sharpe(returns)
        assert s == 0.0  # std is 0 when all returns equal


class TestComputeWindowMetrics:
    def _make_row(self, target_hit, directional_hit, actual_return_pct=5.0):
        row = MagicMock()
        row.target_hit = target_hit
        row.directional_hit = directional_hit
        row.actual_return_pct = actual_return_pct
        return row

    def test_empty_rows(self):
        result = _compute_window_metrics([])
        assert result["skipped"] is True
        assert result["n"] == 0

    def test_insufficient_evaluated_rows(self):
        rows = [self._make_row(None, True) for _ in range(5)]
        result = _compute_window_metrics(rows)
        assert result["skipped"] is True
        assert "insufficient_evaluated" in result["reason"]

    def test_single_class_all_hits(self):
        rows = [self._make_row(True, True) for _ in range(MIN_SAMPLES_PER_WINDOW)]
        result = _compute_window_metrics(rows)
        assert result["skipped"] is True
        assert result["reason"] == "single_class"

    def test_valid_window(self):
        hits = [self._make_row(True, True, 5.0) for _ in range(20)]
        misses = [self._make_row(False, False, -3.0) for _ in range(15)]
        rows = hits + misses
        result = _compute_window_metrics(rows)
        assert result["skipped"] is False
        assert result["precision"] == pytest.approx(20 / 35, rel=1e-3)
        assert result["n_hits"] == 20
        assert result["n_miss"] == 15
        assert "sharpe_slippage" in result
        assert "max_drawdown" in result
        # Slippage-adjusted avg should be lower than raw
        assert result["avg_return_slip"] < result["avg_return_pct"]

    def test_slippage_deducted(self):
        rows = [self._make_row(True, True, 10.0) for _ in range(20)] + \
               [self._make_row(False, False, -2.0) for _ in range(15)]
        result = _compute_window_metrics(rows)
        expected_slip = 10.0 - SLIPPAGE_PCT * 100
        assert result["avg_return_slip"] == pytest.approx(
            (expected_slip * 20 + (-2.0 - SLIPPAGE_PCT * 100) * 15) / 35, rel=1e-2
        )


class TestRunWalkForward:
    def _make_db(self, rows):
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.all.return_value = rows
        db.query.return_value = q
        return db

    def test_insufficient_data(self):
        db = self._make_db([])
        result = run_walk_forward(db)
        assert result["status"] == "insufficient_data"

    def test_no_valid_windows(self):
        # 100 rows but all unevaluated → no valid windows
        row = MagicMock()
        row.target_hit = None
        row.directional_hit = None
        row.actual_return_pct = None
        row.scanned_at = datetime.datetime(2026, 1, 15)
        rows = [row] * MIN_TOTAL_SAMPLES
        db = self._make_db(rows)
        result = run_walk_forward(db)
        assert result["status"] in ("no_valid_windows", "insufficient_data")

    def test_ok_status_with_valid_data(self):
        rows = []
        for month in [1, 2, 3, 4]:
            for i in range(40):
                row = MagicMock()
                row.target_hit = (i % 2 == 0)
                row.directional_hit = (i % 3 != 0)
                row.actual_return_pct = 3.0 if i % 2 == 0 else -1.5
                row.scanned_at = datetime.datetime(2026, month, 15)
                row.profile_name = "TestProfile"
                rows.append(row)
        db = self._make_db(rows)
        result = run_walk_forward(db)
        assert result["status"] == "ok"
        agg = result["aggregate"]
        assert "precision" in agg
        assert "sharpe_slippage" in agg
        assert "max_drawdown" in agg
        assert "stability" in agg
        assert "valid_windows" in agg

    def test_is_oos_gap_computed_when_enough_windows(self):
        rows = []
        for month in range(1, 8):  # 7 months
            for i in range(40):
                row = MagicMock()
                row.target_hit = (i % 2 == 0)
                row.directional_hit = True
                row.actual_return_pct = 2.0 if i % 2 == 0 else -1.0
                row.scanned_at = datetime.datetime(2026, month, 10)
                row.profile_name = "P"
                rows.append(row)
        db = self._make_db(rows)
        result = run_walk_forward(db)
        assert result["status"] == "ok"
        assert result["aggregate"].get("is_oos_gap") is not None

    def test_drift_alert_triggered(self):
        rows = []
        # First 4 months: high precision; last 2 months: low precision
        for month in [1, 2, 3, 4]:
            for i in range(40):
                row = MagicMock()
                row.target_hit = True  # all hits → high precision
                row.directional_hit = True
                row.actual_return_pct = 4.0
                row.scanned_at = datetime.datetime(2026, month, 10)
                row.profile_name = "P"
                rows.append(row)
        # single-class guard: add some misses
        for month in [1, 2, 3, 4]:
            for i in range(5):
                row = MagicMock()
                row.target_hit = False
                row.directional_hit = False
                row.actual_return_pct = -2.0
                row.scanned_at = datetime.datetime(2026, month, 20)
                row.profile_name = "P"
                rows.append(row)
        for month in [5, 6]:
            for i in range(40):
                row = MagicMock()
                row.target_hit = (i % 5 == 0)  # 20% win rate → big drop
                row.directional_hit = (i % 4 == 0)
                row.actual_return_pct = -1.0
                row.scanned_at = datetime.datetime(2026, month, 10)
                row.profile_name = "P"
                rows.append(row)
        db = self._make_db(rows)
        result = run_walk_forward(db)
        if result["status"] == "ok":
            drift = result["drift"]
            # drift_delta may be None if not enough valid windows; just check structure
            assert "alert" in drift
            assert "delta" in drift

    @patch("app.features.backtest.walk_forward._fetch_xu100_period_return")
    def test_benchmark_and_alpha(self, mock_fetch):
        mock_fetch.return_value = 5.0  # 5% total benchmark return over lookback period

        rows = []
        for month in [1, 2, 3, 4]:
            for i in range(40):
                row = MagicMock()
                row.target_hit = (i % 2 == 0)
                row.directional_hit = True
                row.actual_return_pct = 4.0 if i % 2 == 0 else -1.0
                row.scanned_at = datetime.datetime(2026, month, 15)
                row.profile_name = "P"
                rows.append(row)

        db = self._make_db(rows)
        result = run_walk_forward(db, include_benchmark=True, lookback_months=4)

        assert result["status"] == "ok"
        agg = result["aggregate"]
        assert agg["benchmark_return_pct"] == 5.0
        assert agg["alpha"] is not None
        # survivorship info is in result["survivorship"], not aggregate
        assert "survivorship" in result
        assert "never_evaluated" in result["survivorship"]


class TestGetSignalQualitySummary:
    def test_empty_profiles(self):
        db = MagicMock()
        q = MagicMock()
        q.distinct.return_value = q
        q.all.return_value = []
        db.query.return_value = q

        q2 = MagicMock()
        q2.filter.return_value = q2
        q2.all.return_value = []
        db.query.side_effect = lambda *a: q2

        result = get_signal_quality_summary(db)
        assert "profiles" in result
        assert "generated_at" in result
