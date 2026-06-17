# backend/tests/unit/test_training_helpers.py
"""
training.py yardımcı fonksiyonları için unit testler.
_log_feature_importance, _safe_float, _encode_pattern_type, _soft_label.
"""
import logging
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from app.features.scoring.ml.training import (
    _log_feature_importance,
    _safe_float,
    _encode_pattern_type,
    _soft_label,
)


# ── _safe_float ───────────────────────────────────────────────────────────────

class TestSafeFloat:
    def test_normal(self):
        assert _safe_float(3.14) == pytest.approx(3.14)

    def test_none_returns_default(self):
        assert _safe_float(None, default=7.0) == pytest.approx(7.0)

    def test_nan_returns_default(self):
        assert _safe_float(float("nan")) == pytest.approx(0.0)

    def test_string_number(self):
        assert _safe_float("42") == pytest.approx(42.0)

    def test_bad_string_returns_default(self):
        assert _safe_float("abc", default=-1.0) == pytest.approx(-1.0)


# ── _encode_pattern_type ──────────────────────────────────────────────────────

class TestEncodePatternType:
    def test_bullish_reversal(self):
        assert _encode_pattern_type("Çift Dip") == pytest.approx(2.0)

    def test_bearish_reversal(self):
        assert _encode_pattern_type("Baş Omuz") == pytest.approx(-2.0)

    def test_neutral(self):
        assert _encode_pattern_type("Range/Kutu") == pytest.approx(0.0)

    def test_empty_string(self):
        assert _encode_pattern_type("") == pytest.approx(0.0)

    def test_unknown_pattern(self):
        assert _encode_pattern_type("Bilinmeyen Formasyon") == pytest.approx(0.0)

    def test_whitespace_stripped(self):
        assert _encode_pattern_type("  Bayrak  ") == pytest.approx(1.0)


# ── _soft_label ───────────────────────────────────────────────────────────────

class TestSoftLabel:
    def _row(self, hit_status=None, target_hit=False):
        r = MagicMock()
        r.hit_status = hit_status
        r.target_hit = target_hit
        return r

    def test_no_hit_status_uses_target_hit(self):
        assert _soft_label(self._row(hit_status=None, target_hit=True)) == pytest.approx(1.0)
        assert _soft_label(self._row(hit_status=None, target_hit=False)) == pytest.approx(0.0)

    def test_target_hit_soft_weight(self):
        row = self._row(hit_status="target_hit", target_hit=True)
        label = _soft_label(row)
        assert 0.0 <= label <= 1.0

    def test_near_miss_lower_than_hit(self):
        hit_row  = self._row(hit_status="target_hit", target_hit=True)
        miss_row = self._row(hit_status="near_miss",  target_hit=False)
        assert _soft_label(hit_row) >= _soft_label(miss_row)


# ── _log_feature_importance ───────────────────────────────────────────────────

class TestLogFeatureImportance:
    def _mock_model(self, n_features=10):
        m = MagicMock()
        m.feature_importances_ = np.random.dirichlet(np.ones(n_features))
        return m

    def test_logs_without_error(self, caplog):
        model = self._mock_model(5)
        features = [f"feat_{i}" for i in range(5)]
        with caplog.at_level(logging.INFO, logger="PivotRadar.Training"):
            _log_feature_importance(model, features)
        assert any("Feature importance" in r.message for r in caplog.records)

    def test_logs_with_mlflow(self, caplog):
        model = self._mock_model(5)
        features = [f"feat_{i}" for i in range(5)]
        mock_mlflow = MagicMock()
        with caplog.at_level(logging.INFO, logger="PivotRadar.Training"):
            _log_feature_importance(model, features, mlflow_module=mock_mlflow)
        assert mock_mlflow.log_metric.call_count == 5

    def test_handles_missing_attribute_gracefully(self, caplog):
        model = MagicMock(spec=[])  # feature_importances_ yok
        features = ["a", "b"]
        with caplog.at_level(logging.DEBUG, logger="PivotRadar.Training"):
            _log_feature_importance(model, features)
        # Exception fırlatmamalı

    def test_top10_cap(self, caplog):
        model = self._mock_model(22)
        features = [f"feat_{i}" for i in range(22)]
        with caplog.at_level(logging.INFO, logger="PivotRadar.Training"):
            _log_feature_importance(model, features)
        log_msg = next(r.message for r in caplog.records if "Feature importance" in r.message)
        # "top 10" veya daha azını göstermeli
        assert "10/" in log_msg or "top" in log_msg.lower()
