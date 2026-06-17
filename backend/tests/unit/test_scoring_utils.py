# backend/tests/unit/test_scoring_utils.py
"""Unit tests for scoring utilities."""
import pytest

from app.features.scoring.utils import apply_stalled_qrs_recovery


class TestStalledQRSRecovery:
    def test_no_stall_returns_qrs(self):
        assert apply_stalled_qrs_recovery(70.0, 85.0, 60.0) == 70.0

    def test_stall_with_strong_high_ml(self):
        # QRS near 50, ML > 80 → recovery formula
        result = apply_stalled_qrs_recovery(50.0, 85.0, 60.0)
        assert result == pytest.approx(0.8 * 85.0 + 0.2 * 60.0)

    def test_stall_with_strong_low_ml(self):
        # QRS near 50, ML < 20 → recovery formula
        result = apply_stalled_qrs_recovery(50.05, 15.0, 40.0)
        assert result == pytest.approx(0.8 * 15.0 + 0.2 * 40.0)

    def test_stall_with_weak_ml_no_recovery(self):
        # QRS near 50 but ML is also mid-range → no recovery
        result = apply_stalled_qrs_recovery(49.95, 55.0, 45.0)
        assert result == pytest.approx(49.95)

    def test_none_ml_returns_qrs_unchanged(self):
        assert apply_stalled_qrs_recovery(50.0, None, 60.0) == 50.0

    def test_not_stalled_near_boundary(self):
        # QRS = 50.2 (> 0.1 from 50) → not stalled
        result = apply_stalled_qrs_recovery(50.2, 90.0, 60.0)
        assert result == pytest.approx(50.2)

    def test_zero_values(self):
        # Edge: both zero
        result = apply_stalled_qrs_recovery(50.0, 0.0, 0.0)
        assert result == pytest.approx(0.0)  # 0.0 < 20 → recovery, 0.8*0 + 0.2*0 = 0
