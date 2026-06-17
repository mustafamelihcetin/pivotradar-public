# ===============================[ core/universe_bist.py ]==============================
from __future__ import annotations
import os, re, json, time, random, sys
from pathlib import Path
from typing import List, Optional
import pandas as pd

_BIST_NAMES_CACHE: dict[str, str] = {}
_BIST_SECTORS_CACHE: dict[str, str] = {}
_NAMES_FILE_LOADED = False
_YF_FALLBACK_TRIED: set[str] = set()


def _load_names_file() -> None:
    global _BIST_NAMES_CACHE, _NAMES_FILE_LOADED
    if _NAMES_FILE_LOADED:
        return
    _NAMES_FILE_LOADED = True
    try:
        name_file = _UNI_DIR / "bist_names.json"
        if name_file.exists():
            _BIST_NAMES_CACHE = json.loads(name_file.read_text(encoding="utf-8"))
    except Exception:
        pass


def _persist_name(symbol: str, name: str) -> None:
    """Yeni bulunan ismi bist_names.json'a ekler — mevcut kaydı asla ezmez."""
    try:
        name_file = _UNI_DIR / "bist_names.json"
        data: dict = {}
        if name_file.exists():
            data = json.loads(name_file.read_text(encoding="utf-8"))
        if symbol in data:
            return  # varolan doğru ismi yfinance verisiyle ezme
        data[symbol] = name
        name_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


_LATIN_ONLY = re.compile(r"^[A-Za-z0-9\s\.\-\&]+$")

def _yfinance_lookup(symbol: str) -> str | None:
    """yfinance üzerinden tek sembol ismi çeker; .IS suffix ile BIST için.
    Tamamen Latin harfli isimler reddedilir — yfinance'nin yanlış borsa/şirket
    eşleştirmesinden kaynaklanan kirli veriyi engeller (örn. MAGEN → 'Magna Mining').
    """
    try:
        import yfinance as yf
        info = yf.Ticker(f"{symbol}.IS").info
        exchange = (info.get("exchange") or "").upper()
        # yfinance'nin başka borsadan veri döndürdüğü durumları reddet
        if exchange and "IST" not in exchange and "TRT" not in exchange:
            return None
        name = info.get("longName") or info.get("shortName")
        if not name:
            return None
        # Türkçe karakter içermeyen saf Latin isimler büyük olasılıkla yanlış eşleşme
        if _LATIN_ONLY.match(name):
            return None
        return name
    except Exception:
        return None


def get_company_name(symbol: str) -> str:
    """Returns the company name for a given BIST ticker.
    Önce statik cache'e bakar; bulamazsa yfinance'den çeker ve cache'e yazar.
    """
    global _BIST_NAMES_CACHE, _YF_FALLBACK_TRIED
    _load_names_file()

    s = _normalize_code(symbol)
    if s in _BIST_NAMES_CACHE:
        return _BIST_NAMES_CACHE[s]

    # yfinance fallback — her sembol için sadece bir kez dene
    if s not in _YF_FALLBACK_TRIED:
        _YF_FALLBACK_TRIED.add(s)
        name = _yfinance_lookup(s)
        if name:
            _BIST_NAMES_CACHE[s] = name
            _persist_name(s, name)
            return name

    return s

