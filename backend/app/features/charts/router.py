from .engine import build_chart_for_symbol
from ...shared.utils.validators import validate_symbol, validate_period
from datetime import datetime, timedelta
from fastapi import Depends, APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from ..users.router import get_current_user, get_current_user_optional
from ...core.database import SessionLocal
from typing import Any, Optional
import asyncio
import datetime as _dt
import json
import math
import time
import threading


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _fetch_cached_pattern(db, symbol: str) -> Optional[dict]:
    """Scanner'ın son taramasındaki pattern sonucunu oku. 4 saatten eski ise None döner."""
    try:
        from ..scanner.models import SymbolDataCache
        row = (
            db.query(SymbolDataCache)
            .filter(SymbolDataCache.symbol == symbol.upper())
            .order_by(SymbolDataCache.data_date.desc(), SymbolDataCache.scanned_at.desc())
            .first()
        )
        if row is None or not row.pattern_json:
            return None
        # 4 saatten eski cache → fresh detection yap
        if row.scanned_at:
            age = _dt.datetime.now(_dt.timezone.utc) - row.scanned_at.replace(tzinfo=_dt.timezone.utc)
            if age.total_seconds() > 4 * 3600:
                return None
        return json.loads(row.pattern_json)
    except Exception:
        return None

router = APIRouter()

# ── In-memory chart response cache ───────────────────────────────────────────
_CHART_CACHE: dict = {}       # key → (payload, expires_at)
_CHART_CACHE_LOCK = threading.Lock()

def _chart_cache_ttl() -> int:
    """BIST açıksa 3 dakika, kapalıysa 30 dakika."""
    from ...core.time_utils import now_utc
    from datetime import time as dtime
    now_tr = now_utc().replace(tzinfo=None) + timedelta(hours=3)
    if now_tr.weekday() < 5:
        curr = now_tr.time()
        if dtime(9, 50) <= curr <= dtime(18, 20):
            return 180    # piyasa açık: 3 dk
    return 1800           # piyasa kapalı: 30 dk

