# backend/app/features/scanner/routers/api_public.py
import time
import threading
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db, SessionLocal
from app.features.scanner.models import ScanScore
from app.features.users.router import get_current_user
from app.features.users.models import User

logger = logging.getLogger("PivotRadar.ScanPrices")

router = APIRouter()

_SHOWCASE_CACHE: dict = {"ts": 0.0, "data": None}
_SHOWCASE_TTL = 3600.0

@router.get("/scan/showcase")
def api_showcase():
    now = time.time()
    if _SHOWCASE_CACHE["data"] is not None and (now - _SHOWCASE_CACHE["ts"]) < _SHOWCASE_TTL:
        return _SHOWCASE_CACHE["data"]

    db = SessionLocal()
    try:
        latest_session = (
            db.query(ScanScore.scan_session_id)
            .filter(ScanScore.scan_session_id.isnot(None), ScanScore.qrs_score.isnot(None))
            .order_by(ScanScore.scanned_at.desc())
            .first()
        )
        if not latest_session:
            return {"items": [], "source": "no_scan_data"}

        rows = (
            db.query(ScanScore)
            .filter(
                ScanScore.scan_session_id == latest_session.scan_session_id,
                ScanScore.qrs_score.isnot(None),
            )
            .order_by(ScanScore.qrs_score.desc())
            .limit(4)
            .all()
        )

        items = []
        for r in rows:
            sym = (r.symbol or "").replace(".IS", "").strip().upper()
            items.append({
                "sym": sym,
                "qrs": round(float(r.qrs_score or 0), 1),
                "ml": round(float(r.ml_score or 0)),
                "rsi": round(float(r.rsi or 50), 1),
                "delta": f"{'+' if (r.change_pct or 0) >= 0 else ''}{round(float(r.change_pct or 0), 2)}%",
                "close": round(float(r.close_price or 0), 2),
            })

        result = {"items": items, "source": "live_scan"}
        _SHOWCASE_CACHE["ts"]   = time.time()
        _SHOWCASE_CACHE["data"] = result
        return result
    except Exception:
        return {"items": [], "source": "error"}
    finally:
        db.close()


_SIGNALS_CACHE: dict = {"ts": 0.0, "data": None}
_SIGNALS_TTL = 300.0  # 5 minutes

@router.get("/scanner/signals")
def api_market_signals():
    """Returns cached global macro signals (VIX, BIST100, USDTRY, market_regime). No auth required."""
    now = time.time()
    if _SIGNALS_CACHE["data"] is not None and (now - _SIGNALS_CACHE["ts"]) < _SIGNALS_TTL:
        return _SIGNALS_CACHE["data"]
    try:
        from app.features.market_data.global_signals import get_global_signals
        data = get_global_signals()
        _SIGNALS_CACHE["ts"] = now
        _SIGNALS_CACHE["data"] = data
        return data
    except Exception:
        from app.features.market_data.global_signals import DEFAULT_GLOBAL_SIGNALS
        return DEFAULT_GLOBAL_SIGNALS


_PRICES_CACHE: dict = {}
_PRICES_TTL = 300.0   # 5 dakika — canlı fiyat güncelleme penceresi
_PRICES_LOCK = threading.Lock()

@router.get("/scan/prices")
def api_batch_prices(
    symbols: str = Query(..., description="Virgülle ayrılmış sembol listesi (maks 150)"),
    _current_user: User = Depends(get_current_user),
):
    """
    Birden fazla BIST sembolü için güncel kapanış fiyatı ve günlük değişim yüzdesi döndürür.
    Sonuçlar 5 dakika cache'lenir. Her çağrıda yf.download ile tek batch isteği yapılır.
    """
    import yfinance as yf
    import pandas as pd

    raw_syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:150]
    if not raw_syms:
        return []

    cache_key = ",".join(sorted(raw_syms))
    now = time.time()

    with _PRICES_LOCK:
        cached = _PRICES_CACHE.get(cache_key)
        if cached and (now - cached["ts"]) < _PRICES_TTL:
            return cached["data"]

    try:
        tickers = [s if s.endswith(".IS") else f"{s}.IS" for s in raw_syms]
        df = yf.download(tickers, period="5d", interval="1d", auto_adjust=False, progress=False, timeout=15)

        results = []
        if df.empty:
            return []

        # df olabilir: MultiIndex (birden fazla sembol) veya düz (tek sembol)
        close_df = df.get("Close") if isinstance(df.columns, pd.MultiIndex) else df[["Close"]]
        if close_df is None or close_df.empty:
            return []

        for ticker, sym in zip(tickers, raw_syms):
            try:
                col = ticker if ticker in close_df.columns else (close_df.columns[0] if len(tickers) == 1 else None)
                if col is None:
                    continue
                series = close_df[col].dropna()
                if len(series) < 1:
                    continue
                current_close = float(series.iloc[-1])
                prev_close = float(series.iloc[-2]) if len(series) >= 2 else current_close
                change_pct = round((current_close - prev_close) / prev_close * 100, 2) if prev_close else 0.0
                results.append({"symbol": sym, "close": round(current_close, 4), "change_pct": change_pct})
            except Exception:
                continue

        with _PRICES_LOCK:
            _PRICES_CACHE[cache_key] = {"ts": time.time(), "data": results}

        return results

    except Exception as e:
        logger.warning("Batch fiyat hatası: %s", e)
        return []


_PERF_CACHE: dict = {"ts": 0.0, "data": None}
_PERF_TTL = 1800.0  # 30 minutes


@router.get("/scan/performance-summary")
def api_performance_summary(
    days: int = 90,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    System-level alpha vs BIST100 performance summary.
    Returns overall hit_rate, avg_alpha, avg_return, n_evaluated for the lookback window.
    Cached for 30 minutes.
    """
    import datetime
    from sqlalchemy import text

    now = time.time()
    cached = _PERF_CACHE.get("data")
    if cached and (now - _PERF_CACHE["ts"]) < _PERF_TTL and _PERF_CACHE.get("days") == days:
        return cached

    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat()
        rows = db.execute(
            text(
                "SELECT hit_status, alpha, actual_return_pct, outperformed_benchmark "
                "FROM scan_scores WHERE evaluated_at IS NOT NULL AND evaluated_at >= :cutoff "
                "AND target_direction IN ('bullish','bearish')"
            ),
            {"cutoff": cutoff},
        ).fetchall()

        if not rows:
            return {"n_evaluated": 0, "days": days, "source": "no_data"}

        n = len(rows)
        hits = sum(1 for r in rows if r[0] in ("target_hit", "near_miss"))
        alphas = [float(r[1]) for r in rows if r[1] is not None]
        returns = [float(r[2]) for r in rows if r[2] is not None]
        outperformed = sum(1 for r in rows if r[3])

        result = {
            "n_evaluated": n,
            "hit_rate": round(hits / n, 3),
            "avg_alpha": round(sum(alphas) / len(alphas), 2) if alphas else None,
            "avg_return_pct": round(sum(returns) / len(returns), 2) if returns else None,
            "outperform_rate": round(outperformed / n, 3),
            "n_with_alpha": len(alphas),
            "days": days,
            "source": "evaluated_scores",
        }

        _PERF_CACHE["ts"]   = time.time()
        _PERF_CACHE["data"] = result
        _PERF_CACHE["days"] = days
        return result
    except Exception:
        return {"n_evaluated": 0, "days": days, "source": "error"}
