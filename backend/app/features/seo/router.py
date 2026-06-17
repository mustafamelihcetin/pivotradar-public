# backend/app/features/seo/router.py
import json
import logging
from pathlib import Path
from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import SessionLocal

logger = logging.getLogger("PivotRadar.SEO")
router = APIRouter()

_SECTORS_FILE = Path(__file__).resolve().parents[1] / "market_data" / "assets" / "universe" / "bist_sectors.json"
_SECTORS_CACHE: dict = {}

def _load_sectors() -> dict:
    global _SECTORS_CACHE
    if not _SECTORS_CACHE and _SECTORS_FILE.exists():
        try:
            _SECTORS_CACHE = json.loads(_SECTORS_FILE.read_text("utf-8"))
        except Exception:
            pass
    return _SECTORS_CACHE

SECTOR_MAP = {
    "Bankacılık": "Bankacılık & Finans",
    "Finans":      "Bankacılık & Finans",
    "Enerji":      "Enerji & Sanayi",
    "Sanayi":      "Enerji & Sanayi",
    "Ulaşım":      "Ulaşım & Teknoloji",
    "Teknoloji":   "Ulaşım & Teknoloji",
    "Gıda":        "Gıda & Perakende",
    "Perakende":   "Gıda & Perakende",
}
GROUP_ORDER = [
    "Bankacılık & Finans",
    "Enerji & Sanayi",
    "Ulaşım & Teknoloji",
    "Gıda & Perakende",
]

@router.get("/market-leaders")
def get_market_leaders():
    db = SessionLocal()
    try:
        sql = text("""
            SELECT symbol, MAX(qrs_score) AS qrs_score, MAX(change_pct) AS change_pct, MAX(scan_date) AS scan_date
            FROM scan_scores
            WHERE scan_date = (SELECT MAX(scan_date) FROM scan_scores)
            GROUP BY symbol
            ORDER BY qrs_score DESC
            LIMIT 300
        """)
        rows = db.execute(sql).fetchall()
        if not rows:
            return _fallback()

        sector_lookup = _load_sectors()
        groups = {g: [] for g in GROUP_ORDER}
        data_date = str(rows[0][3]) if rows else None

        for sym, qrs, chg, _ in rows:
            raw_sec = sector_lookup.get(sym, "")
            group = SECTOR_MAP.get(raw_sec)
            if group and len(groups[group]) < 5:
                groups[group].append({
                    "symbol": sym,
                    "qrs": round(float(qrs), 1) if qrs else None,
                    "change": round(float(chg), 2) if chg else None,
                })

        output = [{"name": g, "tickers": groups[g]} for g in GROUP_ORDER]
        return {"sectors": output, "data_date": data_date}
    except Exception as e:
        logger.error("[SEO] %s", e)
        return _fallback()
    finally:
        db.close()

def _fallback():
    return {"sectors": [
        {"name": "Bankacılık & Finans", "tickers": [{"symbol": s, "qrs": None, "change": None} for s in ["AKBNK", "GARAN", "ISCTR", "YKBNK", "VAKBN"]]},
        {"name": "Enerji & Sanayi",     "tickers": [{"symbol": s, "qrs": None, "change": None} for s in ["TUPRS", "EREGL", "PETKM", "SASA", "ENKAI"]]},
        {"name": "Ulaşım & Teknoloji",  "tickers": [{"symbol": s, "qrs": None, "change": None} for s in ["THYAO", "PGSUS", "TCELL", "TTKOM", "ASELS"]]},
        {"name": "Gıda & Perakende",    "tickers": [{"symbol": s, "qrs": None, "change": None} for s in ["BIMAS", "MGROS", "SOKM", "AEFES", "ULKER"]]},
    ], "data_date": None}

@router.get("/all-tickers")
def get_all_tickers():
    try:
        from app.features.market_data.data.universe_bist import load_universe, get_company_name
        df = load_universe()
        tickers = [{"symbol": sym, "name": get_company_name(sym)} for sym in df["symbol"].tolist()]
        return {"tickers": tickers}
    except Exception as e:
        logger.error("[SEO] %s", e)
        return {"tickers": [], "error": str(e)}
