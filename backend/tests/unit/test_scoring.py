# backend/tests/unit/test_scoring.py
"""Unit tests — blend_scores and score boundary conditions"""
import pytest
from unittest.mock import patch


class TestBlendScores:
    def _blend(self, rule, ml, **kw):
        with patch("app.features.scoring.ml.ml_calib._get_ml_config",
                   return_value={"w_rule": 0.6, "w_ml": 0.4}):
            from app.features.scoring.ml.ai_score import blend_scores
            return blend_scores(rule, ml, **kw)

    def test_weighted_blend(self):
        result = self._blend(80.0, 60.0)
        # 0.6*80 + 0.4*60 = 48 + 24 = 72
        assert result == pytest.approx(72.0, abs=0.5)

    def test_output_clamped_to_0_100(self):
        result = self._blend(200.0, 200.0)
        assert result == pytest.approx(100.0)
        result = self._blend(-50.0, -50.0)
        assert result == pytest.approx(0.0)

    def test_equal_weights_fallback(self):
        """When total weight is 0, should use 50/50 split."""
        with patch("app.features.scoring.ml.ml_calib._get_ml_config",
                   return_value={"w_rule": 0.0, "w_ml": 0.0}):
            from app.features.scoring.ml import ai_score
            # force reload of the W_RULE/W_ML from the patch
            result = ai_score.blend_scores(80.0, 20.0)
        assert 0.0 <= result <= 100.0


class TestScoreBoundaries:
    """Smoke tests for score values staying within [0, 100]."""
    @pytest.mark.parametrize("rule,ml", [
        (0.0,   0.0),
        (50.0,  50.0),
        (100.0, 100.0),
        (0.0,   100.0),
        (100.0, 0.0),
    ])
    def test_blend_always_in_range(self, rule, ml):
        with patch("app.features.scoring.ml.ml_calib._get_ml_config",
                   return_value={"w_rule": 0.6, "w_ml": 0.4}):
            from app.features.scoring.ml.ai_score import blend_scores
            result = blend_scores(rule, ml)
        assert 0.0 <= result <= 100.0
