# backend/app/features/dashboard/ticker_service.py
import time
import logging
import requests
import yfinance as yf
from typing import List, Dict, Optional, Tuple, TypedDict
from concurrent.futures import ThreadPoolExecutor


class TickerItem(TypedDict):
    symbol: str    # Görünen etiket (ör. "BIST 100", "Dolar")
    value: float   # Son fiyat
    change: float  # % değişim (önceki kapanışa göre)


class TickerResponse(TypedDict):
    data: List[TickerItem]
    market: Dict  # get_market_status() çıktısı

from app.core.database import SessionLocal
from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS

logger = logging.getLogger("PivotRadar.Ticker")

class TickerService:
    _cache: List[Dict] = []
    _last_fetch: float = 0
    _usd_try_rate: float = 32.45 # Live fallback

    @classmethod
    def _fetch_single_ticker(cls, sym: str, mapping: Dict[str, str]) -> Optional[Tuple[str, Tuple[float, float]]]:
        try:
            ticker_sym = mapping.get(sym)
            if not ticker_sym: return None
            
            t = yf.Ticker(ticker_sym)
            info = t.fast_info
            last = info.last_price
            prev = info.previous_close or info.last_price
            
            if sym == "Gram Altın":
                last = (last / 31.1035) * cls._usd_try_rate
                prev = (prev / 31.1035) * cls._usd_try_rate
            elif sym == "Çeyrek Altın":
                last = ((last / 31.1035) * cls._usd_try_rate) * 1.64
                prev = ((prev / 31.1035) * cls._usd_try_rate) * 1.64
            elif sym == "Gümüş":
                last = (last / 31.1035) * cls._usd_try_rate
                prev = (prev / 31.1035) * cls._usd_try_rate
            elif sym in ["BTC-USD", "ETH-USD"]:
                last *= cls._usd_try_rate
                prev *= cls._usd_try_rate
                
            return (sym, (last, prev))
        except Exception as e:
            logger.debug(f"Ticker fetch error for {sym}: {e}")
            return None

    @classmethod
    def _fetch_yfinance_fallback(cls, symbols: List[str]) -> Dict[str, Tuple[float, float]]:
        res = {}
        mapping = {
            "USDTRY": "USDTRY=X", "Dolar": "USDTRY=X",
            "EURTRY": "EURTRY=X", "Euro": "EURTRY=X",
            "XU100": "XU100.IS", 
            "Gram Altın": "GC=F", "Çeyrek Altın": "GC=F", "Gümüş": "SI=F", 
            "BRENT": "BZ=F", "BTC-USD": "BTC-USD", "ETH-USD": "ETH-USD"
        }
        
        # Pre-fetch USD/TRY rate dynamically
        try:
            usd_info = yf.Ticker("USDTRY=X").fast_info
            if usd_info.last_price > 25:
                cls._usd_try_rate = usd_info.last_price
        except Exception: pass

        with ThreadPoolExecutor(max_workers=min(len(symbols), 10)) as executor:
            futures = [executor.submit(cls._fetch_single_ticker, s, mapping) for s in symbols]
            for future in futures:
                result = future.result()
                if result:
                    sym, data = result
                    res[sym] = data
        return res

    @classmethod
    def _fetch_halkyatirim(cls) -> Dict[str, Tuple[float, float]]:
        res = {}
        try:
            h = {'User-Agent': 'Mozilla/5.0'}
            r = requests.get("https://analiz.halkyatirim.com.tr/api/v1/piyasa/GetEndeksDegisimleri", timeout=5, headers=h)
            if r.status_code == 200:
                for item in r.json():
                    kod, last, perc = item.get("KOD"), float(item["SON"]), float(item.get("YUZDE", 0))
                    prev = last / (1 + (perc / 100))
                    if kod == "XU100": res["XU100"] = (last, prev)
        except Exception: pass
        return res

    @classmethod
    def get_data(cls) -> TickerResponse:
        now = time.time()
        # Frontend 90sn bekliyor, biz 85sn cache tutuyoruz
        if cls._cache and (now - cls._last_fetch) < 85: 
            from app.core.market_calendar import get_market_status
            return {"data": cls._cache, "market": get_market_status()}
        
        try:
            prices = {}
            prices.update(cls._fetch_halkyatirim())
            
            with SessionLocal() as db:
                cfg = get_system_setting(db, "ticker_symbols")
            
            if not cfg:
                cfg = [
                    {"label": "BIST 100", "symbol": "XU100"},
                    {"label": "Dolar", "symbol": "USDTRY"},
                    {"label": "Euro", "symbol": "EURTRY"},
                    {"label": "Altın (G)", "symbol": "Gram Altın"},
                    {"label": "BTC/USD", "symbol": "BTC-USD"}
                ]

            missing = []
            for item in cfg:
                sym = item["symbol"]
                v_pv = prices.get(sym)
                if sym == "BTC-USD" and v_pv and v_pv[0] < 200000:
                    missing.append(sym)
                elif not v_pv:
                    missing.append(sym)
            
            if missing:
                prices.update(cls._fetch_yfinance_fallback(missing))

            results = []
            for item in cfg:
                sym = item["symbol"]
                v_pv = prices.get(sym)
                
                if not v_pv:
                    norm_sym = str(sym).lower().replace('ı','i').replace('ş','s').replace('ç','c').replace('ö','o').replace('ü','u').replace('ğ','g')
                    for k, val in prices.items():
                        norm_k = str(k).lower().replace('ı','i').replace('ş','s').replace('ç','c').replace('ö','o').replace('ü','u').replace('ğ','g')
                        if norm_k == norm_sym:
                            v_pv = val
                            break

                if not v_pv and sym == "Dolar": v_pv = prices.get("USDTRY")
                if not v_pv and sym == "Euro": v_pv = prices.get("EURTRY")
                
                if v_pv:
                    last, prev = v_pv
                    if last <= 0 or prev <= 0: continue
                    chg = (last - prev) / prev * 100
                    if abs(chg) > 95: continue

                    results.append({
                        "symbol": item["label"],
                        "value": round(last, 1 if last > 1000 else 4),
                        "change": round(chg, 2)
                    })

            from app.core.market_calendar import get_market_status
            m_status = get_market_status()

            if results:
                cls._cache = results
                cls._last_fetch = now
                return {"data": results, "market": m_status}

        except Exception as e:
            logger.error(f"Ticker Error: {e}")
            
        from app.core.market_calendar import get_market_status
        return {"data": cls._cache if cls._cache else [], "market": get_market_status()}

ticker_service = TickerService()