def get_sector(symbol: str) -> str:
    """Returns the sector for a given BIST ticker."""
    global _BIST_SECTORS_CACHE
    if not _BIST_SECTORS_CACHE:
        try:
            sector_file = _UNI_DIR / "bist_sectors.json"
            if sector_file.exists():
                _BIST_SECTORS_CACHE = json.loads(sector_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    
    s = _normalize_code(symbol)
    return _BIST_SECTORS_CACHE.get(s, "Diğer")

# Yol sabitleri
_APP_DIR   = Path(__file__).resolve().parents[1]
_ASSETS    = _APP_DIR / "assets"
_UNI_DIR   = _ASSETS / "universe"
_UNI_CSV   = _UNI_DIR / "bist_all.csv"
_CACHE_WK  = _APP_DIR / "cache" / "weekly"
_META_LAST = _CACHE_WK / "last.meta.json"
_YH_CACHE  = _UNI_DIR / "yahoo_is_catalog.json"
_LIVE_CACHE= _UNI_DIR / "yf_live_ok.json"
_DATA_DIR  = _APP_DIR / "data"
_EOD_DIR   = _DATA_DIR / "eod"

_UNI_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_WK.mkdir(parents=True, exist_ok=True)

_ASCII_TICKER = re.compile(r"^[A-Z0-9]{3,6}$")

def safe_print(msg: str) -> None:
    import logging as _log
    _log.getLogger(__name__).debug("%s", msg)

_MERGE_MAP = {
    "SODA": "SISE", "TRKCM": "SISE", "ANACM": "SISE",
    "ADANA": "OYAKC", "ASLAN": "OYAKC", "BOLUC": "OYAKC", "MERSN": "OYAKC",
}

_HARD_BLACKLIST = {"BIST","IMKB","INDEX","ETF","FUND"}
_OUTLIER_BLACKLIST = {"ISATR", "ISBTR", "ISKUR", "TIB"}

def _normalize_code(x: str) -> str:
    s = (str(x) or "").strip().upper()
    if s.endswith(".IS"): s = s[:-3]
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s

def _is_equity_code(x: str) -> bool:
    if not _ASCII_TICKER.fullmatch(x or ""): return False
    if x in _HARD_BLACKLIST: return False
    if x in _OUTLIER_BLACKLIST: return False
    return True

def _clean_symbols(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty or "symbol" not in df.columns:
        return pd.DataFrame(columns=["symbol"])
    s = df["symbol"].astype(str).map(_normalize_code)
    s = s[s.map(_is_equity_code)]
    s = s.map(lambda x: _MERGE_MAP.get(x, x))
    out = pd.DataFrame({"symbol": sorted(set(s))})
    return out.reset_index(drop=True)

def _from_last_meta() -> Optional[pd.DataFrame]:
    try:
        if _META_LAST.exists():
            meta = json.loads(_META_LAST.read_text(encoding="utf-8"))
            for k in ("universe_symbols","symbols"):
                if meta.get(k): return pd.DataFrame({"symbol": meta[k]})
    except Exception: pass
    return None

def _from_all_eod() -> pd.DataFrame:
    if not _EOD_DIR.exists(): return pd.DataFrame(columns=["symbol"])
    syms = []
    for p in _EOD_DIR.glob("*"):
        if p.suffix.lower() in (".parquet", ".csv"):
            s = _normalize_code(p.stem)
            if _is_equity_code(s): syms.append(s)
    return pd.DataFrame({"symbol": sorted(set(syms))})

# ==================== COMPREHENSIVE BIST BOOTSTRAP (500+ Symbols) ====================
BOOTSTRAP_BIST = [
    "A1CAP","ACSEL","ADEL","ADESE","AEFES","AFYON","AGESA","AGHOL","AGROT","AHGAZ","AKBNK","AKCNS","AKENR","AKFGY","AKFYE",
    "AKGRT","AKMGY","AKSA","AKSEN","AKSGY","ALARK","ALBRK","ALCAR","ALCTL","ALGYO","ALKA","ALKIM","ALTNY","ALVES",
    "ANELE","ANGEN","ANHYT","ANSGR","ARCLK","ARDYZ","ARENA","ARSAN","ARZUM","ASELS","ASGYO","ASTOR","ASUZU","ATATP",
    "ATLAS","ATSYH","AVOD","AVPGY","AVTUR","AYDEM","AYCES","AYGAZ","AZTEK","BAGFS","BAKAB","BALAT","BANVT","BARMA","BASGZ",
    "BAYRK","BEGYO","BERA","BEYAZ","BFREN","BIGCH","BIMAS","BIOEN","BIZIM","BJKAS","BLCYT","BNTAS","BOBET","BORLS",
    "BORSK","BOSSA","BRISA","BRKO","BRKSN","BRLSM","BRMEN","BRYAT","BSOKE","BTCIM","BUCIM","BURCE","BURVA","BVSAN","BYDNR",
    "CANTE","CCOLA","CEMAS","CEMTS","CIMSA","CLEBI","CONSE","COSMO","CRDFA","CRFSA","CUSAN","CVKMD","CWENE",
    "DAGI","DAPGM","DARDL","DGATE","DGGYO","DGNMO","DIRIT","DMSAS","DNISI","DOAS","DOCO","DOGUB","DOHOL","DURDO",
    "DYOBY","DZGYO","EBEBK","ECILC","ECZYT","EDATA","EGEEN","EGGUB","EGPRO","EGSER","EKGYO","EKIZ","EKOS","ENERY","ENJSA",
    "ENKAI","ENSRI","ENTRA","EPLAS","ERBOS","ERCB","EREGL","ERSU","ESCAR","ESCOM","ESEN","ETILR","EUHOL","EUPWR","EUREN",
    "EYGYO","FADE","FENER","FLAP","FONET","FORMT","FRIGO","FROTO","GARAN","GENTS","GEREL","GESAN","GIPTA","GLBMD",
    "GLRYH","GLYHO","GMTAS","GOKNR","GOODY","GOZDE","GRNYO","GSDDE","GSDHO","GUBRF","GWIND","HALKB","HATEK","HEKTS",
    "HKTM","HOROZ","HTTBT","HUBVC","HUNER","ICBCT","IEYHO","IHEVA","IHLGM","IHLAS","INDES","INFO","INGRM",
    "INTEM","INVEO","ISCTR","ISDMR","ISFIN","ISGSY","ISGYO","ISKPL","ISMEN","ISYAT",
    "IZFAS","IZMDC","IZENR","JANTS","KAPLM","KAREL","KARSN","KARTN","KATMR","KAYSE","KCAER","KCHOL","KFEIN",
    "KIMMR","KLSYN","KLMSN","KLNMA","KLSER","KMPUR","KNFRT","KOCMT","KONTR","KONYA","KORDS","KOTON",
    "KRDMA","KRDMB","KRDMD","KRONT","KRSTL","KRVGD","KSTUR","KUVVA","KUTPO","KUYAS","KZBGY","KZGYO","LIDER",
    "LIDFA","LINK","LOGO","LKMNH","LUKSK","MAGEN","MAKTK","MANAS","MARBL","MARTI","MEGAP","MEGMT","MEPET",
    "MERCN","MERIT","METRO","MHRGY","MIATK","MGROS","MMCAS","MNDRS","MNDTR","MOBTL","MPARK",
    "MSGYO","MTRKS","MTRYO","MZHLD","NATEN","NETAS","NIBAS","NTGAZ","NTHOL","NUGYO","NUHCM","OBAMS","OBASE","ODAS","ONCSM",
    "ORGE","ORMA","OSMEN","OSTIM","OTKAR","OYAKC","OYAYO","OYLUM","OZGYO","OZKGY","OZRDN","OZSUB",
    "PAGYO","PAMEL","PAPIL","PARSN","PASEU","PCILT","PEKGY","PENTA","PETKM","PETUN","PGSUS","PINSU","PKART","PKENT",
    "PLTUR","PNLSN","PNSUT","POLHO","POLTK","PRKAB","PRKME","PRZMA","PSDTC","PSGYO","QUAGR","RALYH",
    "REEDR","RNPOL","RODRG","RTALB","RYGYO","RYSAS","SAFKR","SAHOL","SAMAT","SANEL","SANFM","SANKO","SARKY","SASA",
    "SAYAS","SDTTR","SEGYO","SEKFK","SEKUR","SELEC","SELVA","SEYKM","SILVR","SISE","SKBNK","SKTAS","SMART",
    "SMRTG","SNGYO","SNICA","SOKM","SONME","SRVGY","SUMAS","SURGY","TABGD","TATGD",
    "TAVHL","TCELL","TDGYO","TEKTU","TERA","TGSAS","THYAO","TKFEN","TKNSA","TLMAN","TMPOL","TMSN","TOASO",
    "TRCAS","TRGYO","TRILC","TSKB","TTKOM","TTRAK","TUCLK","TUKAS","TUPRS","TURGG","TURSG","UFUK","ULAS","ULKER","ULUFA",
    "ULUSE","ULUUN","UMPAS","USAK","VAKBN","VAKFN","VAKKO","VANGD","VBTYZ","VERTU","VERUS","VESBE","VESTL","VKFYO",
    "VKGYO","YATAS","YEOTK","YESIL","YGGYO","YKBNK","YKSLN","YONGA","YUNSA","YYAPI","YYLGD","ZEDUR","ZOREN"
]

def load_universe(source: str | None = None) -> pd.DataFrame:
    """
    Kritik: Hem manuel tetikleme hem de arka plan taramasında
    full evren sağlamak için tasarlandı.
    """
    # 1. Kaynak bazlı yükleme (CSV -> EOD -> Meta -> Bootstrap)
    df = _from_all_eod()
    if df.empty:
        df = _from_last_meta() or pd.DataFrame(columns=["symbol"])

    universe_set = set(df["symbol"]) if not df.empty else set()
    universe_set.update(BOOTSTRAP_BIST)

    # bist_all.csv — en kapsamlı sembol listesi (621 sembol)
    if _UNI_CSV.exists():
        try:
            csv_df = pd.read_csv(_UNI_CSV, header=None, names=["symbol"])
            csv_syms = csv_df["symbol"].astype(str).map(_normalize_code)
            universe_set.update(s for s in csv_syms if _is_equity_code(s))
        except Exception as _ce:
            safe_print(f"[UNIVERSE] bist_all.csv okunamadı: {_ce}")

    # 2. Portfolio Priority Check (CRITICAL FIX)
    # Ensure every stock in every user's portfolio is in the universe
    try:
        from app.core.database import SessionLocal
        from app.features.users.models import UserPortfolio
        db = SessionLocal()
        try:
            port_rows = db.query(UserPortfolio.stocks).filter(UserPortfolio.is_active == True).all()
            for r in port_rows:
                # r.stocks is a JSON list: ["THYAO", "MAGEN"]
                if r.stocks and isinstance(r.stocks, list):
                    for s in r.stocks:
                        clean = _normalize_code(s)
                        if _is_equity_code(clean):
                            universe_set.add(clean)
        finally:
            db.close()
    except Exception as e:
        safe_print(f"[UNIVERSE WARNING] Could not fetch portfolio symbols: {e}")

    final_symbols = sorted(list(universe_set))
    df = pd.DataFrame({"symbol": final_symbols})
    
    # Strip & Clean
    df = _clean_symbols(df)
    
    # HARD CAP: BIST için ~550 hisse olduğu için 2000 güvenli bir sınır.
    HARD_CAP = int(os.environ.get("PR_UNIVERSE_HARD_CAP", "2000"))
    if len(df) > HARD_CAP:
        df = df.head(HARD_CAP)
    
    safe_print(f"[universe] FINAL: n={len(df)}")
    return df.reset_index(drop=True)

def ensure_universe_populated(min_target: int = 500, yf_validate: bool = False) -> pd.DataFrame:
    """Legacy compatibility wrapper."""
    return load_universe()
