import time
from datetime import timedelta
from typing import Dict, List, Any

from sqlalchemy import func
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from app.features.scanner.sector_mapping import get_sector

SECTOR_LABELS: Dict[str, str] = {
    "BANKA":     "Bankacılık",
    "SIGORTA":   "Sigorta",
    "ULASIM":    "Ulaşım",
    "ENERJI":    "Enerji",
    "SANAYI":    "Sanayi",
    "HOLDING":   "Holding",
    "OTOMOTIV":  "Otomotiv",
    "TEKNOLOJI": "Teknoloji",
    "KIMYA":     "Kimya",
    "SAGLIK":    "Sağlık",
    "TEKSTIL":   "Tekstil",
    "TURIZM":    "Turizm",
    "PERAKENDE": "Perakende",
    "GIDA":      "Gıda",
    "GYO":       "Gayrimenkul",
    "MADEN":     "Madencilik",
    "DIGER":     "Diğer",
}

_CACHE: Dict[str, Any] = {"ts": 0.0, "data": None}
_TTL = 300.0


def invalidate_cache() -> None:
    _CACHE["ts"] = 0.0
    _CACHE["data"] = None


def _stock_dict(r: ScanScore) -> Dict:
    sym = (r.symbol or "").replace(".IS", "").strip().upper()
    return {
        "symbol":     sym,
        "change_pct": round(float(r.change_pct or 0), 2),
        "qrs_score":  round(float(r.qrs_score or 0), 1),
        "close":      round(float(r.close_price or 0), 2),
        "rsi":        round(float(r.rsi or 50), 1),
    }


