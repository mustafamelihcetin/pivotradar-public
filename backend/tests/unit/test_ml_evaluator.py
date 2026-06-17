# tests/unit/test_ml_evaluator.py
"""Unit tests for the ML evaluator — _compute_hit_status and _compute_directional_accuracy."""
import pytest
from app.features.scoring.ml.evaluator import _compute_hit_status, _compute_directional_accuracy


class TestComputeHitStatus:
    def test_target_hit_bullish(self):
        status, acc = _compute_hit_status(True, "bullish", 100.0, 110.0, 115.0, 95.0)
        assert status == "target_hit"
        assert acc >= 100.0

    def test_near_miss_bullish(self):
        # achieved = 8.5 / 10 = 85%
        status, acc = _compute_hit_status(False, "bullish", 100.0, 110.0, 108.5, 95.0)
        assert status == "near_miss"
        assert 80 <= acc < 100

    def test_partial_bullish(self):
        # achieved = 6 / 10 = 60%
        status, acc = _compute_hit_status(False, "bullish", 100.0, 110.0, 106.0, 95.0)
        assert status == "partial"
        assert 50 <= acc < 80

    def test_miss_bullish(self):
        # achieved = 2 / 10 = 20%
        status, acc = _compute_hit_status(False, "bullish", 100.0, 110.0, 102.0, 95.0)
        assert status == "miss"
        assert acc < 50

    def test_target_hit_bearish(self):
        status, acc = _compute_hit_status(True, "bearish", 100.0, 90.0, 105.0, 85.0)
        assert status == "target_hit"

    def test_near_miss_bearish(self):
        # achieved = 8.5 / 10 = 85%
        status, acc = _compute_hit_status(False, "bearish", 100.0, 90.0, 105.0, 91.5)
        assert status == "near_miss"

    def test_zero_exp_move(self):
        # target_price == entry_price → exp_move 0 → accuracy 0
        status, acc = _compute_hit_status(False, "bullish", 100.0, 100.0, 105.0, 95.0)
        assert status == "miss"
        assert acc == 0.0

    def test_none_direction_returns_miss(self):
        status, acc = _compute_hit_status(False, "neutral", 100.0, 110.0, 112.0, 90.0)
        assert status == "miss"


class TestComputeDirectionalAccuracy:
    def test_bullish_correct_direction(self):
        hit, pred_ret, mag_dev = _compute_directional_accuracy("bullish", 100.0, 110.0, 5.0)
        assert hit is True
        assert pred_ret == pytest.approx(10.0)
        assert mag_dev == pytest.approx(5.0)  # |10 - 5|

    def test_bullish_wrong_direction(self):
        hit, pred_ret, mag_dev = _compute_directional_accuracy("bullish", 100.0, 110.0, -3.0)
        assert hit is False

    def test_bearish_correct_direction(self):
        hit, pred_ret, mag_dev = _compute_directional_accuracy("bearish", 100.0, 90.0, -5.0)
        assert hit is True
        assert abs(pred_ret) == pytest.approx(10.0)

    def test_bearish_wrong_direction(self):
        hit, pred_ret, mag_dev = _compute_directional_accuracy("bearish", 100.0, 90.0, 3.0)
        assert hit is False

    def test_zero_entry_price(self):
        # entry=0 → pred_ret=0 → direction check returns False (no crash is the goal)
        hit, pred_ret, mag_dev = _compute_directional_accuracy("bullish", 0.0, 10.0, 5.0)
        assert pred_ret == 0.0
