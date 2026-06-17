# backend/tests/unit/test_ml_calib.py
"""Unit tests — ML calibration module"""
import json
import math
import os
import tempfile
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────
def _make_data(n=60, hit_frac=0.5, seed=42):
    """Return list of mock ScanScore-like objects."""
    rng = np.random.default_rng(seed)
    records = []
    for i in range(n):
        m = MagicMock()
        m.ml_score        = float(rng.uniform(10, 90))
        m.qrs_score       = float(rng.uniform(30, 95))
        m.target_hit      = bool(rng.random() < hit_frac)
        m.directional_hit = None  # force fallback to hit_status / target_hit
        statuses = ["target_hit", "near_miss", "partial", "miss"]
        m.hit_status = statuses[rng.integers(0, 4)] if rng.random() < 0.7 else None
        m.evaluated_at = datetime.utcnow() - timedelta(days=int(rng.integers(1, 120)))
        m.profile_name = rng.choice(["Swing", "Agresif", None])
        records.append(m)
    return records


# ── _temporal_weights ─────────────────────────────────────────────────────────
class TestTemporalWeights:
    def test_recent_gets_higher_weight(self):
        from app.features.scoring.ml.ml_calib import _temporal_weights
        now = datetime.utcnow()
        ts_recent = now - timedelta(days=1)
        ts_old    = now - timedelta(days=100)
        w = _temporal_weights([ts_recent, ts_old])
        assert w[0] > w[1], "Recent timestamp should outweigh old one"

    def test_weights_are_in_range(self):
        from app.features.scoring.ml.ml_calib import _temporal_weights
        ts = [datetime.utcnow() - timedelta(days=d) for d in [1, 10, 30, 60, 90]]
        w  = _temporal_weights(ts)
        assert len(w) == len(ts)
        assert all(0.0 < wi <= 1.0 for wi in w), "Each weight must be in (0, 1]"
        assert w[0] > w[-1], "Most recent timestamp must have the highest weight"

    def test_handles_none_timestamps(self):
        from app.features.scoring.ml.ml_calib import _temporal_weights
        ts = [None, datetime.utcnow() - timedelta(days=5), None]
        w  = _temporal_weights(ts)
        assert len(w) == 3
        assert all(np.isfinite(w))


# ── fit_isotonic ──────────────────────────────────────────────────────────────
class TestFitIsotonic:
    def test_basic_fit_and_shape(self):
        from app.features.scoring.ml.ml_calib import fit_isotonic
        rng = np.random.default_rng(0)
        y   = rng.random(50).astype(float)
        p   = rng.uniform(10, 90, 50)
        m   = fit_isotonic(y_true=y, p_raw=p, info={"source": "test"})
        assert m.type == "isotonic"
        assert len(m.x) > 0
        assert len(m.y) > 0
        assert "rmse" in m.metrics
        assert math.isfinite(m.metrics["rmse"])

    def test_soft_labels_accepted(self):
        from app.features.scoring.ml.ml_calib import fit_isotonic
        y_soft = np.array([1.0, 0.8, 0.4, 0.0] * 15, dtype=float)
        p      = np.linspace(10, 90, len(y_soft))
        m      = fit_isotonic(y_true=y_soft, p_raw=p, info={})
        assert m.metrics["soft_mean"] == pytest.approx(0.55, abs=0.05)


# ── apply_calibration ─────────────────────────────────────────────────────────
class TestApplyCalibration:
    def test_returns_same_shape(self):
        from app.features.scoring.ml.ml_calib import apply_calibration
        inp = np.array([20.0, 50.0, 80.0])
        out = apply_calibration(inp)
        assert out.shape == inp.shape

    def test_values_in_valid_range_stay_valid(self):
        from app.features.scoring.ml.ml_calib import apply_calibration
        inp = np.array([0.0, 25.0, 50.0, 75.0, 100.0])
        out = apply_calibration(inp)
        # Output should be numeric and same shape
        assert out.shape == inp.shape
        assert np.all(np.isfinite(out))

    def test_fallback_when_no_model(self, tmp_path, monkeypatch):
        """Without any model file, input is passed through unchanged."""
        from app.features.scoring.ml import ml_calib
        monkeypatch.setattr(ml_calib, "_CACHED", None)
        monkeypatch.setattr(ml_calib, "_PROFILE_CACHE", {})
        monkeypatch.setattr(ml_calib, "_MODEL_PATH", str(tmp_path / "nonexistent.json"))
        inp = np.array([35.0, 65.0])
        out = ml_calib.apply_calibration(inp)
        np.testing.assert_array_almost_equal(out, inp)


# ── _get_ml_config ────────────────────────────────────────────────────────────
class TestGetMlConfig:
    def test_returns_dict(self):
        from app.features.scoring.ml.ml_calib import _get_ml_config
        cfg = _get_ml_config()
        assert isinstance(cfg, dict)
        assert "min_samples" in cfg
        assert "w_rule" in cfg
        assert "w_ml" in cfg

    def test_fallback_when_db_unavailable(self, monkeypatch):
        """Should fall back to hardcoded defaults when DB is unreachable."""
        def _fail(*a, **kw):
            raise RuntimeError("DB unavailable")
        with patch("app.features.scoring.ml.ml_calib.SessionLocal", side_effect=_fail):
            from app.features.scoring.ml.ml_calib import _get_ml_config
            cfg = _get_ml_config()
        assert cfg["min_samples"] > 0
        assert cfg["w_rule"] + cfg["w_ml"] == pytest.approx(1.0, abs=0.01)


# ── run_full_calibration (mocked DB) ─────────────────────────────────────────
class TestRunFullCalibration:
    @pytest.fixture(autouse=True)
    def _patch_db(self, monkeypatch, tmp_path):
        data = _make_data(80)
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.all.return_value    = data
        mock_db = MagicMock()
        mock_db.query.return_value = mock_q
        from app.features.scoring.ml import ml_calib
        monkeypatch.setattr(ml_calib, "SessionLocal", lambda: mock_db)
        monkeypatch.setattr(ml_calib, "_MODEL_DIR",  str(tmp_path))
        monkeypatch.setattr(ml_calib, "_MODEL_PATH", str(tmp_path / "ml_isotonic.json"))
        monkeypatch.setattr(ml_calib, "_PROFILE_MODEL_TPL", str(tmp_path / "ml_isotonic_{profile}.json"))
        monkeypatch.setattr(ml_calib, "_CACHED", None)
        monkeypatch.setattr(ml_calib, "_PROFILE_CACHE", {})

    def test_global_trains_successfully(self):
        from app.features.scoring.ml.ml_calib import retrain_from_db
        res = retrain_from_db()
        assert "error" not in res, f"Expected no error, got: {res.get('error')}"
        assert res.get("n_clean", 0) > 0

    def test_full_calibration_returns_structure(self):
        from app.features.scoring.ml.ml_calib import run_full_calibration
        res = run_full_calibration()
        assert "global" in res
        assert "trained_profiles" in res
        assert "failed_profiles" in res
