# backend/tests/unit/test_scanner_engine.py
import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
from app.features.scanner.engine import run_pipeline, _call_rules_score

def test_call_rules_score_basic():
    # _call_rules_score; pipeline/_helpers.py'deki call_rules_score'u çağırır
    with patch("app.features.scanner.pipeline._helpers.rules_score") as mock_rules:
        mock_rules.return_value = 75.0
        res = _call_rules_score(rsi=60.0, trend=1.0, atr_pct=2.0, vol_ratio=1.5)
        assert res == 75.0

def test_run_pipeline_empty_universe():
    with patch("app.features.market_data.data.universe_bist.load_universe", return_value=pd.DataFrame()):
        df, meta, results = run_pipeline(max_symbols=10)
        assert df.empty
        assert "error" in meta

def test_run_pipeline_mocked_flow():
    # Mock universe
    mock_universe = pd.DataFrame({"Symbol": ["THYAO", "ASELS"]})
    
    # Mock data service
    mock_bundle = MagicMock()
    mock_bundle.df = pd.DataFrame({
        "Open": np.linspace(100.0, 110.0, 100),
        "High": np.linspace(105.0, 115.0, 100),
        "Low": np.linspace(95.0, 105.0, 100),
        "Close": np.linspace(102.0, 112.0, 100),
        "Volume": [1000.0]*100
    }, index=pd.date_range("2026-01-01", periods=100))
    mock_bundle.source = "yfinance"
    
    with patch("app.features.market_data.data.universe_bist.load_universe", return_value=mock_universe), \
         patch("app.features.scanner.engine.MarketDataService") as mock_svc_cls, \
         patch("app.features.scanner.engine.MLScorer") as mock_ml_scorer, \
         patch("app.features.scanner.engine.detect_patterns_validated", return_value={}), \
         patch("app.features.scoring.prism_service.UnifiedPRISM.evaluate") as mock_eval:
        
        # Mock MarketDataService instance
        mock_svc = mock_svc_cls.return_value
        mock_svc.fetch_bulk_ohlc.return_value = {"THYAO": mock_bundle, "ASELS": mock_bundle}
        mock_svc.stitch_hybrid.side_effect = lambda s, df, t: (df, "mock")
        
        # Mock ML Scorer
        mock_ml_instance = mock_ml_scorer.return_value
        mock_ml_instance.feature_names = ["close", "rsi14_x"]
        mock_ml_instance.score.return_value = 80.0

        # Mock UnifiedPRISM evaluate
        mock_eval.return_value = {
            "qrs": 85.0, "direction": "bullish", "target_price": 110.0,
            "predicted_days": 5, "quality_label": "High", "reasons": []
        }
        
        df, meta, results = run_pipeline(max_symbols=2)
        
        assert not df.empty
        assert "THYAO" in df["symbol"].values
        assert "ASELS" in df["symbol"].values
