import sqlite3
from pathlib import Path

db_paths = [
    Path('D:/PivotRadar_Repaired/backend/data/pivotradar.db'),
    Path('D:/PivotRadar_Repaired/backend/pivotradar.db')
]

for path in db_paths:
    if not path.exists():
        print(f"Skipping {path} (not found)")
        continue
    
    print(f"\nAnalyzing DB: {path}")
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"Tables: {tables}")
        
        for table in tables:
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cursor.fetchall()]
            print(f"  Table '{table}' columns: {cols}")
        conn.close()
    except Exception as e:
        print(f"  Error analyzing {path}: {e}")
