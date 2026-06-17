# backend/app/features/market_data/service.py
import logging
import pandas as pd
from datetime import datetime, timedelta
import yfinance as yf
from pathlib import Path
from typing import Tuple, Dict, Any, Optional, List
from app.core import settings
from app.core.time_utils import now_utc
from app.shared import ohlcv
from app.shared.ohlcv import DataQuality

logger = logging.getLogger("PivotRadar.MarketData")

_STALE_FRESH_SEC   = 172_800    # 48 saat — taze veri (birincil kaynak)
_STALE_USABLE_SEC  = 2_592_000  # 30 gün — kullanılabilir stale (grafik/chart için)


def _is_from_last_trading_day(last_ts: datetime) -> bool:
    """
    yfinance'tan gelen son barın beklenen son BIST işlem günüyle örtüşüp örtüşmediğini kontrol eder.
    Hafta sonu / tatil sonrası 24h yaşlılık kontrolünü aşmak için kullanılır.
    Cuma kapanışı → Pazartesi günü hâlâ 'taze' sayılmalıdır.
    """
    try:
        from app.core.market_calendar import is_trading_day
        data_date = last_ts.date() if hasattr(last_ts, "date") else last_ts
        today = now_utc().date()
        candidate = today
        for _ in range(10):
            if is_trading_day(candidate):
                break
            candidate -= timedelta(days=1)
        return data_date >= candidate
    except Exception:
        return False


