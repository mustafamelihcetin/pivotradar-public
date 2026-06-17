#!/usr/bin/env python3
"""
PostgreSQL backup script for PivotRadar.

Usage:
    python backup.py [--output-dir /path/to/backups] [--retention-days 30]

Environment variables (from .env or docker-compose):
    DATABASE_URL or POSTGRES_* individual vars
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def _parse_db_url(url: str) -> dict:
    p = urlparse(url)
    return {
        "host":     p.hostname or "localhost",
        "port":     str(p.port or 5432),
        "dbname":   p.path.lstrip("/"),
        "user":     p.username or "postgres",
        "password": p.password or "",
    }


def run_backup(output_dir: Path, retention_days: int = 30) -> Path:
    db_url = os.getenv("DATABASE_URL") or (
        f"postgresql://{os.getenv('POSTGRES_USER','postgres')}:"
        f"{os.getenv('POSTGRES_PASSWORD','')}@"
        f"{os.getenv('POSTGRES_HOST','localhost')}:"
        f"{os.getenv('POSTGRES_PORT','5432')}/"
        f"{os.getenv('POSTGRES_DB','pivotradar')}"
    )

    params = _parse_db_url(db_url)
    output_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_file = output_dir / f"pivotradar_{ts}.dump"

    env = os.environ.copy()
    if params["password"]:
        env["PGPASSWORD"] = params["password"]

    cmd = [
        "pg_dump",
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        "-d", params["dbname"],
        "-F", "c",        # custom format (compressed, suitable for pg_restore)
        "-f", str(out_file),
    ]

    logger.info("Running backup: %s", " ".join(cmd))
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("pg_dump failed: %s", result.stderr)
        sys.exit(1)

    size_mb = out_file.stat().st_size / 1_048_576
    logger.info("Backup written: %s (%.1f MB)", out_file, size_mb)

    # Retention: delete backups older than retention_days
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    for old in output_dir.glob("pivotradar_*.dump"):
        try:
            mtime = datetime.utcfromtimestamp(old.stat().st_mtime)
            if mtime < cutoff:
                old.unlink()
                logger.info("Deleted old backup: %s", old.name)
        except Exception as e:
            logger.warning("Could not delete %s: %s", old, e)

    return out_file


def main():
    parser = argparse.ArgumentParser(description="PivotRadar PostgreSQL backup")
    parser.add_argument("--output-dir", default="/var/backups/pivotradar", help="Backup directory")
    parser.add_argument("--retention-days", type=int, default=30, help="Days to keep old backups")
    args = parser.parse_args()

    run_backup(Path(args.output_dir), retention_days=args.retention_days)


if __name__ == "__main__":
    main()
