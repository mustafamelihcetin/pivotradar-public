# backend/app/features/admin/routers/stats.py
"""
Stats/overview admin endpoints:
  GET /stats
  GET /activity/hourly
  GET /qrs-trend
"""
import datetime
from typing import Any, Dict, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, cast, Date, Integer
from pydantic import BaseModel

from app.core.database import get_db
from app.features.users.models import User
from app.features.scanner.models import ScanScore
from app.features.admin.routers._shared import get_admin_user, _san

router = APIRouter()


# ── Response Models ────────────────────────────────────────────────────────────

class ScansStats(BaseModel):
    total_records: int
    total_symbols: int
    total_sessions: int
    avg_qrs: Optional[float] = None
    last_scan_at: Optional[str] = None
    qrs_distribution: Dict[str, int] = {}

class CalibrationStats(BaseModel):
    total_evaluated: int
    total_hits: int
    hit_rate: Optional[float] = None
    blended_rate: Optional[float] = None
    near_misses: int = 0
    pending: int = 0

class UsersStats(BaseModel):
    total: int
    active: int
    superusers: int

class AdminStatsResponse(BaseModel):
    scans: ScansStats
    calibration: CalibrationStats
    users: UsersStats


# ── Overview stats ─────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    total_scans      = db.query(func.count(ScanScore.id)).scalar() or 0
    total_symbols    = db.query(func.count(func.distinct(ScanScore.symbol))).scalar() or 0
    total_sessions   = db.query(func.count(func.distinct(ScanScore.scan_session_id))).scalar() or 0
    total_evaluated  = db.query(func.count(ScanScore.id)).filter(ScanScore.evaluated_at.isnot(None)).scalar() or 0
    # Win rate hesaplamasında sadece güncel schema (v10+) ile üretilen sinyalleri say
    _v10_filter = ScanScore.ml_schema_version.isnot(None)
    total_hits       = db.query(func.count(ScanScore.id)).filter(
        ScanScore.target_hit == True,
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        _v10_filter,
    ).scalar() or 0
    total_directional_eval = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        _v10_filter,
    ).scalar() or 0
    pending_eval     = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.is_(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
    ).scalar() or 0

    hit_rate = round(total_hits / total_directional_eval * 100, 1) if total_directional_eval > 0 else None

    # Badge breakdown for calibration summary
    near_misses_count = db.query(func.count(ScanScore.id)).filter(
        ScanScore.hit_status == "near_miss",
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        _v10_filter,
    ).scalar() or 0
    # Blended accuracy: target_hit=1.0, near_miss=0.8, partial=0.4, miss=0.0
    blended_weights = {"target_hit": 1.0, "near_miss": 0.8, "partial": 0.4, "miss": 0.0}
    if total_directional_eval > 0:
        status_rows = db.query(ScanScore.hit_status, func.count(ScanScore.id)).filter(
            ScanScore.evaluated_at.isnot(None),
            ScanScore.target_direction.in_(["bullish", "bearish"]),
            ScanScore.hit_status.isnot(None),
            _v10_filter,
        ).group_by(ScanScore.hit_status).all()
        w_sum = sum(blended_weights.get(st, 0.0) * cnt for st, cnt in status_rows)
        blended_rate = round(w_sum / total_directional_eval * 100, 1)
    else:
        blended_rate = None

    total_users    = db.query(func.count(User.id)).scalar() or 0
    active_users   = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    superusers     = db.query(func.count(User.id)).filter(User.is_superuser == True).scalar() or 0

    avg_qrs_row = db.query(func.avg(ScanScore.qrs_score)).filter(ScanScore.qrs_score.isnot(None)).scalar()
    avg_qrs = round(float(avg_qrs_row), 1) if avg_qrs_row else None

    last_scan = db.query(func.max(ScanScore.scanned_at)).scalar()

    # QRS distribution buckets
    buckets = {}
    for lo, hi, label in [(90,100,"90-100"),(80,90,"80-90"),(70,80,"70-80"),(60,70,"60-70"),(0,60,"<60")]:
        cnt = db.query(func.count(ScanScore.id)).filter(
            ScanScore.qrs_score >= lo, ScanScore.qrs_score < hi
        ).scalar() or 0
        buckets[label] = cnt

    return _san({
        "scans": {
            "total_records":  total_scans,
            "total_symbols":  total_symbols,
            "total_sessions": total_sessions,
            "avg_qrs":        avg_qrs,
            "last_scan_at":   last_scan.isoformat() if last_scan else None,
            "qrs_distribution": buckets,
        },
        "calibration": {
            "total_evaluated": total_evaluated,
            "total_hits":      total_hits,
            "hit_rate":        hit_rate,
            "blended_rate":    blended_rate,
            "near_misses":     near_misses_count,
            "pending":         pending_eval,
        },
        "users": {
            "total":      total_users,
            "active":     active_users,
            "superusers": superusers,
        },
    })


# ── Today's activity chart ─────────────────────────────────────────────────────

