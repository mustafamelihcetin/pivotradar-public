# backend/app/utils/clear_cache.py
import os
import psycopg2
from app.core import settings

def clear_symbol_cache():
    """Clears ONLY the symbol_data_cache table safely."""
    pg_url = os.getenv("DATABASE_URL", "postgresql://pivot_user:pivot_pass@db/pivotradar")
    try:
        conn = psycopg2.connect(pg_url)
        cur = conn.cursor()
        print(">>> [CACHE_CLEAN] Truncating symbol_data_cache...")
        cur.execute("TRUNCATE TABLE symbol_data_cache RESTART IDENTITY CASCADE;")
        conn.commit()
        print(">>> [CACHE_CLEAN] Success. 'Analyze' button will now force a refresh.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f">>> [CACHE_CLEAN] Error: {e}")

if __name__ == "__main__":
    clear_symbol_cache()
