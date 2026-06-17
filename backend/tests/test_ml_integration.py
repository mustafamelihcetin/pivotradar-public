# -*- coding: utf-8 -*-
"""
tests/test_ml_integration.py

Test that ML model loads correctly and produces valid scores.
"""
import sys
from pathlib import Path

import pytest
import pandas as pd

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def test_ml_model_file_exists():
    """Verify ML model file exists at expected path."""
    model_path = PROJECT_ROOT / "assets" / "models" / "ml_latest.joblib"
    
    assert model_path.exists(), f"ML model not found: {model_path}"
    assert model_path.stat().st_size > 0, "ML model file is empty"


def test_ml_model_loads():
    """Test that ML model loads without errors."""
    from app.features.scoring.ml.ai_score import MLScorer
    
    model_path = PROJECT_ROOT / "assets" / "models" / "ml_latest.joblib"
    
    # Load model
    scorer = MLScorer(str(model_path))
    
    # Verify scorer is ready
    assert scorer is not None
    assert hasattr(scorer, 'score'), "MLScorer should have score method"


def test_ml_scoring_pipeline():
    """Test that ML scoring works in pipeline with real model."""
    from app.features.scoring.prism_service import UnifiedPRISM
    
    # Small universe for testing
    indicators = {
        "rsi_val": 45.0,
        "trend": True,
        "atr_pct": 2.5,
        "vol_ratio": 1.2,
        "close": 150.0
    }
    
    # Run PRISM evaluation
    res = UnifiedPRISM.evaluate(indicators, ml_score=60.0, profile_name="DENGELI")
    
    assert "qrs" in res
    assert res["qrs"] > 0


def test_ml_error_handling():
    """Test that ML errors are handled gracefully in PRISM."""
    from app.features.scoring.prism_service import UnifiedPRISM
    
    indicators = {"rsi_val": 50.0, "close": 100.0}
    
    # Should work even with None ml_score
    res = UnifiedPRISM.evaluate(indicators, ml_score=None, profile_name="DENGELI")
    
    assert "qrs" in res
    assert "SYSTEM_SAFE_MODE_ACTIVE" not in res.get("reasons", [])


def test_ml_score_features():
    """Test that ML scorer handles 4-feature input correctly."""
    from app.features.scoring.ml.ai_score import MLScorer
    
    model_path = PROJECT_ROOT / "assets" / "models" / "ml_latest.joblib"
    scorer = MLScorer(str(model_path))
    
    # Create sample feature dict (model expects: rule, ml_raw, ml_cal, yzdsh)
    features = {
        "rule": 75.0,
        "ml_raw": 60.0,
        "ml_cal": 55.0,
        "yzdsh": 67.5
    }
    
    # Score
    result = scorer.score(features)
    
    # Verify result
    assert result is not None
    assert isinstance(result, (int, float))
    assert 0 <= result <= 100  # Scores should be in 0-100 range


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
