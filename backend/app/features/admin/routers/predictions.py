# backend/app/features/admin/routers/predictions.py
"""
Predictions and pipeline admin endpoints:
  GET /predictions
  GET /pipeline/status
  GET /pipeline/profiles
  GET /pipeline/profiles/{profile_key}/trend
"""
import math
import os
import datetime
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, cast, Integer

from app.core.database import get_db
from app.features.users.models import User
from app.features.scanner.models import ScanScore
from app.features.admin.routers._shared import get_admin_user, _san

router = APIRouter()


# ── Predictions table ─────────────────────────────────────────────────────────

@router.get("/predictions", response_model=Dict[str, Any])
def admin_predictions(
    page:      int   = Query(1, ge=1),
    per_page:  int   = Query(50, ge=10, le=200),
    symbol:    Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    evaluated: Optional[bool] = Query(None),
    qrs_min:   Optional[float] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    q = db.query(ScanScore).order_by(desc(ScanScore.scanned_at))

    if symbol:
        q = q.filter(ScanScore.symbol == symbol.upper())
    if direction:
        q = q.filter(ScanScore.target_direction == direction)
    if evaluated is True:
        q = q.filter(ScanScore.evaluated_at.isnot(None))
    elif evaluated is False:
        q = q.filter(ScanScore.evaluated_at.is_(None))
    if qrs_min is not None:
        q = q.filter(ScanScore.qrs_score >= qrs_min)

    total = q.count()
    rows  = q.offset((page - 1) * per_page).limit(per_page).all()

    items = []
    for r in rows:
        items.append({
            "id":             r.id,
            "symbol":         r.symbol,
            "scan_date":      r.scan_date.isoformat() if r.scan_date else None,
            "scanned_at":     r.scanned_at.isoformat() if r.scanned_at else None,
            "qrs_score":      r.qrs_score,
            "ml_score":       r.ml_score,
            "rule_score":     r.rule_score,
            "close_price":    r.close_price,
            "target_price":   r.target_price,
            "target_direction": r.target_direction,
            "predicted_days": r.predicted_days,
            "pattern_name":   r.pattern_name,
            "profile_name":   r.profile_name,
            "rsi":            r.rsi,
            "trend":          r.trend,
            # Calibration
            "evaluated_at":        r.evaluated_at.isoformat() if r.evaluated_at else None,
            "target_hit":          r.target_hit,
            "hit_status":          r.hit_status,
            "hit_accuracy_pct":    r.hit_accuracy_pct,
            "actual_return_pct":   r.actual_return_pct,
            "max_gain_pct":        r.max_gain_pct,
            "max_loss_pct":        r.max_loss_pct,
            # Yönsel doğruluk — tuttu/tutmadı + büyüklük sapması
            "directional_hit":          r.directional_hit,
            "predicted_return_pct":     r.predicted_return_pct,
            "magnitude_deviation_pct":  r.magnitude_deviation_pct,
        })

    return _san({
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    math.ceil(total / per_page) if total else 1,
        "items":    items,
    })


# ── Pipeline status ────────────────────────────────────────────────────────────

@router.get("/pipeline/status", response_model=Dict[str, Any])
def admin_get_pipeline_status(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    """Summary of the ML pipeline health and counts."""
    import json as _json

    today_str = datetime.date.today().isoformat()

    total_samples = db.query(ScanScore).count()
    unevaluated   = db.query(ScanScore).filter(ScanScore.evaluated_at.is_(None)).count()
    evaluated     = total_samples - unevaluated

    # ── Matured / Still Maturing Logic ──────────────────────────────────────────
    matured_ready = 0
    still_maturing = 0
    today = datetime.date.today()

    try:
        pending_rows = db.query(ScanScore.scan_date, ScanScore.predicted_days).filter(
            ScanScore.evaluated_at.is_(None),
            ScanScore.target_direction.in_(["bullish", "bearish"])
        ).limit(5000).all()

        from app.features.admin.utils import add_business_days
        for r_date, r_days in pending_rows:
            try:
                if not r_date or r_days is None:
                    continue

                # Type safety: handle both date and datetime
                r_date_val = r_date.date() if hasattr(r_date, "date") and not isinstance(r_date, datetime.date) else r_date
                eff_days = int(r_days) if r_days is not None else 5

                # Buffer check (scan_date + days + 4 days for weekends)
                if (r_date_val + datetime.timedelta(days=eff_days + 4)) <= today:
                    matured_ready += 1
                else:
                    maturity_date = add_business_days(r_date_val, eff_days)
                    if maturity_date <= today:
                        matured_ready += 1
                    else:
                        still_maturing += 1
            except Exception:
                still_maturing += 1
    except Exception as e:
        logging.error(f"Error in pipeline status calculation: {e}")

    # Only count properly matured directional evaluations in hit/miss/near_miss
    status_counts = db.query(ScanScore.hit_status, func.count(ScanScore.id)).filter(
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.evaluated_at.isnot(None),
        ScanScore.hit_status.isnot(None)
    ).group_by(ScanScore.hit_status).all()

    counts = dict(status_counts)
    t_hits = counts.get("target_hit", 0)
    n_miss = counts.get("near_miss", 0)
    partia = counts.get("partial", 0)
    misses = counts.get("miss", 0)
    total_samples = t_hits + n_miss + partia + misses

    hit_rate = round(t_hits / total_samples * 100, 1) if total_samples > 0 else None

    # Blended Accuracy (Tam=1.0, Near=0.8, Partial=0.4)
    w_sum = (t_hits * 1.0) + (n_miss * 0.8) + (partia * 0.4)
    blended_rate = round(w_sum / total_samples * 100, 1) if total_samples > 0 else None

    avg_ret = db.query(func.avg(ScanScore.actual_return_pct)).filter(
        ScanScore.actual_return_pct.isnot(None)
    ).scalar()
    avg_gain = db.query(func.avg(ScanScore.max_gain_pct)).filter(
        ScanScore.max_gain_pct.isnot(None)
    ).scalar()

    model_path  = "models/ml_isotonic.json"
    model_exists = os.path.exists(model_path)
    model_data: dict = {}
    if model_exists:
        try:
            with open(model_path, "r", encoding="utf-8") as f:
                model_data = _json.load(f)
        except Exception:
            model_data = {}

    model_time = os.path.getmtime(model_path) if model_exists else None

    # Yönsel isabet istatistikleri
    dir_hit_total = db.query(func.count(ScanScore.id)).filter(
        ScanScore.directional_hit == True,
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.evaluated_at.isnot(None),
    ).scalar() or 0
    dir_eval_total = db.query(func.count(ScanScore.id)).filter(
        ScanScore.directional_hit.isnot(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.evaluated_at.isnot(None),
    ).scalar() or 0
    dir_hit_rate = round(dir_hit_total / dir_eval_total * 100, 1) if dir_eval_total else None

    # Safe blended rate
    rates = [r for r in [hit_rate, dir_hit_rate] if r is not None]
    blended_rate = round(sum(rates) / len(rates), 1) if rates else None

    # Ortalama büyüklük sapması
    avg_dev = db.query(func.avg(ScanScore.magnitude_deviation_pct)).filter(
        ScanScore.magnitude_deviation_pct.isnot(None)
    ).scalar()

    # Profil bazlı özet (pipeline kısmı için)
    profile_summary_rows = db.query(
        ScanScore.profile_name,
        func.count(ScanScore.id).label("n"),
        func.sum(func.cast(ScanScore.target_hit, Integer)).label("hits"),
    ).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.profile_name.isnot(None),
    ).group_by(ScanScore.profile_name).all()

    return _san({
        "ok": True,
        "counts": {
            "total":          total_samples,
            "unevaluated":    unevaluated,
            "evaluated":      evaluated,
            "matured_ready":  matured_ready,
            "still_maturing": still_maturing,
            "target_hit":     t_hits,
            "near_miss":      n_miss,
            "partial":        partia,
            "miss":           misses,
        },
        "accuracy": {
            "hit_rate":              hit_rate,
            "directional_hit_rate":  dir_hit_rate,
            "blended_rate":          blended_rate,
            "avg_return":            round(float(avg_ret), 2)  if avg_ret  else None,
            "avg_max_gain":          round(float(avg_gain), 2) if avg_gain else None,
            "avg_magnitude_deviation": round(float(avg_dev), 2) if avg_dev else None,
        },
        "model": {
            "exists":       model_exists,
            "last_updated": datetime.datetime.fromtimestamp(model_time).isoformat() if model_time else None,
            "created":      model_data.get("created"),
            "metrics":      model_data.get("metrics", {}),
            "info":         model_data.get("info", {}),
            "n_thresholds": len(model_data.get("x", [])),
        },
    })


# ── Pipeline: Profil bazlı performans analizi ─────────────────────────────────

@router.get("/pipeline/profiles", response_model=Dict[str, Any])
def admin_pipeline_profiles(
    days:    int           = Query(90,   ge=7, le=730, description="Kaç günlük veri"),
    profile: Optional[str] = Query(None, description="Belirli bir profil filtrele"),
    db:      Session       = Depends(get_db),
    _:       User          = Depends(get_admin_user),
):
    """
    Profil bazlı kalibrasyon performansı — admin pipeline kısmında gösterilir.
    Her profil için: hit_rate, directional_hit_rate, avg_magnitude_deviation,
    blended_accuracy, avg_return, n_evaluated.
    Kullanıcı göremez; sadece admin paneli kullanır.
    """
    from app.core.config_profiles import normalize_profile as _norm, _DISPLAY_NAMES

    cutoff = datetime.date.today() - datetime.timedelta(days=days)

    q = db.query(ScanScore).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.scan_date >= cutoff,
        ScanScore.profile_name.isnot(None),
    )
    if profile:
        q = q.filter(ScanScore.profile_name == profile)

    rows = q.all()

    if not rows:
        return _san({"ok": True, "days": days, "profiles": []})

    _weights = {"target_hit": 1.0, "near_miss": 0.8, "partial": 0.4, "miss": 0.0}

    # Profil bazlı toplama — canonical key üzerinden grupla
    pm: dict = {}
    for r in rows:
        key = _norm(r.profile_name or "")
        if key not in pm:
            pm[key] = {
                "display": _DISPLAY_NAMES.get(key, r.profile_name),
                "n": 0, "hits": 0, "dir_hits": 0, "dir_n": 0,
                "w": 0.0, "returns": [], "devs": [],
            }
        d = pm[key]
        d["n"]  += 1
        d["w"]  += _weights.get(r.hit_status, 0.0)
        if r.hit_status == "target_hit":   d["hits"]     += 1
        if r.directional_hit is not None:  d["dir_n"]    += 1
        if r.directional_hit is True:      d["dir_hits"] += 1
        if r.actual_return_pct is not None:   d["returns"].append(r.actual_return_pct)
        if r.magnitude_deviation_pct is not None: d["devs"].append(r.magnitude_deviation_pct)

    result = []
    for key, v in sorted(pm.items(), key=lambda x: -x[1]["n"]):
        n  = v["n"]
        result.append(_san({
            "profile_key":         key,
            "display_name":        v["display"],
            "n_evaluated":         n,
            "hit_rate":            round(v["hits"]     / n * 100, 1),
            "directional_rate":    round(v["dir_hits"] / v["dir_n"] * 100, 1) if v["dir_n"] else None,
            "blended_accuracy":    round(v["w"]        / n * 100, 1),
            "avg_return":          round(sum(v["returns"]) / len(v["returns"]), 2) if v["returns"] else None,
            "avg_magnitude_deviation": round(sum(v["devs"]) / len(v["devs"]), 2) if v["devs"] else None,
        }))

    return {"ok": True, "days": days, "profiles": result}


@router.get("/pipeline/profiles/{profile_key}/trend", response_model=Dict[str, Any])
def admin_pipeline_profile_trend(
    profile_key: str,
    days:   int      = Query(90, ge=14, le=365),
    bucket: str      = Query("week", pattern="^(day|week|month)$"),
    db:     Session  = Depends(get_db),
    _:      User     = Depends(get_admin_user),
):
    """
    Tek profil için zaman serisi performans trendi.
    bucket=day|week|month — her periyod için hit_rate, directional_rate, blended.
    """
    from app.core.config_profiles import normalize_profile as _norm

    cutoff = datetime.date.today() - datetime.timedelta(days=days)

    rows = db.query(ScanScore).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
        ScanScore.scan_date >= cutoff,
        ScanScore.profile_name.isnot(None),
    ).order_by(ScanScore.scan_date).all()

    # Canonical key ile filtrele
    target_key = profile_key.upper()
    rows = [r for r in rows if _norm(r.profile_name) == target_key]

    if not rows:
        return {"ok": True, "profile": profile_key, "bucket": bucket, "series": []}

    _weights = {"target_hit": 1.0, "near_miss": 0.8, "partial": 0.4, "miss": 0.0}

    def _bucket_key(d: datetime.date) -> str:
        if bucket == "day":   return d.isoformat()
        if bucket == "week":  return f"{d.year}-W{d.isocalendar()[1]:02d}"
        if bucket == "month": return f"{d.year}-{d.month:02d}"
        return d.isoformat()

    buckets_data: dict = {}
    for r in rows:
        bk = _bucket_key(r.scan_date)
        if bk not in buckets_data:
            buckets_data[bk] = {"n": 0, "hits": 0, "dir_hits": 0, "dir_n": 0, "w": 0.0}
        bd = buckets_data[bk]
        bd["n"]  += 1
        bd["w"]  += _weights.get(r.hit_status, 0.0)
        if r.hit_status == "target_hit":   bd["hits"]     += 1
        if r.directional_hit is not None:  bd["dir_n"]    += 1
        if r.directional_hit is True:      bd["dir_hits"] += 1

    series = []
    for bk in sorted(buckets_data.keys()):
        bd = buckets_data[bk]
        n  = bd["n"]
        series.append({
            "period":          bk,
            "n":               n,
            "hit_rate":        round(bd["hits"]     / n * 100, 1),
            "directional_rate":round(bd["dir_hits"] / bd["dir_n"] * 100, 1) if bd["dir_n"] else None,
            "blended":         round(bd["w"]        / n * 100, 1),
        })

    return _san({"ok": True, "profile": profile_key, "bucket": bucket, "series": series})
