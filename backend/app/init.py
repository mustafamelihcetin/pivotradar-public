# backend/app/init.py
"""
Standalone system initialization script.
To be run before the main application starts.
"""
import logging
import time
from app.core.bootstrap import (
    _verify_system_integrity,
    run_schema_migrations,
    run_runtime_patches,
    run_data_seeding,
    _bootstrap_ml_calib,
    _reset_scanner_state
)
from app.core.database import engine, Base
# Import all models to ensure they are registered with Base.metadata
import app.features.scanner.models
import app.features.users.models
import app.features.admin.models
import app.features.support.models

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("PivotRadar.Init")

def initialize_system():
    _t0 = time.monotonic()
    logger.info("PIVOTRADAR — SYSTEM INITIALIZATION STARTING...")

    def _phase(name: str, fn):
        _ts = time.monotonic()
        try:
            fn()
            logger.info(f"INIT [{name}] SUCCESS ({int((time.monotonic()-_ts)*1000)}ms)")
        except Exception as e:
            logger.error(f"INIT [{name}] FAILED: {e}")

    _phase("integrity",   _verify_system_integrity)
    _phase("create_all",  lambda: Base.metadata.create_all(bind=engine))
    _phase("migrations",  run_schema_migrations)
    _phase("patches",     run_runtime_patches)
    _phase("seeding",     run_data_seeding)
    _phase("ml_calib",    _bootstrap_ml_calib)
    _phase("scanner_rst", _reset_scanner_state)

    logger.info(f"PIVOTRADAR — SYSTEM INITIALIZATION COMPLETE in {int((time.monotonic()-_t0)*1000)}ms")

if __name__ == "__main__":
    initialize_system()
