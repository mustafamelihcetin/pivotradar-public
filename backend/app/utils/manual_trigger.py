# backend/app/utils/manual_trigger.py
import sys
import os
import time
import json
import pandas as pd
from pathlib import Path

# Environment / Path Setup
sys.path.append("/app")
os.environ["PYTHONPATH"] = "/app"

def manual_scan_execution():
    """Manual scan execution: Bypasses the worker thread and calls the engine directly."""
    print(">>> [MANUAL_EXEC] Starting Direct Engine Execution...")
    
    try:
        # 1. Imports
        from app.features.market_data.data.universe_bist import load_universe
        from app.features.scanner.engine import run_pipeline
        from app.core import settings
        
        # 2. Load Universe
        print(">>> [MANUAL_EXEC] Loading BIST_ALL universe...")
        universe = load_universe(source="bist_all")
        if universe is None or len(universe) < 5:
             print(">>> [MANUAL_EXEC] Universe error. Using seed list.")
             bist_seed = ["THYAO","ASELS","EREGL","KCHOL","SAHOL","AKBNK","GARAN","ISCTR"]
             universe = pd.DataFrame({"symbol": bist_seed})
             
        print(f">>> [MANUAL_EXEC] Universe: {len(universe)} symbols.")

        # 3. Dummy Progress Callback
        def progress_cb(percent, stage, msg):
            print(f">>> [PROGRESS] {percent}% | {stage} | {msg}")

        # 4. Run Pipeline
        params = {"profile_name": "Dengeli"}
        print(">>> [MANUAL_EXEC] Calling run_pipeline (this will load ML model)...")
        
        df_res, meta = run_pipeline(
            universe    = universe,
            params      = params,
            progress_cb = progress_cb,
            stop_check  = lambda: False
        )
        
        if df_res is not None and not df_res.empty:
            print(f">>> [MANUAL_EXEC] SUCCESS! {len(df_res)} results produced.")
            
            # 5. Persist to results.json (Exact same logic as router.py)
            os.makedirs(settings.RUNTIME_DIR, exist_ok=True)
            df_res.to_json(settings.RESULTS_FILE, orient="records", force_ascii=False)
            
            with open(settings.META_FILE, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False)
                
            print(f">>> [MANUAL_EXEC] Files written to {settings.RESULTS_FILE}")
            print(f">>> [MANUAL_EXEC] Check your dashboard NOW.")
        else:
            print(">>> [MANUAL_EXEC] FAILED: No results produced.")

    except Exception as e:
        import traceback
        print(f">>> [MANUAL_EXEC] CRITICAL ERROR: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    manual_scan_execution()
