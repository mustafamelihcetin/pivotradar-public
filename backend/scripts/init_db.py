# backend/scripts/init_db.py
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).parent.parent.resolve()
sys.path.append(str(backend_path))

from app.core.database import engine, Base
from app.features.users import models  # Modelleri yüklemek için (Base.metadata.create_all için gerekli)

def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")

if __name__ == "__main__":
    init_db()
