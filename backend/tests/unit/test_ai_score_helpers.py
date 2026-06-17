# backend/tests/unit/test_ai_score_helpers.py
"""Unit tests for ML scoring helper functions."""
import pytest
import os
import tempfile
import json
from unittest.mock import MagicMock, patch

from app.features.scoring.ml.ai_score import (
    _extract_feature_names_from_meta,
    _extract_feature_names_from_model,
    _unwrap_estimator,
    _find_single_meta,
    _resolve_meta_path,
    blend_scores,
    MultipleMetaError,
)


class TestExtractFeatureNamesFromMeta:
    def test_feature_names_key(self):
        meta = {"feature_names": ["rsi", "ema", "vol"]}
        result = _extract_feature_names_from_meta(meta)
        assert result == ["rsi", "ema", "vol"]

    def test_features_key(self):
        meta = {"features": ["a", "b"]}
        result = _extract_feature_names_from_meta(meta)
        assert result == ["a", "b"]

    def test_columns_key(self):
        meta = {"columns": ["x", "y", "z"]}
        result = _extract_feature_names_from_meta(meta)
        assert result == ["x", "y", "z"]

    def test_no_matching_key(self):
        meta = {"other": "stuff"}
        result = _extract_feature_names_from_meta(meta)
        assert result is None

    def test_empty_list_skipped(self):
        meta = {"feature_names": [], "features": ["a"]}
        result = _extract_feature_names_from_meta(meta)
        assert result == ["a"]

    def test_converts_to_str(self):
        meta = {"feature_names": [1, 2, 3]}
        result = _extract_feature_names_from_meta(meta)
        assert result == ["1", "2", "3"]


class TestExtractFeatureNamesFromModel:
    def test_feature_names_in_attribute(self):
        model = MagicMock()
        model.feature_names_in_ = ["f1", "f2"]
        result = _extract_feature_names_from_model(model)
        assert result == ["f1", "f2"]

    def test_no_feature_names_in(self):
        model = MagicMock(spec=[])  # no attributes
        result = _extract_feature_names_from_model(model)
        assert result is None

    def test_pipeline_with_preprocess(self):
        pp = MagicMock()
        pp.get_feature_names_out.return_value = ["feat_a", "feat_b"]
        model = MagicMock()
        model.named_steps = {"preprocess": pp}
        del model.feature_names_in_
        result = _extract_feature_names_from_model(model)
        assert result == ["feat_a", "feat_b"]


class TestUnwrapEstimator:
    def test_dict_with_model_key(self):
        inner = MagicMock()
        result = _unwrap_estimator({"model": inner})
        assert result is inner

    def test_dict_single_value(self):
        inner = MagicMock()
        result = _unwrap_estimator({"only": inner})
        assert result is inner

    def test_dict_with_estimator_key(self):
        inner = MagicMock()
        result = _unwrap_estimator({"estimator": inner})
        assert result is inner

    def test_non_dict_passthrough(self):
        obj = MagicMock()
        obj.estimator = None
        result = _unwrap_estimator(obj)
        assert result is obj


class TestFindSingleMeta:
    def test_no_meta_files_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            result = _find_single_meta(d)
            assert result is None

    def test_single_meta_file_returns_path(self):
        with tempfile.TemporaryDirectory() as d:
            meta_path = os.path.join(d, "ml.joblib.meta.json")
            with open(meta_path, "w") as f:
                json.dump({"feature_names": []}, f)
            result = _find_single_meta(d)
            assert result == meta_path

    def test_multiple_meta_files_raises(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ["a.joblib.meta.json", "b.joblib.meta.json"]:
                with open(os.path.join(d, name), "w") as f:
                    json.dump({}, f)
            with pytest.raises(MultipleMetaError):
                _find_single_meta(d)


class TestResolveMetaPath:
    def test_exact_file_exists(self):
        with tempfile.TemporaryDirectory() as d:
            jl = os.path.join(d, "model.joblib")
            meta = jl + ".meta.json"
            open(jl, "w").close()
            with open(meta, "w") as f:
                json.dump({}, f)
            result = _resolve_meta_path(jl)
            assert result == meta

    def test_fallback_to_single_meta_in_dir(self):
        with tempfile.TemporaryDirectory() as d:
            jl = os.path.join(d, "model.joblib")
            open(jl, "w").close()
            meta = os.path.join(d, "other.joblib.meta.json")
            with open(meta, "w") as f:
                json.dump({}, f)
            result = _resolve_meta_path(jl)
            assert result == meta


class TestBlendScores:
    def test_blends_in_range(self):
        result = blend_scores(rule=70.0, ml=80.0)
        assert 0.0 <= result <= 100.0

    def test_low_rule_high_ml(self):
        result = blend_scores(rule=20.0, ml=90.0)
        assert 0.0 <= result <= 100.0

    def test_both_zero_returns_zero(self):
        result = blend_scores(rule=0.0, ml=0.0)
        assert result == 0.0

    def test_both_100_returns_100(self):
        result = blend_scores(rule=100.0, ml=100.0)
        assert result == 100.0

    def test_llm_not_factored_in(self):
        r1 = blend_scores(rule=60.0, ml=70.0, llm=None)
        r2 = blend_scores(rule=60.0, ml=70.0, llm=50.0, llm_enabled=False)
        assert r1 == r2
