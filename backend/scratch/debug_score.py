import os
import sys
import traceback

# Add /app to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.core.database import SessionLocal
from app.features.scanner.user_scorer import score_for_user

def debug():
    db = SessionLocal()
    try:
        print("Starting score_for_user debug...")
        results, meta = score_for_user(
            db, 
            profile_name="Güvenli Liman",
            top_n=100
        )
        print(f"SUCCESS! Found {len(results)} results.")
        print("Meta:", meta)
    except Exception as e:
        print("CRASH DETECTED!")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug()
