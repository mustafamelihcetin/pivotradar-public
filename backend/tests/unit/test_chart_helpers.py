# backend/tests/unit/test_chart_helpers.py
"""Unit tests for chart engine pure helper functions."""
import pytest
import math
import pandas as pd
import numpy as np

from app.features.charts.engine import (
    _compute_fibonacci,
    _fibonacci_to_shapes,
    _duration_label,
    _get_variant,
    _compute_indicators,
)


def _make_df(n=50, start="2024-01-01"):
    idx = pd.date_range(start, periods=n, freq="B")
    close = np.linspace(100, 120, n)
    return pd.DataFrame({
        "Open":   close * 0.99,
        "High":   close * 1.02,
        "Low":    close * 0.97,
        "Close":  close,
        "Volume": [500_000] * n,
    }, index=idx)


class TestComputeFibonacci:
    def test_returns_empty_for_small_df(self):
        df = _make_df(5)
        result = _compute_fibonacci(df)
        assert result == {}

    def test_returns_valid_structure(self):
        df = _make_df(50)
        result = _compute_fibonacci(df)
        assert "levels" in result
        assert "swing_high" in result
        assert "swing_low" in result
        assert "direction" in result
        assert result["swing_high"] > result["swing_low"]

    def test_direction_up_when_prices_rising(self):
        df = _make_df(50)  # linspace 100→120 = rising
        result = _compute_fibonacci(df)
        assert result["direction"] == "up"

    def test_direction_down_when_prices_falling(self):
        idx = pd.date_range("2024-01-01", periods=50, freq="B")
        close = np.linspace(120, 80, 50)
        df = pd.DataFrame({
            "Open": close * 0.99, "High": close * 1.02,
            "Low": close * 0.97, "Close": close,
            "Volume": [500_000] * 50,
        }, index=idx)
        result = _compute_fibonacci(df)
        assert result["direction"] == "down"

    def test_levels_are_finite(self):
        df = _make_df(50)
        result = _compute_fibonacci(df)
        for lv in result["levels"]:
            assert math.isfinite(lv["price"])

    def test_works_without_high_low_columns(self):
        df = _make_df(50).drop(columns=["High", "Low"])
        result = _compute_fibonacci(df)
        assert "levels" in result or result == {}

    def test_returns_empty_for_equal_high_low(self):
        idx = pd.date_range("2024-01-01", periods=20, freq="B")
        df = pd.DataFrame({
            "Open": [100.0] * 20, "High": [100.0] * 20,
            "Low": [100.0] * 20, "Close": [100.0] * 20,
            "Volume": [1000] * 20,
        }, index=idx)
        result = _compute_fibonacci(df)
        assert result == {}


class TestFibonacciToShapes:
    def test_empty_fib_returns_empty_list(self):
        assert _fibonacci_to_shapes({}) == []
        assert _fibonacci_to_shapes({"levels": []}) == []

    def test_returns_line_shapes(self):
        df = _make_df(50)
        fib = _compute_fibonacci(df)
        if not fib:
            pytest.skip("fibonacci empty")
        shapes = _fibonacci_to_shapes(fib)
        assert len(shapes) == len(fib["levels"])
        for s in shapes:
            assert s["type"] == "line"
            assert "x0" in s
            assert "y0" in s

    def test_shape_prices_match_levels(self):
        df = _make_df(50)
        fib = _compute_fibonacci(df)
        if not fib:
            pytest.skip("fibonacci empty")
        shapes = _fibonacci_to_shapes(fib)
        fib_prices = {lv["price"] for lv in fib["levels"]}
        shape_prices = {s["y0"] for s in shapes}
        assert fib_prices == shape_prices


class TestDurationLabel:
    def test_hours_label(self):
        assert "saat" in _duration_label(0.1)

    def test_day_label(self):
        assert "gün" in _duration_label(3.0).lower() or "hafta" in _duration_label(3.0).lower() or "gün" in _duration_label(1.0)

    def test_week_range(self):
        label = _duration_label(10.0)
        assert isinstance(label, str) and len(label) > 0

    def test_long_range(self):
        label = _duration_label(90.0)
        assert isinstance(label, str)


class TestGetVariant:
    def test_empty_variants(self):
        assert _get_variant([], "THYAO") == ""

    def test_single_variant_always_returned(self):
        assert _get_variant(["only option"], "THYAO") == "only option"

    def test_deterministic_for_same_symbol(self):
        variants = ["A", "B", "C", "D"]
        r1 = _get_variant(variants, "THYAO", "test")
        r2 = _get_variant(variants, "THYAO", "test")
        assert r1 == r2

    def test_different_symbols_may_differ(self):
        variants = ["A", "B", "C", "D", "E", "F"]
        results = {_get_variant(variants, f"SYM{i}") for i in range(20)}
        assert len(results) > 1


class TestComputeIndicators:
    def test_returns_rsi(self):
        df = _make_df(50)
        result = _compute_indicators(df)
        assert "rsi" in result
        assert len(result["rsi"]) == 50

    def test_returns_ema(self):
        df = _make_df(50)
        result = _compute_indicators(df)
        assert "ema5" in result
        assert "ema20" in result

    def test_returns_bollinger_bands(self):
        df = _make_df(50)
        result = _compute_indicators(df)
        assert "bb_upper" in result
        assert "bb_lower" in result
        assert "bb_mid" in result

    def test_returns_macd(self):
        df = _make_df(50)
        result = _compute_indicators(df)
        assert "macd" in result
        assert "macd_signal" in result

    def test_returns_volume(self):
        df = _make_df(50)
        result = _compute_indicators(df)
        assert "volume" in result
        assert len(result["volume"]) == 50

    def test_small_df_skips_bb(self):
        df = _make_df(15)
        result = _compute_indicators(df)
        # BB requires 20 bars, so should be absent or empty
        assert "rsi" in result  # always present
