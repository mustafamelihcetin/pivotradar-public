# backend/app/features/admin/backup.py
import os
import json
import datetime
import logging
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core import settings
from app.core.time_utils import now_utc

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.getcwd()) / "db_backups"

def create_json_backup(db: Session) -> str:
    """
    Creates a full database export in JSON format.
    Portable and engine-independent.
    """
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    from app.core.time_utils import now_utc
    timestamp = now_utc().strftime("%Y%m%d_%H%M%S")
    filename = f"pivotradar_backup_{timestamp}.json"
    filepath = BACKUP_DIR / filename

    backup_data = {
        "metadata": {
            "version": "4.2.5",
            "timestamp": now_utc().replace(tzinfo=None).isoformat(),
            "type": "FULL_JSON_EXPORT"
        },
        "tables": {}
    }

    # List of tables to export (critical data only)
    tables = [
        "users", "strategy_profiles", "subscriptions", "user_activities", 
        "user_portfolios", "system_settings", "admin_audit_logs",
        "scan_scores", "symbol_data_cache"
    ]

    from sqlalchemy import inspect
    inspector = inspect(db.get_bind())
    existing_tables = inspector.get_table_names()

    try:
        for table in tables:
            if table in existing_tables:
                rows = db.execute(text(f'SELECT * FROM "{table}"')).fetchall()
                res = db.execute(text(f'SELECT * FROM "{table}" LIMIT 0'))
                columns = res.keys()
                
                items = []
                for row in rows:
                    d = {}
                    for i, col in enumerate(columns):
                        val = row[i]
                        if isinstance(val, (datetime.datetime, datetime.date)):
                            val = val.isoformat()
                        elif isinstance(val, bytes):
                            val = val.hex()
                        d[col] = val
                    items.append(d)
                
                backup_data["tables"][table] = items
                logger.info(f"Backup: Exported {len(items)} rows from {table}")

        json_bytes = json.dumps(backup_data, indent=2, ensure_ascii=False).encode("utf-8")

        # O-11: Fernet şifreleme — yedekler kullanıcı verisi (hash, TOTP secret vb.) içeriyor.
        # BACKUP_ENCRYPTION_KEY; TOTP anahtarından bağımsız tutulur (key isolation).
        try:
            from cryptography.fernet import Fernet
            _key = settings.BACKUP_ENCRYPTION_KEY
            if isinstance(_key, str):
                _key = _key.encode()
            cipher = Fernet(_key)
            encrypted = cipher.encrypt(json_bytes)
            encrypted_filename = filename.replace(".json", ".enc.json")
            encrypted_filepath = BACKUP_DIR / encrypted_filename
            with open(encrypted_filepath, "wb") as f:
                f.write(encrypted)
            logger.info("Backup şifreli olarak kaydedildi: %s", encrypted_filename)
            return encrypted_filename
        except Exception as enc_err:
            logger.warning("Yedek şifreleme başarısız (%s); plaintext kaydediliyor.", enc_err)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(json_bytes.decode("utf-8"))
            return filename
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        raise e

def list_backups() -> list:
    """List available backup files in the backup directory."""
    if not BACKUP_DIR.exists():
        return []
    
    backups = []
    for f in BACKUP_DIR.glob("*.json"):
        stats = f.stat()
        backups.append({
            "filename": f.name,
            "size_kb": round(stats.st_size / 1024, 2),
            "created_at": datetime.datetime.fromtimestamp(stats.st_ctime).isoformat()
        })
    return sorted(backups, key=lambda x: x["created_at"], reverse=True)
