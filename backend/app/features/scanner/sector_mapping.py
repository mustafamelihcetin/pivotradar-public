"""
BIST Sektör Haritası

Mimari:
  1. OVERRIDE_MAP   — küçük, elle yazılan liste (sadece yfinance'in yanlış/boş döndürdüğü semboller)
  2. bist_sectors.json — yfinance'den otomatik çekilen cache dosyası
  3. get_sector()    — OVERRIDE → cache → yfinance canlı → suffix kural → DIGER
  4. fetch_sectors_yfinance() — toplu çekme scripti (fetch_names.py gibi çalıştırılır)

Yeni sembol eklendiğinde hiçbir şeye dokunmaya gerek yok.
Backend, bilinmeyen sembolü ilk görüşte yfinance'den çeker ve cache'e yazar.
"""

from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# ── Yol sabiti ────────────────────────────────────────────────────────────────
_CACHE_FILE = Path(__file__).parent / "bist_sectors.json"

# ── yfinance sektör → bizim anahtar eşlemesi ─────────────────────────────────
_YF_SECTOR_MAP: dict[str, str] = {
    # Finans
    "Financial Services":      "SIGORTA",
    "Banks":                   "BANKA",
    "Insurance":               "SIGORTA",
    # Teknoloji
    "Technology":              "TEKNOLOJI",
    "Communication Services":  "TEKNOLOJI",
    # Enerji
    "Energy":                  "ENERJI",
    "Utilities":               "ENERJI",
    # Sanayi
    "Industrials":             "SANAYI",
    "Basic Materials":         "KIMYA",
    # Tüketim
    "Consumer Cyclical":       "PERAKENDE",
    "Consumer Defensive":      "GIDA",
    # Sağlık
    "Healthcare":              "SAGLIK",
    # Gayrimenkul
    "Real Estate":             "GYO",
}

# yfinance industry (daha ince eşleme)
_YF_INDUSTRY_MAP: dict[str, str] = {
    "Auto Manufacturers":       "OTOMOTIV",
    "Auto Parts":               "OTOMOTIV",
    "Trucks & Commercial Vehicles": "OTOMOTIV",
    "Airlines":                 "ULASIM",
    "Airports & Air Services":  "ULASIM",
    "Trucking":                 "ULASIM",
    "Marine Shipping":          "ULASIM",
    "Gold":                     "MADEN",
    "Silver":                   "MADEN",
    "Copper":                   "MADEN",
    "Other Precious Metals":    "MADEN",
    "Steel":                    "SANAYI",
    "Building Materials":       "SANAYI",
    "Cement":                   "SANAYI",
    "Chemicals":                "KIMYA",
    "Agricultural Inputs":      "KIMYA",
    "Drug Manufacturers":       "SAGLIK",
    "Medical Devices":          "SAGLIK",
    "Hospitals":                "SAGLIK",
    "Apparel Manufacturing":    "TEKSTIL",
    "Apparel Retail":           "TEKSTIL",
    "Textile Manufacturing":    "TEKSTIL",
    "Grocery Stores":           "PERAKENDE",
    "Specialty Retail":         "PERAKENDE",
    "Department Stores":        "PERAKENDE",
    "Beverages":                "GIDA",
    "Packaged Foods":           "GIDA",
    "Farm Products":            "GIDA",
    "Hotels & Motels":          "TURIZM",
    "Resorts & Casinos":        "TURIZM",
    "Conglomerates":            "HOLDING",
    "Oil & Gas Refining":       "ENERJI",
    "Oil & Gas Midstream":      "ENERJI",
    "Utilities—Renewable":      "ENERJI",
    "Software—Application":     "TEKNOLOJI",
    "Software—Infrastructure":  "TEKNOLOJI",
    "Electronic Components":    "TEKNOLOJI",
    "Communication Equipment":  "TEKNOLOJI",
    "REIT—Diversified":         "GYO",
    "REIT—Office":              "GYO",
    "REIT—Retail":              "GYO",
    "Real Estate Services":     "GYO",
}