def _clean_stale_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Stale (eski) OHLCV verisini temel veri kalitesi sorunlarından arındırır.
    Scoring için DEĞİL, grafik/chart gösterimi için kullanılmak üzere.
    - Sıfır hacimli satırları çıkar (işlem yapılmamış günler)
    - High < Low olan hatalı satırları çıkar
    - Küçük fiyat boşluklarını (≤5 iş günü) forward-fill ile doldur
    - Negatif fiyatları çıkar
    """
    if df.empty:
        return df
    try:
        # 1. Negatif fiyatları çıkar
        price_cols = [c for c in ["Open", "High", "Low", "Close"] if c in df.columns]
        if price_cols:
            df = df[(df[price_cols] > 0).all(axis=1)]

        # 2. High < Low olan veri hatalarını çıkar
        if "High" in df.columns and "Low" in df.columns:
            df = df[df["High"] >= df["Low"]]

        # 3. Sıfır hacimli satırları çıkar (hisse hiç işlem görmemiş günler)
        if "Volume" in df.columns:
            df = df[df["Volume"] > 0]

        # 4. Küçük zaman boşluklarını forward-fill ile kapat (max 5 iş günü)
        if not df.empty and isinstance(df.index, pd.DatetimeIndex):
            full_idx = pd.date_range(start=df.index.min(), end=df.index.max(), freq="B")
            df = df.reindex(full_idx)
            df = df.ffill(limit=5)
            df = df.dropna(subset=price_cols if price_cols else df.columns[:1])

    except Exception:
        pass
    return df


# ── Cloudflare Worker çağrısı ─────────────────────────────────────────────────

def _fetch_from_cf_worker(symbol: str) -> Optional[Tuple[pd.DataFrame, str]]:
    """
    Cloudflare Worker proxy'den OHLC + Floor Pivot verisi çeker.
    CF_WORKER_URL boşsa veya bağlantı hatası varsa None döner.

    Dönen DataFrame: son 1 günlük OHLC satırı (scored by engine'e yeterli)
    Aynı zamanda dönen pivot dict scanner engine'e ek bağlam sağlar.

    Returns:
        (df, src_tag)  veya  None
    """
    worker_url = getattr(settings, "CF_WORKER_URL", "")
    if not worker_url:
        return None

    import urllib.request, json as _json, ssl, time as _t
    url = f"{worker_url}?symbol={symbol}"
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    data = None
    _backoff = [0.5, 1.0, 2.0]
    for _attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                data = _json.loads(resp.read())
            break
        except Exception as e:
            logger.debug("CF Worker hatası [%d/3] (%s): %s", _attempt + 1, symbol, e)
            if _attempt < 2:
                _t.sleep(_backoff[_attempt])
    if data is None:
        return None

    # Schema validation
    if not isinstance(data, dict) or "error" in data or "ohlc" not in data:
        return None
    ohlc = data["ohlc"]
    if not isinstance(ohlc, dict) or not all(k in ohlc for k in ("close", "high", "low", "open")):
        logger.debug("CF Worker schema invalid for %s: %s", symbol, list(ohlc.keys()) if isinstance(ohlc, dict) else type(ohlc))
        return None

    try:
        close  = float(ohlc["close"]  or 0)
        high   = float(ohlc["high"]   or 0)
        low    = float(ohlc["low"]    or 0)
        open_  = float(ohlc["open"]   or close)
        volume = float(ohlc.get("volume") or 0)
    except (TypeError, ValueError) as e:
        logger.debug("CF Worker numeric parse error for %s: %s", symbol, e)
        return None

    if close <= 0 or high <= 0 or low <= 0:
        return None

    # Pivot verisi log'a yaz (ileriki kullanım için hazır)
    pivots = data.get("pivots", {})
    if pivots:
        logger.debug("CF Worker pivots %s: %s", symbol, pivots)

    try:
        date_str = data.get("date", "")
        # Tarih "DD-MM-YYYY" veya "YYYY-MM-DD" formatında gelebilir
        if date_str and "-" in date_str:
            parts = date_str.split("-")
            if len(parts[0]) == 4:   # YYYY-MM-DD
                ts = pd.Timestamp(date_str)
            else:                    # DD-MM-YYYY
                ts = pd.Timestamp(f"{parts[2]}-{parts[1]}-{parts[0]}")
        else:
            ts = pd.Timestamp(now_utc().date())
    except Exception:
        ts = pd.Timestamp(now_utc().date())

    df = pd.DataFrame([{
        "Open": open_, "High": high, "Low": low,
        "Close": close, "Volume": volume,
    }], index=[ts])
    df.index = pd.DatetimeIndex(df.index)

    src_tag = f"cf_worker|{data.get('source', 'unknown')}"
    return df, src_tag


# ── DB Gap-filling ─────────────────────────────────────────────────────────────

def _fill_gaps_from_db(df: pd.DataFrame, symbol: str, max_gap_days: int = 7) -> pd.DataFrame:
    """
    yfinance verisi son N günlük boşluk içeriyorsa,
    SymbolDataCache tablosundan eksik günler için close fiyatını doldurur.

    Bu işlev; eski verisi olan parquet dosyaları ile güncel DB kaydını harmanlayarak
    "yfinance + aradaki boşluklar DB'den doldurulur" akışını sağlar.
    """
    if df.empty:
        return df

    try:
        from app.core.database import SessionLocal
        from app.features.scanner.models import SymbolDataCache
        import pandas as pd

        # Convert index to tz-naive for comparison
        last_ts = df.index[-1]
        last_date = last_ts.date() if hasattr(last_ts, 'date') else last_ts

        db = SessionLocal()
        try:
            # Query ALL records from our DB that are newer than yfinance's last bar
            rows = (
                db.query(SymbolDataCache)
                .filter(
                    SymbolDataCache.symbol == symbol.upper(),
                    SymbolDataCache.data_date > last_date,
                    SymbolDataCache.close_price.isnot(None)
                )
                .order_by(SymbolDataCache.data_date.asc())
                .all()
            )
        finally:
            db.close()

        if not rows:
            return df

        # Stitch all found days into the history.
        # Use real OHLC from cache when available; fall back to flat bar only as last resort.
        # Flat bars (O=H=L=C, Vol=0) distort ATR and RSI — we use the previous close as
        # a reasonable Open estimate and carry cached volume when available.
        prev_close = float(df["Close"].iloc[-1]) if not df.empty else None
        new_data = []
        for r in rows:
            dt = pd.Timestamp(r.data_date)
            c = float(r.close_price)
            o = float(r.open_price) if getattr(r, "open_price", None) else (prev_close or c)
            h = float(r.high_price)  if getattr(r, "high_price",  None) else max(o, c)
            l = float(r.low_price)   if getattr(r, "low_price",   None) else min(o, c)
            v = float(r.volume)      if getattr(r, "volume",       None) else 0.0
            new_data.append({"Date": dt, "Open": o, "High": h, "Low": l, "Close": c, "Volume": v})
            prev_close = c
        
        append_df = pd.DataFrame(new_data).set_index("Date")
        df = pd.concat([df, append_df])
        df = df[~df.index.duplicated(keep='last')].sort_index()
        
        logger.debug("DB multi-gap-fill: %s — %d day(s) stitched from DB", symbol, len(rows))

    except Exception as e:
        logger.debug("DB gap-fill hatası (%s): %s", symbol, e)

    return df

class MarketDataService:
    def __init__(self):
        self.eod_dir = Path(settings.EOD_DIR)

    def stitch_hybrid(self, symbol: str, df: pd.DataFrame, yf_ticker: str, skip_live: bool = False) -> Tuple[pd.DataFrame, str]:
        """
        [V23] The Master Stitcher:
        1. Base DF (YFinance history)
        2. + DB Gaps (from previous scans)
        3. + BigPara Live Overlay (Today's minute price) — skipped when skip_live=True (scanner mode)
        """
        if df is None or df.empty:
            return pd.DataFrame(), "error:empty"

        # 1. Fill gaps from internal DB
        df = _fill_gaps_from_db(df, symbol)

        # 2. Aggressive Live Overlay (BigPara) — skip in bulk scanner mode to avoid 500×HTTP
        if skip_live:
            return df, f"yfinance|db_filled:{yf_ticker}"
        try:
            from app.features.market_data.data.yf_client import _fetch_bigpara_bar, _fetch_yf_live_bar
            _live_df, _live_ts = _fetch_bigpara_bar(symbol)
            if _live_df is None or _live_df.empty:
                _live_df, _live_ts = _fetch_yf_live_bar(yf_ticker)
            
            if _live_df is not None and not _live_df.empty and _live_ts is not None:
                # [V26] VOLUME PRESERVATION: If live bar has 0 volume, but we have existing bar for that day, keep it.
                # This prevents 'overwriting' a full day's volume with a 0-volume price check during market close.
                for idx in _live_df.index:
                    if idx in df.index:
                        existing_vol = float(df.at[idx, "Volume"]) if "Volume" in df.columns else 0
                        live_vol     = float(_live_df.at[idx, "Volume"])
                        if live_vol == 0 and existing_vol > 0:
                            _live_df.at[idx, "Volume"] = existing_vol

                df = pd.concat([df, _live_df])
                df = df[~df.index.duplicated(keep='last')].sort_index()
                df.attrs['live_ts'] = _live_ts.isoformat()
                return df, f"yfinance|hybrid:{yf_ticker}"
        except Exception as _le:
            logger.debug(f"Live overlay failed for {symbol}: {_le}")

        # Fallback to base (with gaps filled)
        return df, f"yfinance|db_filled:{yf_ticker}"


    def fetch_bulk_ohlc(self, symbols: List[str], period: str = "1y", interval: str = "1d") -> Dict[str, ohlcv.MarketDataBundle]:
        """
        Fetches OHLC for multiple symbols in a single call using yfinance.download.
        Significantly faster than symbol-by-symbol iteration.
        """
        if not symbols:
            return {}
        
        import sys
        yf_symbols = []
        mapping = {}
        for s in symbols:
            s_clean = s.strip().upper()
            if "." in s_clean or "^" in s_clean or "=" in s_clean or "-" in s_clean:
                yf_symbols.append(s_clean)
                mapping[s_clean] = s_clean
            else:
                yf_symbols.append(f"{s_clean}.IS")
                mapping[f"{s_clean}.IS"] = s_clean

        try:
            # threads=False: yfinance 0.2.50+ ile threads=True deadlock yapabiliyor.
            # group_by='ticker': (Ticker, Field) MultiIndex döndürür.
            data = yf.download(
                yf_symbols, period=period, interval=interval,
                group_by='ticker', threads=False, progress=False, auto_adjust=False,
            )
            results = {}

            if data is None or data.empty:
                return {}

            is_multi = isinstance(data.columns, pd.MultiIndex)

            for yf_s in yf_symbols:
                orig_s = mapping[yf_s]
                try:
                    if len(yf_symbols) == 1:
                        df = data.copy()
                    elif is_multi:
                        # level 0 = Ticker, level 1 = Field  (group_by='ticker')
                        tickers_in_data = data.columns.get_level_values(0).unique().tolist()
                        if yf_s not in tickers_in_data:
                            continue
                        df = data[yf_s]
                    else:
                        # Fallback: single-level columns (yfinance returned flat DF)
                        df = data.copy()

                    df = df.dropna(subset=["Close"]) if "Close" in df.columns else df.dropna(how="all")
                    if df.empty:
                        continue

                    df = ohlcv.ensure_datetime_index(df)
                    df = ohlcv.normalize_df_ohlcv(df)
                    if "Volume" in df.columns:
                        df["Volume"] = df["Volume"].replace(0, pd.NA).ffill().fillna(0)
                    results[orig_s] = ohlcv.MarketDataBundle(
                        symbol=orig_s, df=df, source="yfinance_bulk",
                        resolved_symbol=yf_s, source_priority=2, quality_flag=DataQuality.VALID
                    )
                except Exception:
                    continue
            return results
        except Exception as e:
            logger.warning("Bulk fetch failed: %s", e)
            return {}

    def _get_ttl_config(self) -> dict:
        try:
            from app.core.database import SessionLocal
            from app.features.admin.utils import get_system_setting
            db = SessionLocal()
            try:
                cfg = get_system_setting(db, "data_config", {})
            finally:
                db.close()
            if cfg and isinstance(cfg, dict):
                return {
                    "fresh_ttl_hours": int(cfg.get("fresh_ttl_hours", 48)),
                    "usable_ttl_days": int(cfg.get("usable_ttl_days", 30)),
                }
        except Exception:
            pass
        return {"fresh_ttl_hours": 48, "usable_ttl_days": 30}

    def fetch_price_df(self, symbol: str, interval: str = "1d", lookback_days: int = 180) -> ohlcv.MarketDataBundle:
        """
        Fiyat verisi çekme — Standardized MarketDataBundle return.
        """
        sym = symbol.strip().upper()
        yf_ticker = sym
        if sym.startswith("^"):
            sym = sym[1:]

        if any(x in sym for x in ['=', '-']):
            yf_ticker = sym
        elif "." in sym:
            yf_ticker = sym
            sym = sym.split(".")[0]
        else:
            yf_ticker = f"{sym}.IS"

        _ttl = self._get_ttl_config()
        _fresh_sec  = int(_ttl.get("fresh_ttl_hours", 48)) * 3600
        _usable_sec = int(_ttl.get("usable_ttl_days", 30)) * 86400

        now_dt = now_utc().replace(tzinfo=None)
        now_ts = now_dt.timestamp()
        stale_candidate: Optional[ohlcv.MarketDataBundle] = None

        # ── 1. Yerel EOD Dosyası ────────────────────────────────────────────
        try:
            for p in self.eod_dir.rglob(f"{sym}*.parquet"):
                df = pd.read_parquet(p)
                if df.empty:
                    continue
                last_ts = df.index[-1].timestamp()
                age_sec = int(now_ts - last_ts)

                if age_sec <= _fresh_sec:
                    df = ohlcv.ensure_datetime_index(df)
                    df = ohlcv.normalize_df_ohlcv(df)
                    df, src = self.stitch_hybrid(sym, df, f"{sym}.IS")
                    return ohlcv.MarketDataBundle(
                        symbol=sym, df=df, source=src, resolved_symbol=f"{sym}.IS",
                        source_priority=4, stale_seconds=age_sec, quality_flag=DataQuality.VALID
                    )

                if stale_candidate is None:
                    src = f"stale_fallback|{p.name}" if age_sec <= _usable_sec else f"very_stale_fallback|{p.name}"
                    stale_candidate = ohlcv.MarketDataBundle(
                        symbol=sym, df=df, source=src, resolved_symbol=f"{sym}.IS",
                        is_stale=True, source_priority=8 if age_sec <= _usable_sec else 9,
                        stale_seconds=age_sec, quality_flag=DataQuality.STALE
                    )
        except Exception as _eod_exc:
            logger.debug("EOD parquet okuma hatası [%s]: %s", sym, _eod_exc)

        # ── 2. Yahoo Finance + DB Gap-filling ────────────────────────────────
        try:
            ticker_obj = yf.Ticker(yf_ticker)
            if lookback_days <= 1:    period = "1d"
            elif lookback_days <= 5:  period = "5d"
            elif lookback_days <= 32: period = "1mo"
            elif lookback_days <= 95: period = "3mo"
            elif lookback_days <= 185: period = "6mo"
            elif lookback_days <= 366: period = "1y"
            elif lookback_days <= 732: period = "2y"
            elif lookback_days <= 1825: period = "5y"
            else: period = "max"
            
            df = ticker_obj.history(period=period, interval=interval, auto_adjust=False)

            if not df.empty:
                df = ohlcv.ensure_datetime_index(df)
                df = ohlcv.normalize_df_ohlcv(df)
                df, src = self.stitch_hybrid(sym, df, yf_ticker)
                
                age_sec = int(now_ts - df.index[-1].timestamp())
                
                # Check freshness
                is_fresh = False
                try:
                    from app.core.market_calendar import is_trading_day as _itd
                    import pytz as _pytz
                    _ist_now = datetime.now(_pytz.timezone("Europe/Istanbul"))
                    _check_today = _ist_now.date()
                    _check_before_close = _ist_now.hour * 60 + _ist_now.minute < 18 * 60 + 15
                    _exp = _check_today - timedelta(days=1) if _check_before_close else _check_today
                    for _ in range(10):
                        if _itd(_exp): break
                        _exp -= timedelta(days=1)
                    is_fresh = df.index[-1].date() >= _exp
                except Exception:
                    is_fresh = age_sec / 3600 < 72

                if is_fresh or "hybrid" in src:
                    return ohlcv.MarketDataBundle(
                        symbol=sym, df=df, source=src, resolved_symbol=yf_ticker,
                        source_priority=1 if "hybrid" in src else 2,
                        stale_seconds=age_sec, quality_flag=DataQuality.VALID
                    )

                if stale_candidate is None:
                    stale_candidate = ohlcv.MarketDataBundle(
                        symbol=sym, df=df, source=f"yfinance_stale|{yf_ticker}", resolved_symbol=yf_ticker,
                        is_stale=True, source_priority=8, stale_seconds=age_sec, quality_flag=DataQuality.STALE
                    )
        except Exception as _yf_exc:
            logger.debug("yfinance fetch failed [%s]: %s", sym, _yf_exc)

        # ── 3. Cloudflare Worker Proxy ───────────────────────────────────────
        cf_result = _fetch_from_cf_worker(sym)
        if cf_result is not None:
            cf_df, cf_src = cf_result
            if not cf_df.empty:
                age_sec = int(now_ts - cf_df.index[-1].timestamp())
                # CF Worker returns only 1 day of data — only usable for scoring when
                # stitched with a stale base that already has enough bars (≥30) for indicators.
                # Standalone CF data (< 30 bars) must NOT reach the ML scoring pipeline.
                if stale_candidate is not None and len(stale_candidate.df) >= 30:
                    combined = pd.concat([stale_candidate.df, cf_df]).sort_index().drop_duplicates()
                    return ohlcv.MarketDataBundle(
                        symbol=sym, df=combined, source=f"cf_worker+stale|{cf_src}", resolved_symbol=yf_ticker,
                        source_priority=3, stale_seconds=age_sec, quality_flag=DataQuality.RECONCILED, reconciled=True
                    )
                elif stale_candidate is None:
                    # Standalone CF data: mark as INCOMPLETE so engine skips ML scoring
                    return ohlcv.MarketDataBundle(
                        symbol=sym, df=cf_df, source=cf_src, resolved_symbol=yf_ticker,
                        source_priority=6, stale_seconds=age_sec, quality_flag=DataQuality.INCOMPLETE
                    )

        # ── 4. Fallback ──────────────────────────────────────────────────────
        if stale_candidate is not None:
            stale_candidate.df = _clean_stale_df(stale_candidate.df)
            if not stale_candidate.df.empty:
                return stale_candidate

        return ohlcv.MarketDataBundle(
            symbol=sym, df=pd.DataFrame(), source=f"error|{yf_ticker}: no_data", resolved_symbol=yf_ticker,
            source_priority=10, quality_flag=DataQuality.INCOMPLETE
        )
