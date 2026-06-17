# backend/app/features/admin/utils.py
import logging
from typing import Any
logger = logging.getLogger("PivotRadar.Admin")
from sqlalchemy.orm import Session
from app.features.admin.models import SystemSettings

DEFAULT_SETTINGS = {
    "ticker_symbols": [
        {"label": "BIST 100", "symbol": "XU100", "source": "public_tr"},
        {"label": "Dolar", "symbol": "USDTRY", "source": "public_tr"},
        {"label": "Euro", "symbol": "EURTRY", "source": "public_tr"},
        {"label": "Gram Altın", "symbol": "Gram Altın", "source": "public_tr"},
        {"label": "Çeyrek Altın", "symbol": "Çeyrek Altın", "source": "public_tr"},
        {"label": "Gümüş", "symbol": "Gümüş", "source": "public_tr"},
        {"label": "Brent", "symbol": "BRENT", "source": "public_tr"},
        {"label": "BTC/TRY", "symbol": "BTC-USD", "source": "binance"},
        {"label": "ETH/TRY", "symbol": "ETH-USD", "source": "binance"}
    ],
    "scanner_config": {
        "max_symbols": 200,
        "cooldown_sec": 5,
        "max_queue": 5,
        "ml_enabled": True,
        "pattern_enabled": True,
        "scan_interval_min": 0,  # Legacy
        "auto_scan_enabled": True,
        "auto_scan_interval_minutes": 15,
        "auto_scan_interval_hours": 0,
        "calibration_hour": 3,         # 03:00 AM
        "db_maintenance_hour": 4,      # 04:00 AM
        "anomaly_check_hour": 4,       # 04:30 AM
        "anomaly_check_minute": 30,
        "retrain_threshold": 20, # results
        "scan_timeout_sec": 600, # max saniye bir tarama için
    },
    "backtest_config": {
        "default_period": "1y",
        "default_strategy": "Swing"
    },
    "feature_flags": {
        "ticker_bar_enabled": True,
        "scanner_enabled": True,
        "backtest_enabled": True,
        "strategy_enabled": True,
        "logs_enabled": True,
        "help_enabled": True,
        "registration_enabled": True,
        "maintenance_mode": False,
    },
    "db_config": {
        "retention_days": 730,
        "prune_neutral_days": 90,
        "auto_prune_enabled": False,
    },
    "ml_config": {
        "min_samples": 30,
        "calib_window_days": 150,
        "half_life_days": 45,
        "soft_weights": {
            "target_hit": 1.0,
            "near_miss": 0.8,
            "partial": 0.4,
            "miss": 0.0,
        },
        "w_rule": 0.6,
        "w_ml": 0.4,
        "holdout_val_rmse_threshold": 0.58,
        "per_profile_min_samples": 20,
    },
    # Veri katmanı TTL ayarları — admin panelinden override edilebilir
    "data_config": {
        "fresh_ttl_hours": 48,   # Bu süreden taze veri birincil kaynak
        "usable_ttl_days": 30,   # Bu süreden eski veri scoring'de kullanılmaz
    },
    # PRISM veto eşikleri — admin panelinden override edilebilir
    "prism_config": {
        "raw_danger_threshold":     28.0,   # ML bu değerin altındaysa ham tehlike
        "rsi_heat_shield":          82.0,   # RSI bu değerin üzerinde skor cezalanır
        "atr_extreme_threshold":    10.0,   # ATR % bu değerin üzerinde aşırı volatilite
        "bull_trap_momentum_min":    2.0,   # Momentum bu değerin üzerinde
        "bull_trap_vol_max":         0.7,   # Hacim bu değerin altındaysa bull trap riski
        "zero_liquidity_threshold":  0.05,  # Hacim oranı bu değerin altında skor 15'e kilitlenir
    },
    # Anomali tespit eşikleri — admin panelinden override edilebilir
    "anomaly_config": {
        "win_rate_min":    0.30,   # Yönsel isabet oranı bu değerin altında kalırsa alarm
        "deviation_max":  15.0,   # Hedef büyüklük sapması bu %'yi aşarsa alarm
        "window_days":    30,     # Değerlendirme penceresi (gün)
        "min_samples":    20,     # Alarm üretmek için minimum veri sayısı
    },
}

def get_system_setting(db: Session, key: str, default: Any = None) -> Any:
    """Fetch a single system setting from database with fallback to defaults."""
    try:
        row = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if row:
            return row.value
    except Exception as _e:
        logger.debug("get_system_setting DB hatası [%s]: %s — default kullanılıyor", key, _e)
    return DEFAULT_SETTINGS.get(key, default)

# Re-export from core for backward compatibility
from app.core.market_calendar import (
    is_trading_day as is_business_day,
    add_trading_days as add_business_days
)

def is_trading_hours(dt: Any) -> bool:
    """Check if time is during BIST trading hours (10:00-18:00 Istanbul time)."""
    # Assuming dt is already Istanbul time or converted
    if not is_business_day(dt):
        return False
    # 10:00 to 18:00
    return 10 <= dt.hour < 18

def get_system_load() -> dict:
    """Returns current CPU and RAM usage percentage."""
    try:
        import psutil
        return {
            "cpu": psutil.cpu_percent(interval=0.1),
            "ram": psutil.virtual_memory().percent
        }
    except Exception:
        return {"cpu": 0.0, "ram": 0.0}

def log_admin_action(db: Session, admin_user: Any, action: str, target: str = None, details: dict = None):
    """Logs an administrative action to the database."""
    try:
        from .models import AdminAuditLog
        log = AdminAuditLog(
            admin_id=admin_user.id,
            action=action,
            target=target,
            details=details
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to log admin action: {e}")
