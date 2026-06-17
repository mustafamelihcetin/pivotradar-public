import time
import os
import json as _json
from pathlib import Path as _Path
from fastapi import Depends, APIRouter
from fastapi.responses import JSONResponse
from app.features.users.router import get_current_user
from app.core.database import get_db
from sqlalchemy.orm import Session
from typing import Any

from .ticker_service import ticker_service

router = APIRouter()

_KATILIM_PATH = _Path(__file__).parent.parent / "market_data" / "assets" / "universe" / "bist_katilim.json"

@router.get("/meta/bist-names")
def api_bist_names():
    """Tüm BIST sembollerinin şirket adları (flat dict). Frontend için hızlı fallback."""
    try:
        from app.features.market_data.data.universe_bist import get_company_name, load_universe
        df = load_universe()
        names = {sym: get_company_name(sym) for sym in df["symbol"].tolist() if sym != get_company_name(sym)}
        return JSONResponse(names)
    except Exception:
        return JSONResponse({})

@router.get("/meta/katilim")
def api_katilim_list():
    """BIST Katılım Endeksi bileşen listesi. Public endpoint."""
    try:
        data = _json.loads(_KATILIM_PATH.read_text("utf-8"))
        return JSONResponse(data)
    except Exception:
        return JSONResponse([])

@router.get("/ticker")
async def api_ticker():
    """Alt bar için canlı verileri döner. Public endpoint (Guest desteği)."""
    data = ticker_service.get_data()
    return JSONResponse(data)

@router.get("/ping")
async def api_ping(current_user: Any = Depends(get_current_user)):
    """Bağlantı testi."""
    return {"ok": True, "ts": time.time()}

@router.get("/features")
async def api_features(db: Session = Depends(get_db)):
    """Public feature flags — no auth required. Frontend uses this to enable/disable UI features."""
    try:
        from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
        return get_system_setting(db, "feature_flags", DEFAULT_SETTINGS["feature_flags"])
    except Exception:
        return {
            "ticker_bar_enabled": True, "scanner_enabled": True, "backtest_enabled": True,
            "strategy_enabled": True, "logs_enabled": True, "help_enabled": True,
            "registration_enabled": True, "maintenance_mode": False,
        }
