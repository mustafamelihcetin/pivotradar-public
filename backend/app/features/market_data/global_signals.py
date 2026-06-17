# backend/app/features/market_data/global_signals.py
"""
Global market context signals — fetched once per scan, cached 30 minutes.
Provides macro/sector context for profile-level scoring adjustments.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any

logger = logging.getLogger("PivotRadar.GlobalSignals")

# ── Tickers ───────────────────────────────────────────────────────────────────
_VIX_TICKER    = "^VIX"
_SP500_TICKER  = "^GSPC"
_USDTRY_TICKER = "TRY=X"
_BIST100_TICKER = "XU100.IS"

SECTOR_TICKERS: Dict[str, str] = {
    "XBANK": "XBANK.IS",
    "XUSIN": "XUSIN.IS",
    "XGIDA": "XGIDA.IS",
    "XELKT": "XELKT.IS",
    "XTCRT": "XTCRT.IS",
    "XHOLD": "XHOLD.IS",
    "XKMYA": "XKMYA.IS",
}

DEFAULT_GLOBAL_SIGNALS: Dict[str, Any] = {
    "bist100_trend_5d":    0.0,
    "bist100_trend_20d":   0.0,    # 1 aylık BIST100 trendi — kısa vadeli gürültüyü filtreler
    "vix_regime":          0,       # 0=normal, 1=elevated(>20), 2=fear(>30)
    "sp500_trend_5d":      0.0,
    "usdtry_change_5d":    0.0,
    "em_signal":           0.0,
    "sector_returns":      {},      # sector_key → 5d return %
    "market_regime":       0.0,     # derived: vix_regime*10 + trend_dir
}

# ── In-process cache ──────────────────────────────────────────────────────────
_CACHE_TTL: float = 1800.0   # 30 minutes
_cache_data: Dict[str, Any] = {}
_cache_ts: float = 0.0
_cache_lock = None   # lazily initialized (avoid module-level threading import)


def _get_lock():
    import threading
    global _cache_lock
    if _cache_lock is None:
        _cache_lock = threading.Lock()
    return _cache_lock


def _to_scalar(v) -> float:
    """yfinance bazen tek elemanlı Series döndürür; .iloc[0] ile scalar'a çevir."""
    import pandas as pd
    if isinstance(v, pd.Series):
        return float(v.iloc[0])
    return float(v)


def _fetch_5d_return(ticker: str) -> float:
    """Returns the 5-day % return for a ticker. Raises on failure (let caller decide fallback)."""
    import yfinance as yf
    df = yf.download(ticker, period="15d", interval="1d", progress=False, threads=False)
    if df is None or df.empty or len(df) < 2:
        raise ValueError(f"No data returned for {ticker}")
    closes = df["Close"].dropna()
    if len(closes) < 2:
        raise ValueError(f"Insufficient closes for {ticker}")
    n = min(5, len(closes) - 1)
    last = _to_scalar(closes.iloc[-1])
    prev = _to_scalar(closes.iloc[-1 - n])
    return float((last - prev) / prev * 100.0)


def _fetch_nd_return(ticker: str, n_days: int) -> float:
    """Returns the n-day % return for a ticker using extra buffer for weekend/holiday gaps."""
    import yfinance as yf
    buffer = max(30, n_days * 2)
    df = yf.download(ticker, period=f"{buffer}d", interval="1d", progress=False, threads=False)
    if df is None or df.empty or len(df) < 2:
        raise ValueError(f"No data returned for {ticker}")
    closes = df["Close"].dropna()
    if len(closes) < 2:
        raise ValueError(f"Insufficient closes for {ticker}")
    n = min(n_days, len(closes) - 1)
    last = _to_scalar(closes.iloc[-1])
    prev = _to_scalar(closes.iloc[-1 - n])
    return float((last - prev) / prev * 100.0)


def _fetch_vix_level() -> float:
    """Returns the latest VIX close. Raises on failure (let caller decide fallback)."""
    import yfinance as yf
    df = yf.download(_VIX_TICKER, period="5d", interval="1d", progress=False, threads=False)
    if df is None or df.empty:
        raise ValueError("No VIX data returned")
    closes = df["Close"].dropna()
    if len(closes) == 0:
        raise ValueError("Empty VIX closes")
    return _to_scalar(closes.iloc[-1])


