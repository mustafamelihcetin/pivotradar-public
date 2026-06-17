# backend/app/diag_eval.py
import sys
import os
# Add parent directory of 'app' to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from sqlalchemy import and_
import datetime

def diag():
    db = SessionLocal()
    today = datetime.date.today()
    print(f"--- DIAGNOSTIC START (Today: {today}) ---")
    
    # 1. Total records
    total = db.query(ScanScore).count()
    print(f"Total ScanScore records: {total}")
    
    # 2. Unevaluated directional records
    all_uneval = db.query(ScanScore).filter(ScanScore.evaluated_at == None).all()
    print(f"Total unevaluated records: {len(all_uneval)}")
    
    directions = {}
    for s in all_uneval:
        directions[s.target_direction] = directions.get(s.target_direction, 0) + 1
    print(f"Unevaluated directions distribution: {directions}")
    
    # 3. Check for bullish/bearish specifically
    directional = [s for s in all_uneval if str(s.target_direction).lower() in ["bullish", "bearish"]]
    print(f"Unevaluated bullish/bearish records (case-insensitive): {len(directional)}")
    
    if len(directional) > 0:
        print("Sample directional records:")
        for s in directional[:5]:
            print(f"  - {s.symbol} | Dir: {s.target_direction} | Date: {s.scan_date} | Score: {s.ml_score}")
    
    # 4. Check GIGO filtering
    gigo = db.query(ScanScore).filter(
        and_(
            ScanScore.evaluated_at != None,
            ScanScore.ml_score == 50.0
        )
    ).count()
    print(f"Evaluated records with ml_score=50.0 (Filtered by GIGO): {gigo}")
    
    # 4. Evaluated records
    eval_count = db.query(ScanScore).filter(ScanScore.evaluated_at != None).count()
    print(f"Evaluated records: {eval_count}")
    
    # 6. Check MarketDataService
    from app.features.market_data.service import MarketDataService
    svc = MarketDataService()
    try:
        if len(directional) > 0:
            sym = directional[0].symbol
            print(f"Testing price fetch for {sym}...")
            bundle = svc.fetch_price_df(sym, lookback_days=30)
            if bundle and not bundle.df.empty:
                print(f"  Success! Found {len(bundle.df)} days of data.")
                print(f"  Index type: {type(bundle.df.index)}")
                print(f"  First 3 dates: {bundle.df.index.date[:3]}")
                print(f"  Last date: {bundle.df.index.date[-1]}")
                
                # Test mask logic (New Robust Logic)
                df_dates = bundle.df.index.strftime('%Y-%m-%d')
                s_date_str = directional[0].scan_date.strftime('%Y-%m-%d')
                m_date_str = datetime.date(2026, 4, 30).strftime('%Y-%m-%d')
                
                mask = (df_dates >= s_date_str) & (df_dates <= m_date_str)
                window = bundle.df.loc[mask]
                print(f"  NEW Mask Test ({s_date_str} to {m_date_str}): Found {len(window)} records.")
            else:
                print(f"  FAILED: Bundle is empty or None.")
    except Exception as e:
        print(f"  CRITICAL ERROR fetching price: {e}")
    
    print("--- DIAGNOSTIC END ---")

if __name__ == "__main__":
    diag()