# ── Elle override — sadece yfinance'in yanlış/boş döndürdüğü durumlar ─────────
OVERRIDE_MAP: dict[str, str] = {
    # Bankalar (yfinance bazen "Financial Services" döndürüyor, biz BANKA istiyoruz)
    "GARAN": "BANKA", "AKBNK": "BANKA", "ISCTR": "BANKA", "YKBNK": "BANKA",
    "HALKB": "BANKA", "VAKBN": "BANKA", "ALBRK": "BANKA", "TSKB":  "BANKA",
    "SKBNK": "BANKA", "ICBCT": "BANKA", "KLNMA": "BANKA",
    # Spor kulüpleri → DIGER (yfinance tanımıyor)
    "BJKAS": "DIGER", "FENER": "DIGER", "GSRAY": "DIGER", "GLCVY": "DIGER",
    # Holding (küçük holdingleri yfinance Conglomerate yakalamıyor)
    "SAHOL": "HOLDING", "KCHOL": "HOLDING", "TKFEN": "HOLDING", "DOHOL": "HOLDING",
    "ALARK": "HOLDING", "GLYHO": "HOLDING", "POLHO": "HOLDING", "GOZDE": "HOLDING",
    # GYO (bazı semboller yfinance'de farklı kategori)
    "EKGYO": "GYO", "TRGYO": "GYO", "SNGYO": "GYO", "ISGYO": "GYO",
    "VKGYO": "GYO", "ASGYO": "GYO", "MPARK": "GYO",
    # Ulaşım
    "THYAO": "ULASIM", "PGSUS": "ULASIM", "CLEBI": "ULASIM", "TAVHL": "ULASIM",
    "RYSAS": "ULASIM", "HOROZ": "ULASIM",
}

# ── Runtime cache (process içi) ───────────────────────────────────────────────
_MEM_CACHE: dict[str, str] = {}
_FILE_LOADED = False
_YF_TRIED:    set[str] = set()


def _load_file() -> None:
    global _FILE_LOADED
    if _FILE_LOADED:
        return
    _FILE_LOADED = True
    if _CACHE_FILE.exists():
        try:
            data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
            _MEM_CACHE.update(data)
        except Exception:
            pass


def _persist(symbol: str, sector: str) -> None:
    try:
        data: dict = {}
        if _CACHE_FILE.exists():
            data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        data[symbol] = sector
        _CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _yfinance_lookup(symbol: str) -> Optional[str]:
    """yfinance'den sektör çek — industry önce, sector sonra."""
    try:
        import yfinance as yf
        info = yf.Ticker(f"{symbol}.IS").info
        industry = info.get("industry", "")
        sector   = info.get("sector", "")
        if industry and industry in _YF_INDUSTRY_MAP:
            return _YF_INDUSTRY_MAP[industry]
        if sector and sector in _YF_SECTOR_MAP:
            return _YF_SECTOR_MAP[sector]
    except Exception:
        pass
    return None


def _suffix_guess(sym: str) -> Optional[str]:
    if sym.endswith("GYO") or sym.endswith("GY"):  return "GYO"
    if sym.endswith("HOL") or sym.endswith("HL"):  return "HOLDING"
    if sym.endswith("SIG") or sym.endswith("GRT"): return "SIGORTA"
    return None


def get_sector(symbol: str) -> str:
    sym = symbol.replace(".IS", "").strip().upper()

    # 1. Manuel override
    if sym in OVERRIDE_MAP:
        return OVERRIDE_MAP[sym]

    # 2. Dosya cache
    _load_file()
    if sym in _MEM_CACHE:
        return _MEM_CACHE[sym]

    # 3. Suffix tahmini (hızlı, API gerektirmez)
    guess = _suffix_guess(sym)
    if guess:
        return guess

    # 4. yfinance canlı (her sembol için sadece bir kez)
    if sym not in _YF_TRIED:
        _YF_TRIED.add(sym)
        result = _yfinance_lookup(sym)
        if result:
            _MEM_CACHE[sym] = result
            _persist(sym, result)
            return result

    return "DIGER"


# ── Toplu yfinance çekme (script olarak çalıştırılır) ─────────────────────────
def fetch_all_sectors(universe_csv: Optional[Path] = None) -> None:
    """
    Kullanım:
        python -m app.features.scanner.sector_mapping   (backend/ klasöründen)
    """
    import csv
    if universe_csv is None:
        universe_csv = (
            Path(__file__).resolve().parents[2]
            / "features" / "market_data" / "assets" / "universe" / "bist_all.csv"
        )

    symbols: list[str] = []
    if universe_csv.exists():
        with open(universe_csv, encoding="utf-8") as f:
            symbols = [row["symbol"].strip() for row in csv.DictReader(f) if row.get("symbol")]

    existing: dict = {}
    if _CACHE_FILE.exists():
        try:
            existing = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    missing = [s for s in symbols if s not in existing and s not in OVERRIDE_MAP and not _suffix_guess(s)]
    print(f"{len(symbols)} sembol, {len(missing)} tanesi yfinance'den çekilecek...")

    import time
    for i, sym in enumerate(missing):
        result = _yfinance_lookup(sym)
        label  = result or "DIGER"
        existing[sym] = label
        print(f"  [{i+1}/{len(missing)}] {sym}: {label}")
        if i % 30 == 29:
            _CACHE_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
            time.sleep(1)

    _CACHE_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Tamamlandı → {_CACHE_FILE}")


if __name__ == "__main__":
    fetch_all_sectors()