def _get_chart_cache(key):
    with _CHART_CACHE_LOCK:
        entry = _CHART_CACHE.get(key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        if entry:
            del _CHART_CACHE[key]
    return None

def _set_chart_cache(key, payload):
    ttl = _chart_cache_ttl()
    with _CHART_CACHE_LOCK:
        # Bellek patlamasını önle — max 200 giriş
        if len(_CHART_CACHE) >= 200:
            oldest = min(_CHART_CACHE, key=lambda k: _CHART_CACHE[k][1])
            del _CHART_CACHE[oldest]
        _CHART_CACHE[key] = (payload, time.monotonic() + ttl)

def _sanitize(obj):
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

@router.get("/chart")
def api_chart(
    symbol: str = Query(...),
    mode: Optional[str] = Query("candle"),
    period: Optional[str] = Query("6M"),
    ml_score: Optional[float] = Query(None),
    qrs_score: Optional[float] = Query(None),
    profile_name: Optional[str] = Query(None),
    current_user: Optional[Any] = Depends(get_current_user_optional),
    db: Any = Depends(_get_db),
):
    symbol = validate_symbol(symbol)
    period = validate_period(period or "6M")

    # ml/qrs'yi 5'in katına yuvarla — küçük farklar ayrı cache girişi açmasın
    ml_bucket  = round(ml_score  / 5) * 5  if ml_score  is not None else None
    qrs_bucket = round(qrs_score / 5) * 5  if qrs_score is not None else None
    cache_key  = f"{symbol}|{mode}|{period}|{ml_bucket}|{qrs_bucket}|{profile_name or 'Güvenli Liman'}"

    cached = _get_chart_cache(cache_key)
    if cached is not None:
        return JSONResponse(cached)

    import logging as _logging
    _chart_logger = _logging.getLogger(__name__)

    # Scanner'ın önceden hesapladığı pattern sonucunu oku (tutarlılık + CPU tasarrufu).
    precomputed_pattern = _fetch_cached_pattern(db, symbol)

    try:
        fetch_days = 730
        from ...core.time_utils import now_utc
        start_date = (now_utc() - timedelta(days=fetch_days)).strftime('%Y-%m-%d')
        payload = build_chart_for_symbol(
            symbol, mode, days=fetch_days,
            ml_score=ml_score, qrs_score=qrs_score,
            start_date=start_date,
            profile_name=profile_name or "Güvenli Liman",
            precomputed_pattern=precomputed_pattern,
        )
        payload["initial_period_hint"] = period
        payload = _sanitize(payload)
        _set_chart_cache(cache_key, payload)

        # Grafik sonucunu logla
        try:
            _av = payload.get("ai_vision") or {}
            _ptype = _av.get("detected_type", "Formasyon Yok")
            _pconf = float(_av.get("confidence", 0))
            _sec   = (_av.get("secondary_pattern") or {})
            _stype = _sec.get("detected_type", "")
            _sconf = float(_sec.get("confidence", 0))
            _src   = "önbellek" if precomputed_pattern else "taze tespit"
            _sec_str = f"  +[{_stype} {_sconf:.0%}]" if _stype and _stype not in ("Formasyon Yok","NONE","") else ""
            _chart_logger.info("[CHART] %-8s | %-28s %3.0f%%  | %s%s", symbol, _ptype, _pconf*100, _src, _sec_str)
        except Exception:
            pass

        # Grafik freshly detect ettiyse (scanner cache'i yoktu/eskiydi), sonucu DB'ye yaz
        # ve L1+L2 önbelleği temizle → tablo da güncel formasyonu gösterir.
        if precomputed_pattern is None:
            try:
                from ..scanner.models import SymbolDataCache
                _av = payload.get("ai_vision") or {}
                _dt = _av.get("detected_type", "")
                _conf = float(_av.get("confidence", 0))
                if _dt and _dt not in ("Formasyon Yok", "NONE", "") and _conf >= 0.30:
                    _pj = json.dumps(
                        {k: v for k, v in _av.items() if k != "debug"},
                        default=str, separators=(",", ":")
                    )
                    _row = (
                        db.query(SymbolDataCache)
                        .filter(SymbolDataCache.symbol == symbol.upper())
                        .order_by(SymbolDataCache.data_date.desc(), SymbolDataCache.scanned_at.desc())
                        .first()
                    )
                    if _row:
                        _row.pattern_name = _dt
                        _row.pattern_json = _pj
                        db.commit()
                        _chart_logger.info("[CHART] WRITEBACK %-8s → %s (%.0f%%) → data_date=%s",
                                           symbol, _dt, _conf * 100,
                                           getattr(_row, "data_date", "?"))
                        # L1 temizle + L2'de bu sembolün pattern_name'ini güncelle
                        try:
                            from ..scanner.routers.api_scan import flush_analyze_cache
                            flush_analyze_cache(symbol=symbol, pattern_name=_dt)
                        except Exception:
                            pass
            except Exception:
                pass

        return JSONResponse(payload)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# A-3b: İntraday grafik verisi
# hours_back → sadece x0/x1 hint olarak frontend'e gönderilir; cutoff yapılmaz (hafta sonu koruması)
_INTRADAY_CFG = {
    "1H":  {"yf_period": "5d",  "interval": "5m",  "hours_back": 3},
    "6H":  {"yf_period": "5d",  "interval": "30m", "hours_back": 10},
    "1D":  {"yf_period": "5d",  "interval": "1h",  "hours_back": 48},
}

@router.get("/chart/intraday")
def api_chart_intraday(
    symbol: str = Query(...),
    period: str = Query("1D"),
    current_user: Optional[Any] = Depends(get_current_user_optional),
):
    import yfinance as yf
    import math as _math

    sym = validate_symbol(symbol)
    cfg = _INTRADAY_CFG.get(period.upper(), _INTRADAY_CFG["1D"])
    yf_ticker = f"{sym}.IS" if "." not in sym else sym

    cache_key = f"intraday|{sym}|{period}"
    cached = _get_chart_cache(cache_key)
    if cached is not None:
        return JSONResponse(cached)

    try:
        ticker_obj = yf.Ticker(yf_ticker)
        df = ticker_obj.history(period=cfg["yf_period"], interval=cfg["interval"], auto_adjust=False)

        if df.empty:
            return JSONResponse({"status": "error", "message": "İntraday veri bulunamadı"}, status_code=404)

        # TZ → UTC naive (frontend string karşılaştırması için)
        if df.index.tz is not None:
            df.index = df.index.tz_convert("UTC").tz_localize(None)

        def _fmt(v):
            if v is None: return None
            f = float(v)
            return None if not _math.isfinite(f) else round(f, 4)

        xs     = df.index.strftime("%Y-%m-%d %H:%M:%S").tolist()
        opens  = [_fmt(v) for v in df["Open"].tolist()]
        highs  = [_fmt(v) for v in df["High"].tolist()]
        lows   = [_fmt(v) for v in df["Low"].tolist()]
        closes = [_fmt(v) for v in df["Close"].tolist()]

        payload = {
            "figure": {
                "data": [{
                    "type": "candlestick",
                    "x":     xs,
                    "open":  opens,
                    "high":  highs,
                    "low":   lows,
                    "close": closes,
                    "name":  sym,
                    "increasing": {"line": {"color": "#34d399"}},
                    "decreasing": {"line": {"color": "#f87171"}},
                    "hoverinfo": "x+y",
                }]
            }
        }
        _set_chart_cache(cache_key, payload)
        return JSONResponse(payload)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# A-3c: Temel veriler (yfinance .info) — 1 saatlik cache
@router.get("/chart/fundamentals")
def api_chart_fundamentals(
    symbol: str = Query(...),
    current_user: Optional[Any] = Depends(get_current_user_optional),
):
    import yfinance as yf

    sym = validate_symbol(symbol)
    cache_key = f"fundamentals|{sym}"
    cached = _get_chart_cache(cache_key)
    if cached is not None:
        return JSONResponse(cached)

    try:
        yf_ticker = f"{sym}.IS" if "." not in sym else sym
        info = yf.Ticker(yf_ticker).info

        def _safe(key):
            v = info.get(key)
            if v is None:
                return None
            try:
                f = float(v)
                return None if not math.isfinite(f) else f
            except Exception:
                return None

        payload = {}

        # Gerçekçi fiyat referansı — bölünme-öncesi hatalı veri filtresi için kullanılır
        _ref_price = _safe("previousClose") or _safe("regularMarketPrice") or _safe("currentPrice")

        for key, out_key, rnd in [
            ("previousClose", "prev_close", 4),
            ("dayLow",        "day_low",    4),
            ("dayHigh",       "day_high",   4),
            ("fiftyTwoWeekLow",  "week52_low",  4),
            ("fiftyTwoWeekHigh", "week52_high", 4),
            ("marketCap",     "market_cap", 0),
            ("trailingPE",    "pe_ratio",   2),
            ("priceToBook",   "pb_ratio",   2),
            ("beta",          "beta",       2),
            ("trailingEps",   "eps",        4),
        ]:
            v = _safe(key)
            if v is not None:
                # 52-haftalık yüksek/düşük için bölünme hatası koruması
                if out_key in ("week52_high", "week52_low") and _ref_price and _ref_price > 0:
                    if v > _ref_price * 5 or v < _ref_price / 5:
                        continue  # bölünme-öncesi hatalı veri, atla
                payload[out_key] = round(v, rnd) if rnd else v

        # Ortalama hacim — int
        avg_vol = _safe("averageVolume")
        if avg_vol is not None:
            payload["avg_volume"] = int(avg_vol)

        # ROE — yfinance bunu 0..1 aralığında döndürür, %'ye çevir
        roe = _safe("returnOnEquity")
        if roe is not None:
            payload["roe"] = round(roe * 100, 1)

        # Temettü verimi — yfinance 0..1 aralığında, %'ye çevir
        div = _safe("dividendYield")
        if div is not None:
            payload["dividend_yield"] = round(div * 100, 2)

        # 1 saatlik cache
        with _CHART_CACHE_LOCK:
            if len(_CHART_CACHE) >= 200:
                oldest = min(_CHART_CACHE, key=lambda k: _CHART_CACHE[k][1])
                del _CHART_CACHE[oldest]
            _CHART_CACHE[cache_key] = (payload, time.monotonic() + 3600)

        return JSONResponse(payload)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# A-4: SSE canlı fiyat akışı.
# Bağlanan frontend her interval saniyede bir fiyat güncellemesi alır.
# Polling'in yerini alır: bağlantı korunduğu sürece veri akar.
@router.get("/chart/live-price")
async def live_price_stream(
    request: Request,
    symbol: str = Query(...),
    interval: int = Query(15, ge=5, le=60),   # saniye; min 5, max 60
    current_user: Optional[Any] = Depends(get_current_user_optional),
):
    """
    Server-Sent Events akışı: her {interval} saniyede sembol için son fiyat gönderir.
    Frontend tarafında EventSource ile bağlanılır:
      const es = new EventSource('/api/chart/live-price?symbol=SASA')
      es.onmessage = (e) => { const d = JSON.parse(e.data); ... }
    """
    sym = validate_symbol(symbol)

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                from ...features.market_data.service import MarketDataService
                svc = MarketDataService()
                bundle = svc.fetch_price_df(sym, lookback_days=3)
                df = bundle.df if bundle else None
                if df is not None and not df.empty:
                    last_close = float(df["Close"].iloc[-1])
                    prev_close = float(df["Close"].iloc[-2]) if len(df) >= 2 else last_close
                    change_pct = round((last_close - prev_close) / prev_close * 100, 2) if prev_close else 0.0
                    payload = {
                        "symbol":     sym,
                        "price":      round(last_close, 2),
                        "change_pct": change_pct,
                        "ts":         datetime.utcnow().isoformat() + "Z",
                        "source":     bundle.source if bundle else "unknown",
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                else:
                    yield f"data: {json.dumps({'symbol': sym, 'error': 'no_data'})}\n\n"
            except Exception as _e:
                yield f"data: {json.dumps({'symbol': sym, 'error': str(_e)[:100]})}\n\n"

            await asyncio.sleep(interval)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # nginx proxy buffering'i kapat
        },
    )
