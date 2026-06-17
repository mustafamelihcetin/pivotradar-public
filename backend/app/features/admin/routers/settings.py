# backend/app/features/admin/routers/settings.py
"""
System settings admin endpoints:
  GET  /settings
  POST /settings
  GET  /public/features
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.users.models import User
from app.features.admin.models import SystemSettings
from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
from app.features.admin.routers._shared import get_admin_user, log_admin_action

router = APIRouter()


@router.get("/settings", response_model=Dict[str, Any])
def admin_get_settings(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    """Fetch all admin settings. Returns keys as dict."""
    settings = {}
    for key in DEFAULT_SETTINGS.keys():
        settings[key] = get_system_setting(db, key)
    return settings


def _validate_settings_values(payload: dict) -> None:
    """O-9: Ayar değerlerini tip ve aralık açısından doğrula."""
    scanner = payload.get("scanner_config")
    if scanner and isinstance(scanner, dict):
        max_sym = scanner.get("max_symbols")
        if max_sym is not None and (not isinstance(max_sym, int) or not (10 <= max_sym <= 1000)):
            raise HTTPException(400, f"scanner_config.max_symbols 10-1000 arasında tam sayı olmalı, alınan: {max_sym}")
        cooldown = scanner.get("cooldown_sec")
        if cooldown is not None and (not isinstance(cooldown, (int, float)) or cooldown < 0):
            raise HTTPException(400, f"scanner_config.cooldown_sec negatif olamaz, alınan: {cooldown}")
        interval_min = scanner.get("auto_scan_interval_minutes")
        if interval_min is not None and (not isinstance(interval_min, int) or interval_min < 0):
            raise HTTPException(400, f"scanner_config.auto_scan_interval_minutes negatif olamaz")
        cal_hour = scanner.get("calibration_hour")
        if cal_hour is not None and (not isinstance(cal_hour, int) or not (0 <= cal_hour <= 23)):
            raise HTTPException(400, f"scanner_config.calibration_hour 0-23 arasında olmalı, alınan: {cal_hour}")


@router.post("/settings", response_model=Dict[str, Any])
def admin_update_settings(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update system settings. Payload: { "key": { "nested": "val" } } — only DEFAULT_SETTINGS keys accepted."""
    unknown = [k for k in payload if k not in DEFAULT_SETTINGS]
    if unknown:
        raise HTTPException(400, f"Bilinmeyen ayar anahtarları: {unknown}")
    _validate_settings_values(payload)  # O-9: değer doğrulaması
    for key, value in payload.items():
        row = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if not row:
            # If not in DB, we should merge with DEFAULT if possible
            base_val = DEFAULT_SETTINGS.get(key, {})
            if isinstance(base_val, dict) and isinstance(value, dict):
                merged = {**base_val, **value}
            else:
                merged = value
            row = SystemSettings(key=key, value=merged)
            db.add(row)
        else:
            # Atomic update for JSON fields to avoid full overwrite if only parity is sent
            if isinstance(row.value, dict) and isinstance(value, dict):
                # We need to manually update it because SQLAlchemy's JSON column
                # might not track deep changes if we assigned to a sub-dict?
                # Actually, replacing the whole top-level key is safer but merging here is better
                new_val = {**row.value, **value}
                row.value = new_val
            else:
                row.value = value

            # Mark it modified for SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(row, "value")

    db.commit()
    log_admin_action(db, admin, "UPDATE_SETTINGS", ", ".join(payload.keys()), payload)

    # Sync Scheduler if scanner_config changed
    if "scanner_config" in payload:
        try:
            from app.core.scheduler import scheduler_manager
            from app.features.scanner.tasks import run_auto_scan
            from app.features.scoring.ml.training import run_calibration_pipeline

            # Fetch the final merged config from DB for scheduling
            row = db.query(SystemSettings).filter(SystemSettings.key == "scanner_config").first()
            cfg = row.value if row else DEFAULT_SETTINGS["scanner_config"]

            # Re-register auto_scan job with current settings
            if cfg.get("auto_scan_enabled"):
                minutes = int(cfg.get("auto_scan_interval_minutes", 15))
                hours   = int(cfg.get("auto_scan_interval_hours", 0))

                # Minimum frequency protection
                if minutes == 0 and hours == 0:
                    minutes = 15

                scheduler_manager.add_interval_job(
                    run_auto_scan,
                    job_id="auto_scan",
                    minutes=minutes,
                    hours=hours,
                )
                logging.info(f"Scheduler: auto_scan updated -> every {hours}h {minutes}m")
            else:
                scheduler_manager.remove_job("auto_scan")
                logging.info("Scheduler: auto_scan job stopped.")

            # Re-register calibration job
            cal_hour = int(cfg.get("calibration_hour", 3))
            scheduler_manager.add_cron_job(
                run_calibration_pipeline,
                hour=cal_hour,
                minute=0,
                job_id="ml_calibration"
            )
            logging.info(f"Scheduler: ml_calibration updated -> daily at {cal_hour:02d}:00")

            # Re-register db_maintenance job (1 hour after calibration)
            from app.features.admin.tasks import run_db_maintenance
            scheduler_manager.add_cron_job(
                run_db_maintenance,
                hour=(cal_hour + 1) % 24,
                minute=0,
                job_id="db_maintenance"
            )
            logging.info(f"Scheduler: db_maintenance updated -> daily at {(cal_hour + 1) % 24:02d}:00")

        except Exception as e:
            logging.error(f"Scheduler sync error: {e}")

    return {"ok": True, "updated_keys": list(payload.keys())}


@router.get("/public/features", response_model=Dict[str, Any])
def get_public_features(db: Session = Depends(get_db)):
    """
    Frontend için kamuya açık özellik flag'leri. Hassas/dahili flag'ler döndürülmez.
    Yalnızca kullanıcı arayüzü flag'leri paylaşılır; maintenance_mode ve logs gibi
    operasyonel flag'ler admin-only endpoint'ten okunmalı.
    """
    all_flags = get_system_setting(db, "feature_flags", DEFAULT_SETTINGS["feature_flags"])
    # Kamuya açık güvenli flag'ler — sistem durumu bilgisi içermeyenler
    _PUBLIC_SAFE_FLAGS = {"ticker_bar", "scanner", "backtest", "strategy", "help", "registration"}
    return {k: v for k, v in all_flags.items() if k in _PUBLIC_SAFE_FLAGS}
