# backend/rescue_sync.py
import sys
import os
import json
import uuid
import datetime
import pandas as pd

# Add the current directory to sys.path to allow 'app' imports
sys.path.append(os.getcwd())

from app.core.settings import settings
from app.core.database import SessionLocal
from app.features.scanner.engine import run_pipeline
from app.features.scanner.user_scorer import persist_cache

def force_sync():
    print(">>> Starting Universal Force Sync (V23)...")
    
    # Top symbols to sync immediately
    symbols = ['THYAO','ORMA','EREGL','KCHOL','SISE','DOAS','BIMAS','AKBNK','GARAN','ISCTR','TUPRS','ASELS','KRDMD','SAHOL','VAKBN','HALKB','PETKM','PGSUS','TCELL','TTKOM']
    universe = pd.DataFrame({'symbol': symbols})
    
    # Run the hybrid pipeline
    df_res, meta, history = run_pipeline(universe=universe, params={'use_ml': True})
    
    if df_res is None or df_res.empty:
        print("!!! ERROR: Pipeline returned no results.")
        return

    sid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        # 1. Sync to Postgres DB (Latest results + 20-day history)
        # Combine latest into history for a single persist_cache call
        n = persist_cache(history, sid, db)
        print(f">>> Persisted {n} rows (latest + history) to DB (Batch: {sid})")
        
        # 2. Sync to results.json (Dashboard List source)
        df_res.to_json(settings.RESULTS_FILE, orient='records', force_ascii=False)
        print(f">>> Updated {settings.RESULTS_FILE}")
        
        # 3. Sync to results.meta (Header Source)
        meta['batch_id'] = sid
        meta['data_date'] = str(datetime.date.today())
        with open(settings.META_FILE, 'w', encoding='utf-8') as f:
            json.dump(meta, f)
        print(f">>> Updated {settings.META_FILE}")
        
        # 4. Reset Progress to DONE
        with open(settings.PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'state': 'DONE',
                'percent': 100,
                'stage': 'TAMAMLANDI',
                'ts': 0,
                'message': 'Universal Sync COMPLETE (V23)'
            }, f)
        print(">>> System reset to DONE.")
        
    finally:
        db.close()

if __name__ == "__main__":
    force_sync()