@router.get("/activity/hourly", response_model=Dict[str, Any])
def admin_hourly_activity(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Scan record counts by hour for today (for the activity chart)."""
    today = datetime.date.today()
    rows = (
        db.query(
            func.extract("hour", ScanScore.scanned_at).label("hour"),
            func.count(ScanScore.id).label("count"),
        )
        .filter(cast(ScanScore.scanned_at, Date) == today)
        .group_by("hour")
        .order_by("hour")
        .all()
    )
    result = {int(r.hour): r.count for r in rows}
    # Fill all 24 hours
    return {"hours": [{"hour": h, "count": result.get(h, 0)} for h in range(24)]}


# ── QRS trend for top N symbols ────────────────────────────────────────────────

@router.get("/qrs-trend", response_model=list[Any])
def admin_qrs_trend(
    limit: int = Query(10, ge=3, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Top symbols by average QRS + their score trend (last 30 days). Single query — no N+1."""
    cutoff = datetime.date.today() - datetime.timedelta(days=30)

    # One query: all (symbol, scan_date, avg_qrs) for the period
    all_rows = (
        db.query(
            ScanScore.symbol,
            ScanScore.scan_date,
            func.avg(ScanScore.qrs_score).label("qrs"),
        )
        .filter(ScanScore.qrs_score.isnot(None), ScanScore.scan_date >= cutoff)
        .group_by(ScanScore.symbol, ScanScore.scan_date)
        .order_by(ScanScore.symbol, ScanScore.scan_date)
        .all()
    )

    # Aggregate per-symbol average and history in Python
    sym_hist: dict = defaultdict(list)
    sym_sum: dict = defaultdict(list)
    for r in all_rows:
        sym_hist[r.symbol].append({"date": r.scan_date.isoformat(), "qrs": round(float(r.qrs), 1)})
        sym_sum[r.symbol].append(float(r.qrs))

    ranked = sorted(sym_sum.keys(), key=lambda s: -sum(sym_sum[s]) / len(sym_sum[s]))[:limit]

    result = [
        {
            "symbol": sym,
            "avg_qrs": round(sum(sym_sum[sym]) / len(sym_sum[sym]), 1),
            "history": sym_hist[sym],
        }
        for sym in ranked
    ]
    return _san(result)


# ── Per-profile performance ───────────────────────────────────────────────────

@router.get("/profile-performance", response_model=list[Any])
def admin_profile_performance(
    days: int = Query(30, ge=7, le=180),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Per-profile win rate + avg return for the last N days (v10+ records only)."""
    cutoff = datetime.date.today() - datetime.timedelta(days=days)
    _v10_filter = ScanScore.ml_schema_version.isnot(None)

    rows = (
        db.query(
            ScanScore.profile_name,
            func.count(ScanScore.id).label("total"),
            func.sum(
                func.cast(ScanScore.directional_hit == True, Integer)
            ).label("dir_hits"),
            func.count(ScanScore.directional_hit).label("evaluated"),
            func.avg(ScanScore.actual_return_pct).label("avg_return"),
        )
        .filter(
            ScanScore.scan_date >= cutoff,
            ScanScore.target_direction.in_(["bullish", "bearish"]),
            _v10_filter,
        )
        .group_by(ScanScore.profile_name)
        .order_by(func.count(ScanScore.id).desc())
        .all()
    )

    # BIST round-trip maliyet: komisyon %0.16 + spread %0.10 = %0.26
    BIST_COST_PCT = 0.26

    result = []
    for r in rows:
        evaluated = int(r.evaluated or 0)
        dir_hits  = int(r.dir_hits  or 0)
        win_rate  = round(dir_hits / evaluated * 100, 1) if evaluated > 0 else None
        avg_ret   = round(float(r.avg_return), 2) if r.avg_return is not None else None
        avg_ret_net = round(avg_ret - BIST_COST_PCT, 2) if avg_ret is not None else None
        result.append({
            "profile_name":   r.profile_name or "Bilinmiyor",
            "total":          int(r.total or 0),
            "evaluated":      evaluated,
            "dir_hits":       dir_hits,
            "win_rate":       win_rate,
            "avg_return":     avg_ret,
            "avg_return_net": avg_ret_net,
            "bist_cost_pct":  BIST_COST_PCT,
        })
    return _san(result)


# ── Alias for frontend: symbol-history ────────────────────────────────────────

@router.get("/symbol-history", response_model=list[Any])
def admin_symbol_history_alias(
    symbol: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Alias for /symbol/{symbol}/history to match frontend's expected query param format."""
    rows = (
        db.query(ScanScore)
        .filter(ScanScore.symbol == symbol.upper())
        .order_by(ScanScore.scan_date)
        .limit(500)
        .all()
    )
    return _san([{
        "scan_date":      r.scan_date.isoformat(),
        "qrs_score":      r.qrs_score,
        "ml_score":       r.ml_score,
        "close_price":    r.close_price,
        "target_hit":     r.target_hit,
        "actual_return":  r.actual_return_pct,
    } for r in rows])


# ── Market Breadth: Bullish vs Bearish count ──────────────────────────────────

@router.get("/market-breadth", response_model=Dict[str, Any])
def admin_market_breadth(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Calculates the ratio of bullish vs bearish symbols in the latest scan."""
    last_session = db.query(ScanScore.scan_session_id).order_by(ScanScore.scanned_at.desc()).first()
    if not last_session:
        return {"bullish": 0, "bearish": 0, "neutral": 0, "total": 0}
    
    sid = last_session[0]
    counts = db.query(ScanScore.target_direction, func.count(ScanScore.id)).filter(
        ScanScore.scan_session_id == sid
    ).group_by(ScanScore.target_direction).all()
    
    res = {str(d or "neutral"): cnt for d, cnt in counts}
    total = sum(res.values())
    
    return _san({
        "bullish": res.get("bullish", 0),
        "bearish": res.get("bearish", 0),
        "neutral": res.get("neutral", 0),
        "total": total,
        "sentiment": round((res.get("bullish", 0) / total * 100), 1) if total > 0 else 0
    })


# ── Risk Metrics ──────────────────────────────────────────────────────────────

@router.get("/risk-metrics", response_model=Dict[str, Any])
def admin_risk_metrics(
    days: int = Query(30, ge=7, le=180),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Aggregate risk metrics for evaluated v10+ signals in the last N days."""
    import math as _math
    from sqlalchemy import func as _func

    cutoff = datetime.date.today() - datetime.timedelta(days=days)
    _v10 = ScanScore.ml_schema_version.isnot(None)

    rows = (
        db.query(
            ScanScore.actual_return_pct,
            ScanScore.alpha,
            ScanScore.outperformed_benchmark,
            ScanScore.max_gain_pct,
            ScanScore.max_loss_pct,
        )
        .filter(
            ScanScore.scan_date >= cutoff,
            ScanScore.evaluated_at.isnot(None),
            ScanScore.target_direction.in_(["bullish", "bearish"]),
            _v10,
        )
        .all()
    )

    if not rows:
        return _san({"n": 0, "avg_return": None, "std_return": None,
                     "sharpe_proxy": None, "avg_alpha": None,
                     "benchmark_win_rate": None, "avg_max_gain": None,
                     "avg_max_loss": None, "max_drawdown": None})

    returns = [r.actual_return_pct for r in rows if r.actual_return_pct is not None]
    alphas  = [r.alpha for r in rows if r.alpha is not None]
    bench_wins = [r.outperformed_benchmark for r in rows if r.outperformed_benchmark is not None]
    max_gains  = [r.max_gain_pct for r in rows if r.max_gain_pct is not None]
    max_losses = [r.max_loss_pct for r in rows if r.max_loss_pct is not None]

    n = len(returns)
    avg_ret = sum(returns) / n if n else None
    std_ret = None
    sharpe = None
    if n >= 2:
        variance = sum((r - avg_ret) ** 2 for r in returns) / (n - 1)
        std_ret = _math.sqrt(variance)
        if std_ret > 0:
            sharpe = round((avg_ret / std_ret) * _math.sqrt(n), 3)
        std_ret = round(std_ret, 3)

    avg_alpha  = round(sum(alphas) / len(alphas), 3) if alphas else None
    bench_wr   = round(sum(bench_wins) / len(bench_wins) * 100, 1) if bench_wins else None
    avg_gain   = round(sum(max_gains) / len(max_gains), 2) if max_gains else None
    avg_loss   = round(sum(max_losses) / len(max_losses), 2) if max_losses else None
    max_dd     = round(min(max_losses), 2) if max_losses else None  # worst single prediction loss

    return _san({
        "n":                  n,
        "avg_return":         round(avg_ret, 3) if avg_ret is not None else None,
        "std_return":         std_ret,
        "sharpe_proxy":       sharpe,
        "avg_alpha":          avg_alpha,
        "benchmark_win_rate": bench_wr,
        "avg_max_gain":       avg_gain,
        "avg_max_loss":       avg_loss,
        "max_drawdown":       max_dd,
        "window_days":        days,
    })


# ── Top Performers: Symbols with most target hits ─────────────────────────────

@router.get("/top-performers", response_model=list[Any])
def admin_top_performers(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Returns symbols that reached their targets most frequently in the last 30 days."""
    cutoff = datetime.date.today() - datetime.timedelta(days=30)
    rows = (
        db.query(
            ScanScore.symbol,
            func.count(ScanScore.id).label("total"),
            func.sum(cast(ScanScore.target_hit, Integer)).label("hits"),
        )
        .filter(ScanScore.scan_date >= cutoff, ScanScore.target_hit.isnot(None))
        .group_by(ScanScore.symbol)
        .having(func.count(ScanScore.id) >= 3)
        .order_by(desc("hits"), desc("total"))
        .limit(10)
        .all()
    )
    
    return _san([{
        "symbol": r.symbol,
        "total_scans": r.total,
        "hits": int(r.hits or 0),
        "accuracy": round((r.hits / r.total * 100), 1) if r.total > 0 else 0
    } for r in rows])
