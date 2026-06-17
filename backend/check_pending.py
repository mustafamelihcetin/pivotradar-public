
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from sqlalchemy import func

db = SessionLocal()
try:
    cnt = db.query(func.count(ScanScore.id)).scalar()
    print(f"TOTAL_COUNT: {cnt}")
finally:
    db.close()
