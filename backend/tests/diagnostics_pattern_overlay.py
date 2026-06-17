# tests/diagnostics_pattern_overlay.py
"""
Pattern Overlay Diagnostics Test
================================

Golden test to verify pattern detection criteria are met.
Tests 5 fixed symbols with deterministic parameters.
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.features.market_data.data import pattern_geometry
import pandas as pd
import json

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance")
    sys.exit(1)


# Test configuration
TEST_SYMBOLS = ["ASELS.IS", "THYAO.IS", "KCHOL.IS", "EREGL.IS", "AKBNK.IS"]
LOOKBACK_BARS = 120
PIVOT_ORDER = 5


def test_pattern_detection():
    """
    Run pattern detection on golden symbols and verify criteria.
    """
    print("=" * 60)
    print("PATTERN OVERLAY DIAGNOSTICS TEST")
    print("=" * 60)
    print(f"Symbols: {len(TEST_SYMBOLS)}")
    print(f"Lookback: {LOOKBACK_BARS} bars")
    print(f"Pivot Order: {PIVOT_ORDER}")
    print("=" * 60)
    
    results = []
    
    for symbol in TEST_SYMBOLS:
        print(f"\nTesting: {symbol}")
        print("-" * 60)
        
        try:
            # Fetch data using yfinance
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="1y", interval="1d")
            
            if df is None or len(df) == 0:
                print(f"  ❌ No data fetched for {symbol}")
                continue
            
            # Ensure OHLC columns exist
            required_cols = ["Open", "High", "Low", "Close"]
            if not all(col in df.columns for col in required_cols):
                print(f"  ❌ Missing OHLC columns")
                continue
            
            if df is None or len(df) < LOOKBACK_BARS:
                print(f"  ❌ Insufficient data: {len(df) if df is not None else 0} bars")
                continue
            
            # Run detection
            result = pattern_geometry.detect_patterns_validated(
                df,
                params={
                    "lookback_bars": LOOKBACK_BARS,
                    "pivot_order": PIVOT_ORDER
                }
            )
            
            # Extract key metrics
            pattern_type = result.get("detected_type", "NONE")
            confidence = result.get("confidence", 0.0)
            debug = result.get("debug", {})
            
            # Validation checks
            validation_checks = debug.get("validation_checks", {})
            classification = debug.get("classification", {})
            
            # Print results
            print(f"  Pattern: {pattern_type}")
            print(f"  Confidence: {confidence:.2f}")
            print(f"  Convergence Ratio: {classification.get('convergence_ratio', 'N/A')}")
            print(f"  Validation Passed: {classification.get('validation_passed', False)}")
            
            # Upper line
            if "upper_line" in debug:
                ul = debug["upper_line"]
                print(f"  Upper Line:")
                print(f"    - Touches: {ul['touch_count']} (min 2)")
                print(f"    - Slope: {ul['slope']:.6f}")
                print(f"    - RMSE: {ul['rmse']:.4f}")
                
                assert ul["touch_count"] >= 2, f"❌ Upper line touch count < 2"
            
            # Lower line
            if "lower_line" in debug:
                ll = debug["lower_line"]
                print(f"  Lower Line:")
                print(f"    - Touches: {ll['touch_count']} (min 2)")
                print(f"    - Slope: {ll['slope']:.6f}")
                print(f"    - RMSE: {ll['rmse']:.4f}")
                
                assert ll["touch_count"] >= 2, f"❌ Lower line touch count < 2"
            
            # Validation checks
            print(f"  Validation Checks:")
            for key, val in validation_checks.items():
                status = "✅" if val else "❌"
                print(f"    {status} {key}: {val}")
                assert val, f"❌ Validation check failed: {key}"
            
            # Store result
            results.append({
                "symbol": symbol,
                "pattern": pattern_type,
                "confidence": confidence,
                "debug": debug
            })
            
            print(f"  ✅ All criteria passed")
            
        except AssertionError as e:
            print(f"  ❌ FAILED: {e}")
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Total Symbols Tested: {len(results)}/{len(TEST_SYMBOLS)}")
    
    # Pattern distribution
    pattern_counts = {}
    for r in results:
        pt = r["pattern"]
        pattern_counts[pt] = pattern_counts.get(pt, 0) + 1
    
    print("\nPattern Distribution:")
    for pattern, count in sorted(pattern_counts.items()):
        print(f"  {pattern}: {count}")
    
    # Save results to JSON
    output_file = PROJECT_ROOT / "tests" / "pattern_diagnostics_output.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Results saved to: {output_file}")
    print("=" * 60)


if __name__ == "__main__":
    test_pattern_detection()
