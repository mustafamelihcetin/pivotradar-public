# -*- coding: utf-8 -*-
"""
tests/test_offline_universe.py

Test that universe loading works offline-first and scans complete even when Yahoo fails.
"""
import os
import sys
import json
from pathlib import Path

import pytest
import pandas as pd

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def test_universe_db_build_index():
    """Test that EOD index generation works."""
    import app.features.market_data.data.universe_db as universe_db
    
    index_path = PROJECT_ROOT / "data" / "eod" / "index_test.json"
    
    # Build index
    index_data = universe_db.build_index_from_eod(index_path)
    
    # Verify structure
    assert "generated_at" in index_data
    assert "symbols" in index_data
    assert isinstance(index_data["symbols"], dict)
    
    # Cleanup
    if index_path.exists():
        index_path.unlink()


def test_universe_db_get_active_symbols():
    """Test that get_active_symbols returns symbols from index."""
    import app.features.market_data.data.universe_db as universe_db
    
    # Build index first
    index_path = PROJECT_ROOT / "data" / "eod" / "index.json"
    universe_db.build_index_from_eod(index_path)
    
    # Get active symbols
    symbols = universe_db.get_active_symbols(min_bars=1, max_age_days=3650, limit=50)
    
    # Verify
    assert isinstance(symbols, list)
    if not symbols:
        pytest.skip("No active symbols found in EOD index (empty test env)")
    assert len(symbols) > 0  # Should have at least a few symbols from EOD
    
    # Verify all are strings
    for sym in symbols:
        assert isinstance(sym, str)
        assert len(sym) >= 3  # BIST symbols are at least 3 chars


def test_offline_universe_load():
    """Test that load_universe works in offline mode using EOD index."""
    from app.features.market_data.data import universe_bist
    
    # Force offline mode
    os.environ["PR_SCAN_OFFLINE"] = "1"
    os.environ["PIVOTRADAR_UNIVERSE_NETWORK"] = "0"
    os.environ["PR_UNIVERSE_HARD_CAP"] = "250"
    
    try:
        # Load universe
        df = universe_bist.load_universe(source=None)
        
        # Verify
        assert isinstance(df, pd.DataFrame)
        assert "symbol" in df.columns
        assert len(df) > 0  # Should load from EOD index or seed
        assert len(df) <= 250  # Hard cap check
        
        # Verify all symbols are valid
        for sym in df["symbol"]:
            assert isinstance(sym, str)
            assert len(sym) >= 3
    
    finally:
        # Cleanup env vars
        os.environ.pop("PR_SCAN_OFFLINE", None)
        os.environ.pop("PIVOTRADAR_UNIVERSE_NETWORK", None)
        os.environ.pop("PR_UNIVERSE_HARD_CAP", None)


def test_hard_cap_enforcement():
    """Test that hard cap prevents >50 symbol universe (strict test)."""
    from app.features.market_data.data import universe_bist
    
    os.environ["PR_SCAN_OFFLINE"] = "1"
    os.environ["PR_UNIVERSE_HARD_CAP"] = "50"
    
    try:
        df = universe_bist.load_universe(source=None)
        
        # Verify hard cap
        assert len(df) <= 50, f"Hard cap violated: {len(df)} symbols"
    
    finally:
        os.environ.pop("PR_SCAN_OFFLINE", None)
        os.environ.pop("PR_UNIVERSE_HARD_CAP", None)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