def get_market_overview() -> Dict:
    now = time.time()
    if _CACHE["data"] is not None and (now - _CACHE["ts"]) < _TTL:
        return _CACHE["data"]

    db = SessionLocal()
    try:
        # En son scan_date'i bul
        latest_date = (
            db.query(func.max(ScanScore.scan_date))
            .filter(ScanScore.qrs_score.isnot(None))
            .scalar()
        )
        if not latest_date:
            return {"sectors": [], "breadth": {}, "top_gainers": [], "top_losers": [], "source": "no_data"}

        # Sadece son 7 gün içindeki kayıtlar geçerli — daha eskisi stale sayılır
        cutoff_date = latest_date - timedelta(days=7)

        # Sembol başına en son scan_date (sadece pencere içi)
        subq = (
            db.query(
                ScanScore.symbol,
                func.max(ScanScore.scan_date).label("max_date"),
            )
            .filter(
                ScanScore.qrs_score.isnot(None),
                ScanScore.scan_date >= cutoff_date,
            )
            .group_by(ScanScore.symbol)
            .subquery()
        )

        all_rows = (
            db.query(ScanScore)
            .join(
                subq,
                (ScanScore.symbol == subq.c.symbol) &
                (ScanScore.scan_date == subq.c.max_date),
            )
            .filter(ScanScore.qrs_score.isnot(None))
            .all()
        )

        if not all_rows:
            return {"sectors": [], "breadth": {}, "top_gainers": [], "top_losers": [], "source": "no_data"}

        if not all_rows:
            return {"sectors": [], "breadth": {}, "top_gainers": [], "top_losers": [], "source": "no_data"}

        # Deduplicate by symbol — aynı gün birden fazla session varsa
        # en güncel scanned_at'ı tercih et (kapanış fiyatı en güncel olsun)
        seen: Dict[str, ScanScore] = {}
        for r in all_rows:
            sym = (r.symbol or "").replace(".IS", "").strip().upper()
            if sym not in seen:
                seen[sym] = r
            else:
                prev = seen[sym]
                r_at   = r.scanned_at   or r.scan_date
                prev_at = prev.scanned_at or prev.scan_date
                if r_at and prev_at and r_at > prev_at:
                    seen[sym] = r
        rows = list(seen.values())

        # Sektöre göre grupla
        buckets: Dict[str, List[ScanScore]] = {}
        for r in rows:
            sym = (r.symbol or "").replace(".IS", "").strip().upper()
            key = get_sector(sym)
            buckets.setdefault(key, []).append(r)

        # Sektör metrikleri + top movers
        sector_data = []
        for key, items in buckets.items():
            changes  = [float(r.change_pct or 0) for r in items]
            qrs_vals = [float(r.qrs_score or 0)  for r in items]
            rsi_vals = [float(r.rsi or 50)        for r in items]
            up   = sum(1 for c in changes if c >  0.05)
            down = sum(1 for c in changes if c < -0.05)

            sorted_items = sorted(items, key=lambda r: float(r.change_pct or 0), reverse=True)
            top_g = [_stock_dict(r) for r in sorted_items[:3]  if float(r.change_pct or 0) >  0.05]
            top_l = [_stock_dict(r) for r in sorted_items[-3:] if float(r.change_pct or 0) < -0.05]

            sector_data.append({
                "key":         key,
                "name":        SECTOR_LABELS.get(key, key),
                "count":       len(items),
                "up":          up,
                "down":        down,
                "flat":        len(items) - up - down,
                "avg_change":  round(sum(changes)  / len(changes),  2) if changes  else 0.0,
                "avg_qrs":     round(sum(qrs_vals) / len(qrs_vals), 1) if qrs_vals else 0.0,
                "avg_rsi":     round(sum(rsi_vals) / len(rsi_vals), 1) if rsi_vals else 0.0,
                "top_gainers": top_g,
                "top_losers":  top_l,
            })

        # DİĞER'i sona at, diğerlerini büyükten küçüğe sırala
        named   = sorted([s for s in sector_data if s["key"] != "DIGER"], key=lambda x: x["count"], reverse=True)
        diger   = [s for s in sector_data if s["key"] == "DIGER" and s["count"] >= 4]
        sector_data = named + diger

        # Genel breadth
        all_changes = [float(r.change_pct or 0) for r in rows]
        all_qrs     = [float(r.qrs_score or 0)  for r in rows]
        all_rsi     = [float(r.rsi or 50)        for r in rows]
        total       = len(rows)

        up_total   = sum(1 for c in all_changes if c >  0.05)
        down_total = sum(1 for c in all_changes if c < -0.05)

        breadth = {
            "total":          total,
            "up":             up_total,
            "down":           down_total,
            "flat":           total - up_total - down_total,
            "rsi_overbought": sum(1 for r in all_rsi if r >= 70),
            "rsi_neutral":    sum(1 for r in all_rsi if 30 < r < 70),
            "rsi_oversold":   sum(1 for r in all_rsi if r <= 30),
            "qrs_strong":     sum(1 for q in all_qrs if q >= 70),
            "qrs_moderate":   sum(1 for q in all_qrs if 40 <= q < 70),
            "qrs_weak":       sum(1 for q in all_qrs if q < 40),
            "avg_qrs":        round(sum(all_qrs) / len(all_qrs), 1)       if all_qrs    else 0.0,
            "avg_change":     round(sum(all_changes) / len(all_changes), 2) if all_changes else 0.0,
        }

        # Global top 5 gainer / loser
        sorted_all = sorted(rows, key=lambda r: float(r.change_pct or 0), reverse=True)
        top_gainers = [_stock_dict(r) for r in sorted_all[:5]  if float(r.change_pct or 0) >  0.05]
        top_losers  = [_stock_dict(r) for r in sorted_all[-5:] if float(r.change_pct or 0) < -0.05]

        # En sık görülen scan_date'i başlık için kullan
        from collections import Counter
        date_counts = Counter(r.scan_date for r in rows if r.scan_date)
        scan_date = str(date_counts.most_common(1)[0][0]) if date_counts else None

        result: Dict[str, Any] = {
            "sectors":     sector_data,
            "breadth":     breadth,
            "top_gainers": top_gainers,
            "top_losers":  list(reversed(top_losers)),
            "scan_date":   scan_date,
            "source":      "live",
        }
        _CACHE["ts"]   = time.time()
        _CACHE["data"] = result
        return result

    except Exception as e:
        return {"sectors": [], "breadth": {}, "top_gainers": [], "top_losers": [], "source": "error", "error": str(e)}
    finally:
        db.close()
