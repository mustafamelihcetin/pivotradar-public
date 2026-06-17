# backend/tests/unit/test_ml_calib_helpers.py
"""Unit tests for ML calibration pure helpers."""
import pytest
import numpy as np
import datetime

from app.features.scoring.ml.ml_calib import (
    _to01,
    _from01,
    _ece,
    _temporal_weights,
    _safe_filename,
    fit_isotonic,
)


class TestTo01:
    def test_converts_percentage_to_probability(self):
        arr = _to01([0, 50, 100])
        np.testing.assert_allclose(arr, [0.0, 0.5, 1.0], atol=1e-6)

    def test_clips_below_zero(self):
        arr = _to01([-10, 0, 50])
        assert arr[0] == 0.0

    def test_clips_above_100(self):
        arr = _to01([110, 100, 50])
        assert arr[0] == 1.0

    def test_single_value(self):
        arr = _to01([75])
        assert arr[0] == pytest.approx(0.75)


class TestFrom01:
    def test_converts_probability_to_percentage(self):
        arr = _from01([0.0, 0.5, 1.0])
        np.testing.assert_allclose(arr, [0.0, 50.0, 100.0], atol=1e-6)

    def test_clips_above_100(self):
        arr = _from01([1.1])
        assert arr[0] == 100.0

    def test_clips_below_zero(self):
        arr = _from01([-0.1])
        assert arr[0] == 0.0

    def test_roundtrip(self):
        original = [20, 45, 70, 90]
        result = _from01(_to01(original))
        np.testing.assert_allclose(result, original, atol=1e-6)


class TestEce:
    def test_perfect_calibration_is_zero(self):
        # Perfect: p_hat = y_true
        y = np.array([0.1, 0.3, 0.5, 0.7, 0.9])
        p = y.copy()
        ece = _ece(y, p)
        assert ece < 0.05

    def test_poor_calibration_is_nonzero(self):
        # All predictions say 0.9 but half are true (0.5 base rate)
        y = np.array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0], dtype=float)
        p = np.full(10, 0.9)
        ece = _ece(y, p)
        assert ece > 0.3

    def test_returns_float(self):
        y = np.array([0, 1, 0, 1])
        p = np.array([0.3, 0.7, 0.3, 0.7])
        ece = _ece(y, p)
        assert isinstance(ece, float)


class TestTemporalWeights:
    def test_recent_date_higher_weight(self):
        now = datetime.datetime.utcnow()
        recent = now - datetime.timedelta(days=1)
        old = now - datetime.timedelta(days=200)
        weights = _temporal_weights([recent, old])
        assert weights[0] > weights[1]

    def test_none_gets_default_weight(self):
        weights = _temporal_weights([None])
        assert weights[0] == 0.5

    def test_string_iso_format(self):
        now = datetime.datetime.utcnow()
        iso_str = (now - datetime.timedelta(days=10)).isoformat()
        weights = _temporal_weights([iso_str])
        assert 0.0 < weights[0] <= 1.0

    def test_invalid_string_gets_default(self):
        weights = _temporal_weights(["not-a-date"])
        assert weights[0] == 0.5

    def test_all_recent_all_high(self):
        now = datetime.datetime.utcnow()
        today = [now - datetime.timedelta(hours=i) for i in range(5)]
        weights = _temporal_weights(today)
        assert all(w > 0.9 for w in weights)


class TestSafeFilename:
    def test_lowercases(self):
        assert _safe_filename("SomeProfile") == "someprofile"

    def test_replaces_spaces(self):
        assert _safe_filename("My Profile") == "my_profile"

    def test_replaces_turkish_chars(self):
        result = _safe_filename("Güvenli Liman")
        # Turkish chars should be replaced
        assert " " not in result
        assert all(c.isalnum() or c in "_-" for c in result)

    def test_allows_underscore_and_dash(self):
        assert _safe_filename("my-profile_name") == "my-profile_name"


class TestFitIsotonic:
    def test_basic_fit(self):
        np.random.seed(42)
        y_true = np.random.uniform(0, 1, 50)
        p_raw = y_true * 100 + np.random.normal(0, 5, 50)
        p_raw = np.clip(p_raw, 0, 100)

        model = fit_isotonic(
            y_true=y_true,
            p_raw=p_raw,
            info={"profile": "test"},
        )
        assert model is not None
        assert hasattr(model, "metrics")
        assert hasattr(model, "info")
        assert "rmse" in model.metrics

    def test_model_rmse_is_finite(self):
        y_true = np.array([0.0, 0.3, 0.6, 1.0, 0.8, 0.2])
        p_raw = np.array([30, 45, 60, 80, 70, 20])
        model = fit_isotonic(y_true=y_true, p_raw=p_raw, info={"test": True})
        assert np.isfinite(model.metrics["rmse"])
