from __future__ import annotations
import os, time, logging, concurrent.futures, threading
from pathlib import Path
from typing import List, Optional, Tuple, Dict

import pandas as pd
import yfinance as yf
import requests  # BIGPARA + opsiyonel canlı ek kaynak

from app.core.circuit_breaker import get_circuit_breaker, CircuitOpenError

_yf_cb      = get_circuit_breaker("yfinance",  failure_threshold=3, recovery_timeout=300)
_bigpara_cb = get_circuit_breaker("bigpara",   failure_threshold=3, recovery_timeout=180, max_backoff=300)

# yfinance/urllib gürültüsünü kapat
for name in ("yfinance", "urllib3", "frozendict", "yfinance.scrapers"):
    try:
        logging.getLogger(name).setLevel(logging.CRITICAL)
    except Exception:
        pass

logger = logging.getLogger(__name__)

# --- Klasör (isteğe bağlı PRConfig) ---
try:
    from core.config import PRConfig  # type: ignore
    _BASE = Path(getattr(PRConfig, "CACHE_DIR", None) or getattr(PRConfig, "DATA_DIR", None) or ".")
except Exception:
    _BASE = Path(".")
CACHE_DIR = (_BASE / "cache" / "ohlc")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# --- ENV: TTL & Force Refresh ---
def _benv(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    v = str(raw).strip().lower()
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    try:
        return bool(int(v))
    except Exception:
        return default

def _fenv(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except Exception:
        return default

# Günlük veride TTL dakikası (dosya mtime’a göre). Varsayılan: 90 dk
CACHE_TTL_MIN = max(1.0, _fenv("PR_CACHE_TTL_MIN", 90.0))
# Seans içi TTL — piyasa açıkken daha sık veri çek. Varsayılan: 15 dk
CACHE_TTL_MARKET_MIN = max(1.0, _fenv("PR_CACHE_TTL_MARKET_MIN", 15.0))
FORCE_REFRESH = _benv("PR_FORCE_REFRESH", False)


def _market_ttl() -> float:
    """Returns a shorter TTL during BIST market hours (09:50–18:30 Istanbul).
    Outside market hours the full CACHE_TTL_MIN applies so we don’t hammer YF at night."""
    try:
        import datetime as _dt
        import pytz as _pytz
        _IST = _pytz.timezone("Europe/Istanbul")
        _now = _dt.datetime.now(_IST)
        _mod = _now.hour * 60 + _now.minute
        # 09:50 = 590 min, 18:30 = 1110 min
        if 590 <= _mod <= 1110:
            return CACHE_TTL_MARKET_MIN
    except Exception:
        pass
    return CACHE_TTL_MIN

# Canlı katman kontrolü (tamamen kapatmak için PR_LIVE_ENABLED=0)
LIVE_ENABLED = _benv("PR_LIVE_ENABLED", True)  # canlı bindirme açık/kapalı
# >>> Varsayılan artık BigPara (tarihçe: YF, canlı: BP)
LIVE_PREF = os.environ.get("PR_LIVE_PREF", "bp").lower().strip()  # bp|yf|auto  (auto: BP tercih)

# BigPara endpoint
BIGPARA_BASE = "https://bigpara.hurriyet.com.tr"

# OFFLINE CHECK
OFFLINE_MODE = _benv("PR_SCAN_OFFLINE", False)

# ========================== SEMBOL ÇÖZÜMLEYİCİ ==========================
# Tarihsel birleşme/şemsiye eşlemeleri (gerektikçe genişlet)
_MERGE_MAP: Dict[str, str] = {
    # Cam birleşmeleri -> SISE
    "SODA": "SISE", "TRKCM": "SISE", "ANACM": "SISE",
    # Çimento grubu tarihî markalar -> OYAKC
    "ADANA": "OYAKC", "ASLAN": "OYAKC", "BOLUC": "OYAKC", "MERSN": "OYAKC",
}

# Net BIST dışı/kurumsal/indeks/fon kısaltmaları (erken ele)
_HARD_BLACKLIST: set[str] = {
    "BIST","IMKB","FEAS","IOSCO","JSTOR","WFE","SIX","WEF","UTC","INDEX","ETF","FUND",
    "BATS","TRA","TVM","VOB","SSE","NZX","JSE",
}

# Yahoo Finance'de bulunamayan / kalıcı 404 veren BIST sembolleri
_YF_NOT_FOUND: set[str] = {
    "BIENP",  # YF'de kayıtlı değil — sürekli 404
}

# BigPara eş zamanlı istek sınırı — rate limiting'i önler
_bigpara_sem = threading.Semaphore(4)

# Önek bazlı gürültüler (fon/varant/vadeli gibi)
_BAD_PREFIXES: tuple[str, ...] = ("F_", "FB", "BYF", "VAR", "VIOP")

def _normalize_base(sym: str) -> str:
    """Boşlukları/altçizgileri/kötü karakterleri temizle, büyük harfe çevir."""
    s = str(sym).strip().upper().replace(" ", "").replace("_", "").replace("-", "")
    # yalnızca harf-rakam-nokta kalsın
    s = "".join(ch for ch in s if ch.isalnum() or ch == ".")
    return s

def _is_blacklisted(sym: str) -> bool:
    u = _normalize_base(sym)
    if u in _HARD_BLACKLIST:
        return True
    if any(u.startswith(p) for p in _BAD_PREFIXES):
        return True
    # çok kısa/uzun gürültü
    return len(u) < 3 or len(u) > 12

def _resolve_symbol(sym: str) -> str:
    """Birleşme haritası ve temel normalizasyon uygula ('.IS' ekleme hariç)."""
    u = _normalize_base(sym)
    u = _MERGE_MAP.get(u, u)
    return u

def _variants(sym: str) -> List[str]:
    """
    BIST için sağlam varyantlar:
      1) Birleşme haritası sonrası .IS ÖNCE,
      2) çıplak sembol (bazı özel durumlar),
      3) küçük harfli .is (yfinance bazen tolere ediyor).
    """
    base = _resolve_symbol(sym)
    cand: List[str] = []
    if not base.endswith(".IS"):
        cand.append(base + ".IS")
        cand.append((base + ".IS").lower())
    cand.append(base)
    # tekilleştir
    out, seen = [], set()
    for c in cand:
        if c and c not in seen:
            out.append(c)
            seen.add(c)
    return out

# ------------------------------- yardımcılar -------------------------------
def _num(x) -> Optional[float]:
    """Virgül/nokta ve boşlukları tolere eden güvenli sayı parse."""
    if x is None:
        return None
    try:
        if isinstance(x, (int, float)):
            return float(x)
        s = str(x).strip().replace(" ", "")
        # '93.80' / '93,80' / '93,800.00' / '93.800,00'
        if s.count(",") > 0 and s.count(".") > 0:
            # TR formatı gibi: binlik '.' ve ondalık ',' varsay
            if s.rfind(",") > s.rfind("."):
                s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", ".")
        return float(s)
    except Exception:
        return None

def _pick_first_level_for_symbol(df: pd.DataFrame, symbol_hint: Optional[str]) -> pd.DataFrame:
    """
    YF bazen MultiIndex kolon döndürür: (TICKER, Field).
    Çoklu sembolde tek sembole indirger. symbol_hint eşleşmezse ilk uygun sembol seçilir.
    """
    if not isinstance(df.columns, pd.MultiIndex):
        return df

    # kolon seviyeleri: (lvl0=ticker, lvl1=OHLC field)
    lvl0 = [str(x) for x in df.columns.get_level_values(0)]
    uniq = list(dict.fromkeys(lvl0))

    if len(uniq) <= 1:
        return df.droplevel(0, axis=1) if len(uniq) == 1 else df

    # eşleşme mantığı: HALKB.IS / HALKB / halkb.is vs.
    target = None
    if symbol_hint:
        cand = {symbol_hint, symbol_hint.upper(), symbol_hint.lower()}
        base = symbol_hint.replace(".IS", "").replace(".is", "")
        cand.update({base, base.upper(), base.lower(), base + ".IS", base + ".is"})
        for u in uniq:
            if u in cand or u.replace(".IS", "").replace(".is", "") in cand:
                target = u
                break

    if target is None:
        # ilk OHLC seti olan sembolü seç
        for u in uniq:
            cols = [c for c in df.columns if c[0] == u]
            fields = {str(c[1]).lower() for c in cols}
            if {"open","high","low","close"}.issubset(fields):
                target = u
                break
        if target is None:
            target = uniq[0]

    return df.xs(target, axis=1, level=0, drop_level=True)

def _flatten_ohlc(df: pd.DataFrame, symbol_hint: Optional[str] = None) -> pd.DataFrame:
    """
    Çoklu sembol/multiindex kolon yapısını tek sembole indirger, standart OHLCV kolonlarını üretir.
    """
    if df is None or df.empty:
        return pd.DataFrame()
    data = df.copy()

    # Eğer kolonlar MultiIndex ise önce uygun sembol seviyesini seç
    if isinstance(data.columns, pd.MultiIndex):
        data = _pick_first_level_for_symbol(data, symbol_hint)

    if isinstance(data.columns, pd.MultiIndex):
        # hala multiindex ise alan isimlerinden eşle
        want = {"open": None, "high": None, "low": None, "close": None, "adj close": None, "volume": None}
        for f in list(want.keys()):
            for c in data.columns:
                parts = [str(x).lower() for x in c if x is not None]
                if f in parts:
                    want[f] = c
                    break
        out = {}
        for k, v in want.items():
            out[k] = pd.to_numeric(data[v], errors="coerce") if (v is not None and v in data.columns) else None
        data = pd.DataFrame(
            {
                "Open": out.get("open"),
                "High": out.get("high"),
                "Low": out.get("low"),
                "Close": out.get("close"),
                "Adj Close": out.get("adj close"),
                "Volume": out.get("volume"),
            },
            index=data.index,
        )
    else:
        lowmap = {str(c).lower().strip(): c for c in data.columns}

        def pick(*names):
            for n in names:
                if n in data.columns:
                    return data[n]
                nl = n.lower()
                if nl in lowmap:
                    return data[lowmap[nl]]
            for c in data.columns:
                cl = str(c).lower()
                for n in names:
                    nl = n.lower()
                    if cl == nl or cl.endswith("_" + nl) or cl.startswith(nl + "_") or (nl in cl):
                        return data[c]
            return None

        o = pd.to_numeric(pick("Open", "open", "o"), errors="coerce")
        h = pd.to_numeric(pick("High", "high", "h"), errors="coerce")
        l = pd.to_numeric(pick("Low", "low", "l"), errors="coerce")
        c = pd.to_numeric(pick("Close", "close", "c"), errors="coerce")
        ac = pd.to_numeric(pick("Adj Close", "adj close", "adj_close", "adjclose"), errors="coerce")
        v = pd.to_numeric(pick("Volume", "volume", "vol"), errors="coerce")
        data = pd.DataFrame({"Open": o, "High": h, "Low": l, "Close": c, "Adj Close": ac, "Volume": v}, index=data.index)

    if not isinstance(data.index, pd.DatetimeIndex):
        data.index = pd.to_datetime(data.index, errors="coerce")
    try:
        if getattr(data.index, "tz", None) is not None:
            data.index = data.index.tz_localize(None)
    except Exception:
        pass
    data.index = data.index.normalize()
    data = data.dropna(how="all")
    if not {"Close", "High", "Low"}.issubset(set(data.columns)):
        return pd.DataFrame()
    return data

def _cache_path(key: str) -> Path:
    return (CACHE_DIR / f"{key}.csv")

def _save_cache(key: str, df: pd.DataFrame):
    try:
        _cache_path(key).write_text(df.to_csv(index=True), encoding="utf-8")
    except Exception:
        pass

def _read_cache(key: str) -> Optional[pd.DataFrame]:
    p = _cache_path(key)
    if not p.exists():
        return None
    try:
        df = pd.read_csv(p, index_col=0)
        df.index = pd.to_datetime(df.index, errors="coerce").tz_localize(None).normalize()
        return _flatten_ohlc(df, None)
    except Exception:
        return None

def _file_age_min(path: Path) -> float:
    try:
        return max(0.0, (time.time() - path.stat().st_mtime) / 60.0)
    except Exception:
        return 1e9

# ========================== CANLI katmanlar ==========================
# --- MEVCUT yerine: _fetch_yf_live_bar ve _fetch_bigpara_bar ---

def _fetch_yf_live_bar(symbol: str) -> tuple[Optional[pd.DataFrame], Optional[pd.Timestamp]]:
    try:
        with _yf_cb:
            cand = symbol if symbol.endswith(".IS") else f"{symbol}.IS"
            t = yf.Ticker(cand)
            price = None
            ts_full = None
            fi = {}

            for _fi_attempt in range(3):
                try:
                    fi = getattr(t, "fast_info", {}) or {}
                    price = _num(fi.get("last_price") or fi.get("regular_market_price") or fi.get("last_price"))
                    ts_full = pd.Timestamp.utcnow()
                    break
                except Exception as _fe:
                    _fmsg = str(_fe).lower()
                    if "429" in _fmsg or "too many" in _fmsg or "rate" in _fmsg:
                        _wait = 2 ** _fi_attempt
                        logger.warning("YF 429 (fast_info) sym=%s attempt=%d, retry in %ds", cand, _fi_attempt + 1, _wait)
                        time.sleep(_wait)
                    else:
                        break

            if price is None:
                ch = t.history(period="1d", interval="1m", auto_adjust=False)
                if ch is not None and not ch.empty:
                    close = pd.to_numeric(ch["Close"], errors="coerce").dropna()
                    if not close.empty:
                        price = float(close.iloc[-1])
                        ts_full = pd.Timestamp(ch.index[-1]).tz_localize(None)

            if price is None or price <= 0:
                return None, None

            ts_date = pd.Timestamp(ts_full).tz_localize(None).normalize()
            vol_val = _num(fi.get("last_volume") or 0.0) if fi else 0.0

            df = pd.DataFrame(
                {"Open": [price], "High": [price], "Low": [price], "Close": [price], "Adj Close": [price], "Volume": [vol_val]},
                index=[ts_date],
            )
            return df, pd.Timestamp(ts_full).tz_localize(None)
    except CircuitOpenError:
        return None, None
    except Exception:
        return None, None


def _fetch_bigpara_bar(symbol: str) -> tuple[Optional[pd.DataFrame], Optional[pd.Timestamp]]:
    try:
        sym = str(symbol).strip().upper()
        if sym.endswith(".IS"):
            sym = sym[:-3]

        # Bilinen kalıcı sorunlu semboller — BigPara'ya hiç gitme
        if sym in _YF_NOT_FOUND:
            return None, None

        url = f"{BIGPARA_BASE}/api/v1/borsa/hisseyuzeysel/{sym}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": f"{BIGPARA_BASE}/borsa/hisse-fiyatlari/{sym.lower()}"
        }
        with _bigpara_sem:  # maks 4 eş zamanlı BigPara isteği
            r = requests.get(url, headers=headers, timeout=2)
            # 404 → sembol BigPara'da yok; CB'yi tetiklemeden sessizce dön
            if r.status_code == 404:
                logger.debug("BigPara 404 (sembol yok): %s", sym)
                _YF_NOT_FOUND.add(sym)   # bir sonraki çağrıda da atla
                return None, None
            with _bigpara_cb:
                r.raise_for_status()     # 4xx/5xx (404 hariç) → CB'yi say
                raw = r.json()
    except CircuitOpenError:
        return None, None
    except Exception as _e:
        logger.warning("BigPara fetch hata [%s]: %s", sym, type(_e).__name__)
        return None, None

    data = raw.get("data") or raw
    info = data.get("hisseYuzeysel") if isinstance(data, dict) else data
    if not isinstance(info, dict):
        return None, None

    low = {str(k).lower(): v for k, v in info.items()}
    price = None
    for k in ("sonfiyat", "son", "fiyat", "close", "kapanisfiyat", "kapanis"):
        v = _num(low.get(k))
        if v is not None:
            price = v; break
    acilis = _num(low.get("acilis")) or price
    yuksek = _num(low.get("yuksek")) or price
    dusuk  = _num(low.get("dusuk"))  or price
    vol_raw = low.get("hacimlot") or low.get("hacim") or low.get("volume")
    time_str = low.get("sonislemzamani") or low.get("sonislemtarihi") or low.get("tarih") or low.get("lastdate")
    if price is None or price <= 0 or time_str is None:
        return None, None

    try:
        s = "0" if vol_raw is None else str(vol_raw).replace(" ", "").replace(".", "").replace(",", "")
        vol_val = float(s)
    except Exception:
        vol_val = 0.0

    ts_full = pd.to_datetime(time_str, errors="coerce")
    if pd.isna(ts_full):
        return None, None
    ts_full = pd.Timestamp(ts_full).tz_localize(None)

    # Günlük indeks + tam zaman
    ts_date = ts_full.normalize()
    df = pd.DataFrame(
        {"Open": [acilis], "High": [yuksek], "Low": [dusuk], "Close": [price], "Adj Close": [price], "Volume": [vol_val]},
        index=[ts_date],
    )
    return df, ts_full



def _overlay_live(symbol: str, base_df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
    meta = {"src": "-", "bp_date": "-", "yf_last": "-", "bp_dt": "-", "yf_dt": "-"}
    if base_df is not None and not base_df.empty:
        try: meta["yf_last"] = str(base_df.index.max().date())
        except Exception: pass
    if not LIVE_ENABLED or base_df is None or base_df.empty:
        return base_df, meta

    order = ["bp", "yf"] if LIVE_PREF in ("bp", "auto") else ["yf", "bp"]
    live_df, live_ts, used = None, None, None

    for src in order:
        try:
            if src == "bp":
                live_df, live_ts = _fetch_bigpara_bar(symbol)
                if live_df is not None and not live_df.empty:
                    used = "BP"; meta["src"] = "BP"; meta["bp_date"] = str(live_df.index.max().date())
                    meta["bp_dt"] = live_ts.strftime("%Y-%m-%d %H:%M") if live_ts is not None else "-"
                    break
            else:
                live_df, live_ts = _fetch_yf_live_bar(symbol)
                if live_df is not None and not live_df.empty:
                    used = "YF"; meta["src"] = "YF"
                    meta["yf_dt"] = live_ts.strftime("%Y-%m-%d %H:%M") if live_ts is not None else "-"
                    break
        except Exception:
            continue

    if live_df is None or live_df.empty:
        return base_df, meta

    # Y-6: Live verisi cache'den daha eski ise üzerine yazma.
    # BigPara/YF bazen stale fiyat döndürebilir; timestamp'i kontrol et.
    if live_ts is not None and not base_df.empty:
        try:
            base_last_date = base_df.index.max().date()
            if live_ts.date() < base_last_date:
                logger.info("Live overlay atlandı: live_ts=%s < cache=%s", live_ts.date(), base_last_date)
                return base_df, meta
        except Exception:
            pass

    combined = pd.concat([base_df, live_df])
    combined = combined[~combined.index.duplicated(keep="last")].sort_index()
    combined = _flatten_ohlc(combined)

    # >>> UI için attrs: canlı kaynak + tam zaman
    if used == "BP" and live_ts is not None:
        combined.attrs["live_src"] = "BP"
        combined.attrs["live_ts"]  = live_ts.strftime("%Y-%m-%d %H:%M")
    elif used == "YF" and live_ts is not None:
        combined.attrs["live_src"] = "YF"
        combined.attrs["live_ts"]  = live_ts.strftime("%Y-%m-%d %H:%M")

    return combined, meta

# ========================== Ana API ==========================
def fetch_ohlc(
    symbol: str,
    period_days: int = 200,
    force: Optional[bool] = None,
    ttl_min: Optional[float] = None,
) -> pd.DataFrame:
    """
    BIST OHLC hibrit:
      - Yahoo Finance tarihçe (EOD)   -> cache'lenir (TTL: PR_CACHE_TTL_MIN dak)
      - CANLI bindirme                -> BigPara snapshot (tercih) veya YF fast_info/1m
    Çıktı: Günlük frekans, tz-naive, normalize tarih index.
    """
    # Siyah liste: erken eliyoruz (yfinance spam denemesini önler)
    if _is_blacklisted(symbol):
        logger.info("OHLC skip (blacklist): %s", symbol)
        return pd.DataFrame()

    # YF'de kalıcı olarak bulunmayan semboller — gereksiz 404 isteğini önler
    base_check = _normalize_base(symbol).replace(".IS", "")
    if base_check in _YF_NOT_FOUND:
        logger.debug("OHLC skip (yf_not_found): %s", symbol)
        return pd.DataFrame()

    period_days = max(60, int(period_days or 200))
    period = f"{period_days}d"
    use_force = FORCE_REFRESH if force is None else bool(force)
    ttl = _market_ttl() if ttl_min is None else float(ttl_min)

    # Sembol çözümlemesi: birleşme & normalize
    base = _resolve_symbol(symbol)

    for cand in _variants(base):
        key = cand.replace(".", "_")
        cpath = _cache_path(key)

        # 1) cache (yalnız Yahoo tabanı)
        cached = _read_cache(key)
        fresh_cache = (cached is not None) and (_file_age_min(cpath) <= ttl)
        if cached is not None and fresh_cache and not use_force:
            base_df = cached
            merged, m = _overlay_live(cand, base_df)
            logger.info(
                "OHLC cache HIT | sym=%s | ttl_ok=%.1f<=%.1f | base_last=%s | live_src=%s | rows=%d",
                cand,
                _file_age_min(cpath),
                ttl,
                m.get("yf_last"),
                m.get("src"),
                len(merged),
            )
            return merged

        # 2) OFFLINE GUARD (Network öncesi çıkış)
        if OFFLINE_MODE:
            logger.info("OHLC offline_mode skip: %s", cand)
            return pd.DataFrame()

        # 3) Ticker.history() — exponential backoff on 429 / rate-limit errors
        for _attempt in range(3):
            try:
                t = yf.Ticker(cand)
                df_raw = t.history(period=period, interval="1d", auto_adjust=False, actions=False)
                yf_df = _flatten_ohlc(df_raw, symbol_hint=cand)
                if yf_df is not None and not yf_df.empty:
                    _save_cache(key, yf_df)
                    merged, m = _overlay_live(cand, yf_df)
                    logger.info(
                        "YF history OK | sym=%s | base_last=%s | live_src=%s | rows=%d",
                        cand, m.get("yf_last"), m.get("src"), len(merged),
                    )
                    return merged
                break  # empty but no error → skip retry
            except Exception as _e:
                _msg = str(_e).lower()
                if "429" in _msg or "too many" in _msg or "rate" in _msg:
                    _wait = 2 ** _attempt
                    logger.warning("YF 429 (history) sym=%s attempt=%d, retry in %ds", cand, _attempt + 1, _wait)
                    time.sleep(_wait)
                else:
                    break

        # 3b) download fallback — exponential backoff on 429
        for _attempt in range(3):
            try:
                df_raw = yf.download(
                    cand,
                    period=period,
                    interval="1d",
                    progress=False,
                    auto_adjust=False,
                    group_by="column",
                    threads=False,
                )
                yf_df = _flatten_ohlc(df_raw, symbol_hint=cand)
                if yf_df is not None and not yf_df.empty:
                    _save_cache(key, yf_df)
                    merged, m = _overlay_live(cand, yf_df)
                    logger.info(
                        "YF download OK | sym=%s | base_last=%s | live_src=%s | rows=%d",
                        cand, m.get("yf_last"), m.get("src"), len(merged),
                    )
                    return merged
                break
            except Exception as _e:
                _msg = str(_e).lower()
                if "429" in _msg or "too many" in _msg or "rate" in _msg:
                    _wait = 2 ** _attempt
                    logger.warning("YF 429 (download) sym=%s attempt=%d, retry in %ds", cand, _attempt + 1, _wait)
                    time.sleep(_wait)
                else:
                    break

        # nazik rate-limit
        time.sleep(0.05)

    logger.warning("OHLC fetch boş: %s", symbol)
    return pd.DataFrame()

# Corporate event cache — scoring sırasında 287 sembol × yf.Ticker() çağrısını önler.
# Her sembol günde en fazla bir kez sorgulanır (6 saatlik TTL).
import threading as _threading
_CORP_EVENT_CACHE: dict = {}
_CORP_EVENT_CACHE_LOCK = _threading.Lock()
_CORP_EVENT_TTL = 21600  # 6 saat


def _corp_cache_get(key: str):
    with _CORP_EVENT_CACHE_LOCK:
        entry = _CORP_EVENT_CACHE.get(key)
        if entry and (time.monotonic() - entry["ts"]) < _CORP_EVENT_TTL:
            return entry["val"], True
    return None, False


def _corp_cache_set(key: str, val) -> None:
    with _CORP_EVENT_CACHE_LOCK:
        _CORP_EVENT_CACHE[key] = {"val": val, "ts": time.monotonic()}


def get_upcoming_dividend(symbol: str, window_days: int = 5) -> Optional[bool]:
    """Returns True if an ex-dividend date is within `window_days` from today, else False. None on error."""
    cache_key = f"div:{symbol}:{window_days}"
    cached_val, hit = _corp_cache_get(cache_key)
    if hit:
        return cached_val
    try:
        from datetime import date
        ticker = yf.Ticker(symbol)
        cal = ticker.calendar
        if cal is None:
            _corp_cache_set(cache_key, False)
            return False
        ex_date = None
        if isinstance(cal, dict):
            ex_date = cal.get("Ex-Dividend Date")
        elif hasattr(cal, "get"):
            ex_date = cal.get("Ex-Dividend Date")
        if ex_date is None:
            _corp_cache_set(cache_key, False)
            return False
        if hasattr(ex_date, "date"):
            ex_date = ex_date.date()
        elif isinstance(ex_date, str):
            ex_date = date.fromisoformat(ex_date[:10])
        today = date.today()
        result = bool(0 <= (ex_date - today).days <= window_days)
        _corp_cache_set(cache_key, result)
        return result
    except Exception:
        _corp_cache_set(cache_key, None)
        return None


def has_recent_split(symbol: str, lookback_days: int = 30) -> Optional[bool]:
    """Returns True if the symbol had a stock split within `lookback_days`. None on error."""
    cache_key = f"split:{symbol}:{lookback_days}"
    cached_val, hit = _corp_cache_get(cache_key)
    if hit:
        return cached_val
    try:
        ticker = yf.Ticker(symbol)
        splits = ticker.splits
        if splits is None or splits.empty:
            _corp_cache_set(cache_key, False)
            return False
        cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=lookback_days)
        recent = splits[splits.index >= cutoff]
        result = bool(len(recent) > 0)
        _corp_cache_set(cache_key, result)
        return result
    except Exception:
        _corp_cache_set(cache_key, None)
        return None


def fetch_ohlc_many(
    symbols: List[str],
    period_days: int = 200,
    force: Optional[bool] = None,
    ttl_min: Optional[float] = None,
) -> Tuple[Dict[str, pd.DataFrame], Dict[str, dict]]:
    """Çoklu sembol için toplu çağrı + basit meta (son bar tarihi ve satır sayısı)."""
    out: Dict[str, pd.DataFrame] = {}
    meta: Dict[str, dict] = {}
    for s in symbols:
        df = fetch_ohlc(s, period_days=period_days, force=force, ttl_min=ttl_min)
        out[s] = df
        try:
            meta[s] = {"rows": int(len(df)), "last": str(df.index.max().date()) if len(df) else "-"}
        except Exception:
            meta[s] = {"rows": 0, "last": "-"}
    return out, meta

def get_live_close(symbol: str) -> Tuple[Optional[float], Optional[float]]:
    """Önce BigPara snapshot; yoksa YF 1m/fast_info; ikisi de yoksa (None, None) döner."""
    try:
        df, ts = _fetch_bigpara_bar(symbol)
        if df is not None and not df.empty:
            v = df["Close"].iloc[-1]
            c = df.get("change_pct", pd.Series([None])).iloc[-1]
            return (float(v) if pd.notna(v) else None, float(c) if pd.notna(c) else None)
    except Exception:
        pass

    try:
        df, ts = _fetch_yf_live_bar(symbol)
        if df is not None and not df.empty:
            v = df["Close"].iloc[-1]
            # YF doesn't always have change_pct in live bar, we calculate if possible
            return (float(v) if pd.notna(v) else None, None)
    except Exception:
        pass
        
    return None, None

# Simple memory cache for get_live_close_many (30s TTL)
_LIVE_CACHE: Dict[str, Tuple[dict, float]] = {}
_LIVE_CACHE_TTL = 30

def get_live_close_many(symbols: List[str], max_items: int = 100) -> Dict[str, dict]:
    """
    Dashboard performansı için seçili sembolleri BigPara/YF üzerinden PARALEL olarak günceller.
    """
    now = time.time()
    out: Dict[str, dict] = {}
    to_fetch = []

    # 1. Check cache
    for s in symbols[:max_items]:
        if s in _LIVE_CACHE:
            data, ts = _LIVE_CACHE[s]
            if (now - ts) < _LIVE_CACHE_TTL:
                out[s] = data
                continue
        to_fetch.append(s)

    if not to_fetch:
        return out

    # 2. Fetch in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        future_to_sym = {executor.submit(get_live_close, s): s for s in to_fetch}
        for future in concurrent.futures.as_completed(future_to_sym):
            s = future_to_sym[future]
            try:
                price, chg = future.result()
                data = {"price": price, "change_pct": chg}
                out[s] = data
                if price is not None:
                    _LIVE_CACHE[s] = (data, now)
            except Exception:
                out[s] = {"price": None, "change_pct": None}

    return out