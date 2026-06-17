# backend/app/utils/test_imports.py
import sys
import os
from pathlib import Path

# Add the parent directory of 'app' to the path for module imports
sys.path.append("/app")

def diagnostic_run():
    print(">>> [DIAG] Step 0: Base imports starting...")
    import pandas as pd
    print(f">>> [DIAG] Step 1: Pandas OK (version {pd.__version__})")
    
    import numpy as np
    print(f">>> [DIAG] Step 2: Numpy OK (version {np.__version__})")

    try:
        from app.core.database import SessionLocal
        print(">>> [DIAG] Step 3: Database SessionLocal OK")
    except Exception as e:
        print(f">>> [DIAG] Step 3: Database SessionLocal FAILED: {e}")

    try:
        from app.features.scanner.engine import run_pipeline
        print(">>> [DIAG] Step 4: Engine run_pipeline OK")
    except Exception as e:
        print(f">>> [DIAG] Step 4: Engine run_pipeline FAILED: {e}")

    try:
        from app.features.scanner.router import push_to_scan_queue
        print(">>> [DIAG] Step 5: Router push_to_scan_queue OK")
    except Exception as e:
        print(f">>> [DIAG] Step 5: Router push_to_scan_queue FAILED: {e}")

if __name__ == "__main__":
    diagnostic_run()
