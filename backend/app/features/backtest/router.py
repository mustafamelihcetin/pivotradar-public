from app.features.backtest.engine import run_backtest
from app.features.backtest.prism_replay import run_prism_replay
from app.features.backtest.walk_forward import run_walk_forward, get_signal_quality_summary
from app.shared.utils.validators import validate_symbol
from fastapi import Depends, APIRouter, Query, HTTPException
from app.core.database import get_db
from fastapi.responses import JSONResponse
from app.features.users.router import get_current_user
from typing import Any, Optional
import math

router = APIRouter()


def _sanitize(obj):
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


@router.get("/backtest")
async def api_backtest(
    symbol: str = Query(..., description="BIST hisse kodu (örn: AKBNK)"),
    profile: Optional[str] = Query(None, description="Strateji profili (Swing, Trend vb.)"),
    rsi_buy: float  = Query(35.0,  ge=10,  le=50,  description="RSI alım eşiği"),
    rsi_sell: float = Query(65.0,  ge=50,  le=90,  description="RSI satım eşiği"),
    use_ema: bool   = Query(True,  description="EMA 5/20 kesişim filtresi"),
    use_bb: bool    = Query(False, description="Bollinger Alt Band dokunuşu"),
    capital: float  = Query(10000.0, ge=100, description="Başlangıç sermayesi (TL)"),
    commission_pct: float = Query(0.1, ge=0.0, le=1.0, description="Komisyon oranı (%, örn: 0.1 = %0.1)"),
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
    flags = get_system_setting(db, "feature_flags", DEFAULT_SETTINGS["feature_flags"])
    if not flags.get("backtest_enabled", True) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Backtest modülü şu anda bakımdadır.")

    symbol = validate_symbol(symbol)
    try:
        result = run_backtest(
            symbol=symbol,
            profile_name=profile,
            rsi_buy=rsi_buy,
            rsi_sell=rsi_sell,
            use_ema_filter=use_ema,
            use_bb_filter=use_bb,
            initial_capital=capital,
            commission_pct=commission_pct / 100.0,
        )
        return JSONResponse(_sanitize(result))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.get("/backtest/prism-replay")
async def api_prism_replay(
    qrs_threshold: float = Query(65.0, ge=50, le=95, description="Minimum QRS eşiği"),
    top_n: int           = Query(5,    ge=1,  le=10, description="Her dönemde seçilen maksimum sinyal sayısı"),
    capital: float       = Query(10000.0, ge=100,    description="Başlangıç sermayesi (TL)"),
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """
    PRISM geçmiş sinyallerini kör takip eden eğitim amaçlı simülasyon.
    SPK UYARI: Yatırım tavsiyesi değildir. Geçmiş performans geleceği garanti etmez.
    """
    from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
    flags = get_system_setting(db, "feature_flags", DEFAULT_SETTINGS["feature_flags"])
    if not flags.get("backtest_enabled", True) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Backtest modülü şu anda bakımdadır.")

    try:
        result = run_prism_replay(
            db=db,
            qrs_threshold=qrs_threshold,
            top_n=top_n,
            initial_capital=capital,
        )
        return JSONResponse(_sanitize(result))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.get("/backtest/walk-forward")
async def api_walk_forward(
    profile: Optional[str] = Query(None, description="Strateji profili (None = tümü)"),
    lookback_months: int    = Query(12, ge=3, le=36, description="Geriye bakış penceresi (ay)"),
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Walk-forward signal quality validation with slippage, drawdown, IS/OOS split."""
    result = run_walk_forward(db, profile_name=profile, lookback_months=lookback_months)
    return JSONResponse(_sanitize(result))


@router.get("/backtest/signal-quality")
async def api_signal_quality_summary(
    current_user: Any = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Per-profile signal quality summary for admin dashboard."""
    result = get_signal_quality_summary(db)
    return JSONResponse(_sanitize(result))
