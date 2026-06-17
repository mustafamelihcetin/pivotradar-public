# backend/tests/unit/test_evaluator.py
"""Unit tests — prediction evaluator (_compute_hit_status)"""
import pytest


@pytest.mark.parametrize("direction,entry,target,max_high,min_low,target_hit_input,expected_status", [
    # Bullish: closing price hit target (target_hit=True signals close-based hit)
    ("bullish", 100.0, 110.0, 112.0, 98.0,  True,  "target_hit"),
    # Bullish: near miss (≥80% of move, no close-based hit)
    ("bullish", 100.0, 110.0, 108.5, 98.0,  False, "near_miss"),
    # Bullish: partial (≥50% of move)
    ("bullish", 100.0, 110.0, 105.0, 98.0,  False, "partial"),
    # Bullish: miss
    ("bullish", 100.0, 110.0, 103.0, 98.0,  False, "miss"),
    # Bearish: closing price hit target
    ("bearish", 100.0,  90.0, 102.0, 88.0,  True,  "target_hit"),
    # Bearish: near miss
    ("bearish", 100.0,  90.0, 102.0, 91.5,  False, "near_miss"),
    # Bearish: miss
    ("bearish", 100.0,  90.0, 102.0, 97.0,  False, "miss"),
])
def test_compute_hit_status(direction, entry, target, max_high, min_low, target_hit_input, expected_status):
    from app.features.scoring.ml.evaluator import _compute_hit_status
    status, accuracy = _compute_hit_status(
        target_hit=target_hit_input,
        direction=direction,
        entry_price=entry,
        target_price=target,
        max_high=max_high,
        min_low=min_low,
    )
    assert status == expected_status, f"Expected {expected_status}, got {status} (accuracy={accuracy:.1f}%)"


def test_compute_hit_status_accuracy_range():
    from app.features.scoring.ml.evaluator import _compute_hit_status
    _, acc = _compute_hit_status(
        target_hit=False, direction="bullish",
        entry_price=100.0, target_price=120.0,
        max_high=110.0, min_low=98.0,
    )
    assert 0.0 <= acc <= 200.0, "Accuracy should be a reasonable percentage"


def test_compute_hit_status_zero_move():
    """When entry == target (zero expected move), should not crash."""
    from app.features.scoring.ml.evaluator import _compute_hit_status
    status, acc = _compute_hit_status(
        target_hit=False, direction="bullish",
        entry_price=100.0, target_price=100.0,
        max_high=101.0, min_low=99.0,
    )
    assert isinstance(status, str)
    assert acc == pytest.approx(0.0)


class TestComputeDirectionalAccuracy:
    def _call(self, **kw):
        from app.features.scoring.ml.evaluator import _compute_directional_accuracy
        return _compute_directional_accuracy(**kw)

    def test_bullish_hit_positive_return(self):
        dh, pred, dev = self._call(direction="bullish", entry_price=100, target_price=110, actual_return_pct=5.0)
        assert dh is True
        assert pred == pytest.approx(10.0, rel=1e-3)

    def test_bullish_miss_negative_return(self):
        dh, pred, dev = self._call(direction="bullish", entry_price=100, target_price=110, actual_return_pct=-2.0)
        assert dh is False

    def test_bearish_hit_negative_return(self):
        dh, pred, dev = self._call(direction="bearish", entry_price=100, target_price=90, actual_return_pct=-5.0)
        assert dh is True
        assert pred == pytest.approx(10.0, rel=1e-3)

    def test_bearish_miss_positive_return(self):
        dh, pred, dev = self._call(direction="bearish", entry_price=100, target_price=90, actual_return_pct=3.0)
        assert dh is False

    def test_zero_entry_price(self):
        dh, pred, dev = self._call(direction="bullish", entry_price=0, target_price=110, actual_return_pct=5.0)
        assert dh is False

    def test_neutral_direction(self):
        dh, pred, dev = self._call(direction="neutral", entry_price=100, target_price=110, actual_return_pct=5.0)
        assert dh is False

    def test_no_target_price(self):
        dh, pred, dev = self._call(direction="bullish", entry_price=100, target_price=0, actual_return_pct=5.0)
        assert dh is True
        assert pred == 0.0

    def test_deviation_magnitude(self):
        dh, pred, dev = self._call(direction="bullish", entry_price=100, target_price=110, actual_return_pct=3.0)
        assert dev == pytest.approx(7.0, abs=0.5)


class TestStatusWeights:
    def test_target_hit_is_highest(self):
        from app.features.scoring.ml.evaluator import _STATUS_WEIGHTS
        assert _STATUS_WEIGHTS["target_hit"] >= max(
            _STATUS_WEIGHTS["near_miss"],
            _STATUS_WEIGHTS["partial"],
            _STATUS_WEIGHTS["miss"],
        )

    def test_miss_is_zero(self):
        from app.features.scoring.ml.evaluator import _STATUS_WEIGHTS
        assert _STATUS_WEIGHTS["miss"] == 0.0
