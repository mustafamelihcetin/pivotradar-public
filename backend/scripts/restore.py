#!/usr/bin/env python3
"""
PostgreSQL restore script for PivotRadar.

Usage:
    python restore.py <backup_file.dump> [--drop-existing]

WARNING: --drop-existing will drop all tables before restoring.
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
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


def run_restore(backup_file: Path, drop_existing: bool = False) -> None:
    if not backup_file.exists():
        logger.error("Backup file not found: %s", backup_file)
        sys.exit(1)

    db_url = os.getenv("DATABASE_URL") or (
        f"postgresql://{os.getenv('POSTGRES_USER','postgres')}:"
        f"{os.getenv('POSTGRES_PASSWORD','')}@"
        f"{os.getenv('POSTGRES_HOST','localhost')}:"
        f"{os.getenv('POSTGRES_PORT','5432')}/"
        f"{os.getenv('POSTGRES_DB','pivotradar')}"
    )

    params = _parse_db_url(db_url)
    env = os.environ.copy()
    if params["password"]:
        env["PGPASSWORD"] = params["password"]

    cmd = [
        "pg_restore",
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        "-d", params["dbname"],
        "--no-owner",
        "--no-privileges",
        "-v",
        str(backup_file),
    ]

    if drop_existing:
        cmd.insert(-1, "--clean")
        logger.warning("--drop-existing: all existing tables will be dropped before restore")

    logger.info("Running restore from: %s", backup_file)
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("pg_restore stderr:\n%s", result.stderr[-2000:])
        sys.exit(1)

    logger.info("Restore completed successfully")


def main():
    parser = argparse.ArgumentParser(description="PivotRadar PostgreSQL restore")
    parser.add_argument("backup_file", help="Path to .dump backup file")
    parser.add_argument("--drop-existing", action="store_true",
                        help="Drop existing tables before restoring (--clean flag)")
    args = parser.parse_args()

    run_restore(Path(args.backup_file), drop_existing=args.drop_existing)


if __name__ == "__main__":
    main()
