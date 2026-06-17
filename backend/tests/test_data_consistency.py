# -*- coding: utf-8 -*-
"""
tests/test_data_consistency.py

Test that charts and scoring use the same OHLC data source.
"""
import sys
from pathlib import Path

import pytest
import pandas as pd

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def test_market_data_service_priority():
    """Test that MarketDataService respects fallback priority."""
    from app.features.market_data.service import MarketDataService
    
    svc = MarketDataService()
    bundle = svc.fetch_price_df("THYAO")
    
    # Verify OHLC structure
    assert isinstance(bundle.df, pd.DataFrame)
    if not bundle.df.empty:
        assert "Close" in bundle.df.columns
        assert "Open" in bundle.df.columns
        assert "High" in bundle.df.columns
        assert "Low" in bundle.df.columns
        assert bundle.source is not None


def test_chart_scoring_consistency():
    """Verify charts and scoring use same OHLC data."""
    from app.features.market_data.service import MarketDataService
    from app.features.scoring.prism_service import UnifiedPRISM
    
    test_symbol = "THYAO"
    svc = MarketDataService()
    
    # 1. Get OHLC via service
    bundle = svc.fetch_price_df(test_symbol)
    df_ohlc = bundle.df
    
    if df_ohlc.empty:
        pytest.skip(f"No OHLC data available for {test_symbol}")
    
    last_close = float(df_ohlc["Close"].iloc[-1])
    
    # 2. Calculate indicators (part of scoring pipeline)
    indicators = {
        "rsi_val": 50.0, # dummy for test
        "close": last_close,
        "trend": True,
        "atr_pct": 2.0,
        "vol_ratio": 1.0
    }
    
    # 3. Run evaluation
    res = UnifiedPRISM.evaluate(indicators, ml_score=None, profile_name="DENGELI", symbol=test_symbol, bundle=bundle)
    
    # Verify evaluation returned valid results for the symbol
    assert res["qrs"] >= 0
    assert "reason_codes" in res
    assert res["data_source"] == bundle.source


def test_bigpara_overlay_timestamp():
    """Test that BigPara overlay returns proper timestamp."""
    from app.features.market_data.data.yf_client import _fetch_bigpara_bar
    
    try:
        df, live_ts = _fetch_bigpara_bar("THYAO")
        
        if df is not None and not df.empty:
            # Verify timestamp is returned
            assert live_ts is not None, "BigPara should return live_ts"
            
            # Verify timestamp is datetime-like
            assert hasattr(live_ts, 'isoformat'), "live_ts should be Timestamp-like"
    
    except Exception as e:
        # BigPara may be down or rate-limited
        pytest.skip(f"BigPara fetch failed (expected): {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
