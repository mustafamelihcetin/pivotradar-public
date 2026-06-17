# backend/app/utils/fake_results.py
import json
import os
from pathlib import Path

def create_fake_results():
    """Manually creates a dummy results.json file in the runtime directory for UI testing."""
    runtime_dir = Path("/app/data/runtime")
    if not runtime_dir.exists():
        runtime_dir.mkdir(parents=True, exist_ok=True)
    
    results_file = runtime_dir / "results.json"
    
    dummy_data = [
        {
            "symbol": "FAKE_BIST",
            "close": 123.45,
            "change_pct": 2.5,
            "rsi": 65.2,
            "ml_score": 88.5,
            "yzdsh": 85.0,
            "trend": True,
            "pattern_name": "Bullish Signal",
            "atr_percent": 1.5,
            "volume_ratio": 1.2,
            "timestamp": "2026-04-06T21:00:00"
        }
    ]
    
    try:
        results_file.write_text(json.dumps(dummy_data), encoding="utf-8")
        print(f">>> [DUMMY_GEN] SUCCESS: {results_file} created.")
        
        # Also create meta.json
        meta_file = runtime_dir / "meta.json"
        meta_data = {"count": 1, "ts": 1775508000.0}
        meta_file.write_text(json.dumps(meta_data), encoding="utf-8")
        print(f">>> [DUMMY_GEN] SUCCESS: {meta_file} created.")
        
    except Exception as e:
        print(f">>> [DUMMY_GEN] ERROR: {e}")

if __name__ == "__main__":
    create_fake_results()