def _refresh_signals(stale: Dict[str, Any]) -> Dict[str, Any]:
    """Fetches all global signals in parallel. Uses stale values as fallback on failure."""
    signals: Dict[str, Any] = dict(stale) if stale else dict(DEFAULT_GLOBAL_SIGNALS)
    stale_sectors: Dict[str, float] = signals.get("sector_returns") or {}
    sector_returns: Dict[str, float] = dict(stale_sectors)

    # Build task map: result_key → callable
    tasks: Dict[str, Any] = {
        "vix":          _fetch_vix_level,
        "bist100":      lambda: _fetch_5d_return(_BIST100_TICKER),
        "bist100_20d":  lambda: _fetch_nd_return(_BIST100_TICKER, 20),
        "sp500":        lambda: _fetch_5d_return(_SP500_TICKER),
        "usdtry":       lambda: _fetch_5d_return(_USDTRY_TICKER),
        **{f"sector_{k}": (lambda t=t: _fetch_5d_return(t)) for k, t in SECTOR_TICKERS.items()},
    }

    with ThreadPoolExecutor(max_workers=6) as ex:
        future_to_key = {ex.submit(fn): key for key, fn in tasks.items()}
        for future in as_completed(future_to_key, timeout=15):
            key = future_to_key[future]
            try:
                val = future.result()
                if key == "vix":
                    if val >= 30.0:
                        signals["vix_regime"] = 2
                    elif val >= 20.0:
                        signals["vix_regime"] = 1
                    else:
                        signals["vix_regime"] = 0
                elif key == "bist100":
                    signals["bist100_trend_5d"] = val
                elif key == "bist100_20d":
                    signals["bist100_trend_20d"] = val
                elif key == "sp500":
                    signals["sp500_trend_5d"] = val
                elif key == "usdtry":
                    signals["usdtry_change_5d"] = val
                elif key.startswith("sector_"):
                    sector_returns[key[7:]] = val
            except Exception as e:
                if isinstance(e, ValueError) and "No data returned" in str(e):
                    logger.debug("GlobalSignals: %s veri yok (piyasa kapalı?) — %s", key, e)
                else:
                    logger.warning("GlobalSignals: %s fetch failed, keeping stale — %s", key, e)

    signals["sector_returns"] = sector_returns

    # EM signal: dolar-bazlı BIST yaklaşımı + SP500 global risk duyarlılığı.
    # Eski: (SP500 + BIST100_TRY) / 2 → farklı para birimlerinin aritmetik ortalaması anlamsız.
    # Yeni: BIST'in dolar cinsinden yaklaşık getirisi = nominal TRY getiri - TRY değer kaybının yarısı.
    # (Tam hesap: BIST_USD = (1+BIST_TRY/100) / (1+USDTRY/100) - 1; basitleştirilmiş versiyon yeterli)
    try:
        bist_usd_approx = signals["bist100_trend_5d"] - (signals["usdtry_change_5d"] * 0.5)
        signals["em_signal"] = round((bist_usd_approx + signals["sp500_trend_5d"]) / 2.0, 3)
    except Exception:
        pass

    # Derived regime feature: vix_regime * 10 + bist100 trend direction
    try:
        _vix_r = signals["vix_regime"]
        _bist_t = signals["bist100_trend_5d"]
        _trend_dir = 1 if _bist_t > 0.01 else (-1 if _bist_t < -0.01 else 0)
        signals["market_regime"] = float(_vix_r) * 10.0 + float(_trend_dir)
    except Exception:
        pass

    return signals


def get_global_signals(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Returns cached global signals, refreshing if the cache is stale (>30 min).
    Thread-safe. Returns DEFAULT_GLOBAL_SIGNALS on any unexpected failure.
    """
    global _cache_data, _cache_ts
    lock = _get_lock()

    with lock:
        now = time.monotonic()
        if not force_refresh and _cache_data and (now - _cache_ts) < _CACHE_TTL:
            return dict(_cache_data)

    # Snapshot stale data to pass as fallback, then fetch outside the lock.
    with lock:
        stale_snapshot = dict(_cache_data) if _cache_data else {}

    try:
        new_data = _refresh_signals(stale_snapshot)
    except Exception as e:
        logger.warning("GlobalSignals refresh failed entirely: %s — returning stale or defaults", e)
        return stale_snapshot if stale_snapshot else dict(DEFAULT_GLOBAL_SIGNALS)

    with lock:
        now = time.monotonic()
        if force_refresh or (now - _cache_ts) >= _CACHE_TTL:
            _cache_data = new_data
            _cache_ts = now
        return dict(_cache_data)


def get_sector_rel_strength(sector_key: str, signals: Dict[str, Any] | None = None) -> float:
    """
    Returns the sector's 5d return relative to BIST100.
    Positive = sector outperforming, negative = underperforming.
    """
    if signals is None:
        signals = get_global_signals()
    bist = signals.get("bist100_trend_5d", 0.0)
    sector_ret = signals.get("sector_returns", {}).get(sector_key, 0.0)
    return round(float(sector_ret) - float(bist), 3)
