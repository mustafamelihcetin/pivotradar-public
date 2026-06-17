# backend/app/features/admin/routers/ml.py
"""
ML-related admin endpoints:
  GET  /ml-health
  POST /calibration/run
  GET  /calibration/report
  GET  /calibration/model-status
  POST /trigger/calibrate-profiles
  POST /trigger/retrain
  POST /trigger/calibrate
"""
import os
import datetime
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.core.database import get_db
from app.features.users.models import User
from app.features.admin.calibration import run_calibration, get_accuracy_report
from app.features.admin.routers._shared import (
    get_admin_user, log_admin_action, _san, logger as _shared_logger,
)

logger = _shared_logger

router = APIRouter()


# ── Response Models ────────────────────────────────────────────────────────────

class MLSummary(BaseModel):
    n_evaluated: int
    n_pending_maturity: int
    n_directional_evaluated: int
    directional_hit_rate_pct: Optional[float] = None
    ml_tracking_url: Optional[str] = None

class MLReadiness(BaseModel):
    ready_for_calibration: bool
    ready_for_retrain: bool
    min_calib_samples: int
    min_retrain_samples: int

class MLHealthResponse(BaseModel):
    summary: MLSummary
    readiness: MLReadiness
    model_files: Dict[str, Any] = {}
    last_calibration: Dict[str, Any] = {}
    anomaly_alerts: Optional[Any] = None
    veto_frequency_30d: Dict[str, int] = {}


# ── ML Health ──────────────────────────────────────────────────────────────────

@router.get("/ml-health", response_model=MLHealthResponse)
def admin_ml_health(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Kalibrasyon & eğitim pipeline'ının anlık durumu.
    - Kaç tahmin değerlendirildi, kaç tane bekleniyor
    - Model dosyası kaç saat önce oluşturuldu
    - Son kalibrasyon performans metrikleri
    - Son başarılı kalibrasyon zamanı
    """
    from app.features.scanner.models import ScanScore, MLPerformanceStat
    from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS

    # ── Tahmin sayıları ───────────────────────────────────────────────────────
    n_eval = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.isnot(None)
    ).scalar() or 0

    n_pending = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.is_(None),
        ScanScore.target_direction.in_(["bullish", "bearish"]),
    ).scalar() or 0

    n_directional = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.directional_hit.isnot(None),
    ).scalar() or 0

    n_dir_hits = db.query(func.count(ScanScore.id)).filter(
        ScanScore.evaluated_at.isnot(None),
        ScanScore.directional_hit == True,
    ).scalar() or 0

    # ── ML config'ten eşikler ─────────────────────────────────────────────────
    ml_cfg = get_system_setting(db, "ml_config", DEFAULT_SETTINGS["ml_config"])
    min_calib   = int(ml_cfg.get("min_samples", 30))
    min_retrain = 80

    # ── Model dosyası yaşı ────────────────────────────────────────────────────
    model_age_hours = None
    isotonic_age_hours = None
    try:
        from app.features.scoring.ml.ai_settings import ML_MODEL_PATH
        import os as _os, time as _t
        if _os.path.exists(ML_MODEL_PATH):
            model_age_hours = round((_t.time() - _os.path.getmtime(ML_MODEL_PATH)) / 3600, 1)
    except Exception:
        pass
    try:
        from app.features.scoring.ml.ml_calib import _MODEL_PATH as _ISO_PATH
        import os as _os2, time as _t2
        if _os2.path.exists(_ISO_PATH):
            isotonic_age_hours = round((_t2.time() - _os2.path.getmtime(_ISO_PATH)) / 3600, 1)
    except Exception:
        pass

    # ── Base model meta.json (AUC, ECE, schema version, eğitim özeti) ─────────
    base_model_meta: dict = {}
    try:
        import json as _jm
        _meta_path = "models/ml_latest.joblib.meta.json"
        if os.path.exists(_meta_path):
            with open(_meta_path, "r", encoding="utf-8") as _mf:
                _md = _jm.load(_mf)
            base_model_meta = {
                "feature_schema_version": _md.get("feature_schema_version"),
                "features_hash":          _md.get("features_hash"),
                "val_auc":                _md.get("val_auc"),
                "val_log_loss":           _md.get("val_log_loss"),
                "val_ece":                _md.get("val_ece"),
                "n_train":                _md.get("n_train"),
                "n_val":                  _md.get("n_val"),
                "pos_ratio":              _md.get("pos_ratio"),
                "created_at":             _md.get("created_at"),
            }
    except Exception:
        pass

    # ── Son kalibrasyon performansı (7 Aktif Profil ile Sınırlı) ─────────────
    latest_stats = []
    try:
        from app.core.config_profiles import _DISPLAY_NAMES, ALL_PROFILES
        active_names = list(_DISPLAY_NAMES.values())
        active_keys = ALL_PROFILES

        # Get latest stat for each active profile
        for name in set(active_names + active_keys):
            stat = db.query(MLPerformanceStat)\
                .filter(MLPerformanceStat.profile == name)\
                .order_by(MLPerformanceStat.timestamp.desc()).first()
            if stat:
                latest_stats.append(stat)

        # Sort by timestamp to find the absolute latest for summary
        latest_stats.sort(key=lambda x: x.timestamp, reverse=True)
        latest_stat = latest_stats[0] if latest_stats else None
    except Exception:
        latest_stat = None

    # ── Son başarılı kalibrasyon zamanı ───────────────────────────────────────
    last_calib_ts = None
    try:
        from app.core.task_history import get_last_success_time
        last_calib_ts = get_last_success_time("ml_calibration")
        if last_calib_ts:
            last_calib_ts = last_calib_ts.isoformat()
    except Exception:
        pass

    # ── Anomali uyarıları ─────────────────────────────────────────────────────
    anomaly_alerts = None
    try:
        anomaly_alerts = get_system_setting(db, "anomaly_alerts", None)
    except Exception:
        pass

    # ── Veto frekansı (son 30 gün) ────────────────────────────────────────────
    veto_freq: dict = {}
    try:
        from app.core.time_utils import now_utc
        cutoff_30d = now_utc().replace(tzinfo=None) - datetime.timedelta(days=30)
        veto_rows = db.query(ScanScore.veto_reasons).filter(
            ScanScore.veto_reasons.isnot(None),
            ScanScore.scanned_at >= cutoff_30d,
        ).all()
        for row in veto_rows:
            for v in (row.veto_reasons or "").split(","):
                v = v.strip()
                if v:
                    veto_freq[v] = veto_freq.get(v, 0) + 1
    except Exception:
        pass

    directional_rate = round(n_dir_hits / n_directional * 100, 1) if n_directional else None

    return _san({
        "summary": {
            "n_evaluated":              n_eval,
            "n_pending_maturity":       n_pending,
            "n_directional_evaluated":  n_directional,
            "directional_hit_rate_pct": directional_rate,
            "ml_tracking_url":          os.environ.get("MLFLOW_EXTERNAL_URL") or None
        },
        "readiness": {
            "ready_for_calibration": n_eval >= min_calib,
            "ready_for_retrain":     n_eval >= min_retrain,
            "min_calib_samples":     min_calib,
            "min_retrain_samples":   min_retrain,
        },
        "model_files": {
            "base_model_age_hours":     model_age_hours,
            "isotonic_model_age_hours": isotonic_age_hours,
            "base_model_meta":          base_model_meta,
        },
        "last_calibration": {
            "timestamp": last_calib_ts,
            "performance": {
                "win_rate":              round(float(latest_stat.win_rate) * 100, 1) if latest_stat and latest_stat.win_rate else None,
                "directional_win_rate":  round(float(latest_stat.directional_win_rate) * 100, 1) if latest_stat and latest_stat.directional_win_rate else None,
                "rmse":                  float(latest_stat.rmse) if latest_stat and latest_stat.rmse else None,
                "n_evaluated":           latest_stat.n_evaluated if latest_stat else None,
                "recorded_at":           latest_stat.timestamp.isoformat() if latest_stat and latest_stat.timestamp else None,
            } if latest_stat else None,
        },
        "anomaly_alerts": anomaly_alerts,
        "veto_frequency_30d": dict(sorted(veto_freq.items(), key=lambda x: -x[1])),
    })


# ── Calibration ────────────────────────────────────────────────────────────────

@router.post("/calibration/run", response_model=Dict[str, Any])
def admin_calibration_run(
    eval_window_days: int = Query(14, ge=1, le=90),
    batch_size:       int = Query(200, ge=10, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Trigger calibration job — evaluates pending predictions in the background."""
    try:
        from app.features.scanner.logic.calibration_task import run_autonomous_calibration
        # Run the NEW V30 autonomous calibration
        run_autonomous_calibration()

        # Also run the legacy one for compatibility
        result = run_calibration(db, eval_window_days=eval_window_days, batch_size=batch_size)
        return _san(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calibration/report", response_model=Dict[str, Any])
def admin_calibration_report(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Full accuracy breakdown by QRS band, direction and profile."""
    return _san(get_accuracy_report(db))


@router.get("/calibration/model-status", response_model=Dict[str, Any])
def admin_calibration_model_status(_: User = Depends(get_admin_user)):
    """
    Global + per-profile kalibrasyon model dosyalarının durumunu döner.
    Her model için: exists, last_updated, created, metrics, n_thresholds.
    """
    import json as _json
    from app.features.scoring.ml.ml_calib import _MODEL_DIR, _MODEL_FILE, _PROFILE_MODEL_TPL, _safe_filename

    def _read_model_info(path: str) -> dict:
        if not os.path.exists(path):
            return {"exists": False}
        try:
            mtime = os.path.getmtime(path)
            with open(path, "r", encoding="utf-8") as f:
                d = _json.load(f)
            return {
                "exists":       True,
                "last_updated": datetime.datetime.fromtimestamp(mtime).isoformat(),
                "created":      d.get("created"),
                "metrics":      d.get("metrics", {}),
                "info":         d.get("info", {}),
                "n_thresholds": len(d.get("x", [])),
            }
        except Exception as e:
            return {"exists": True, "error": str(e)}

    global_path = os.path.join(_MODEL_DIR, _MODEL_FILE)
    global_info = _read_model_info(global_path)

    # Discover all profile models — Filtered for Active 7 [V30]
    profiles: dict = {}
    try:
        from app.core.config_profiles import _DISPLAY_NAMES, ALL_PROFILES

        # 1. Initialize all 7 active profiles as 'not exists'
        for key in ALL_PROFILES:
            name = _DISPLAY_NAMES.get(key, key)
            profiles[name] = {"exists": False, "label": name}

        # 2. Scan disk for actual files to update status
        if os.path.isdir(_MODEL_DIR):
            for fname in os.listdir(_MODEL_DIR):
                if fname.startswith("ml_isotonic_") and fname.endswith(".json"):
                    profile_slug = fname[len("ml_isotonic_"):-len(".json")]
                    # Match against our active set (case-insensitive for safety)
                    for p_key in ALL_PROFILES:
                        if p_key.lower() == profile_slug.lower():
                            name = _DISPLAY_NAMES.get(p_key, p_key)
                            path = os.path.join(_MODEL_DIR, fname)
                            profiles[name] = _read_model_info(path)
                            break
    except Exception as e:
        logging.error(f"Error filtering profile models: {e}")

    # ── Per-profil HistGBT model dosyaları ────────────────────────────────────
    profile_ml_models: dict = {}
    try:
        from app.core.config_profiles import ALL_PROFILES, _DISPLAY_NAMES
        _models_root = os.path.join(os.getcwd(), "models")
        if not os.path.isdir(_models_root):
            _models_root = "models"

        for pk in ALL_PROFILES:
            p_joblib = os.path.join(_models_root, f"ml_profile_{pk}.joblib")
            p_meta   = p_joblib + ".meta.json"
            if not os.path.exists(p_joblib):
                profile_ml_models[pk] = {"exists": False, "display": _DISPLAY_NAMES.get(pk, pk)}
                continue
            try:
                mtime = os.path.getmtime(p_joblib)
                age_h = round((datetime.datetime.now().timestamp() - mtime) / 3600, 1)
                meta_d = {}
                if os.path.exists(p_meta):
                    with open(p_meta, "r", encoding="utf-8") as _mf:
                        meta_d = _json.load(_mf)
                profile_ml_models[pk] = {
                    "exists":       True,
                    "display":      _DISPLAY_NAMES.get(pk, pk),
                    "age_hours":    age_h,
                    "last_updated": datetime.datetime.fromtimestamp(mtime).isoformat(),
                    "n_samples":    meta_d.get("n_samples"),
                    "n_train":      meta_d.get("n_train"),
                    "n_val":        meta_d.get("n_val"),
                    "val_log_loss": meta_d.get("val_log_loss"),
                    "created":      meta_d.get("created"),
                }
            except Exception as _pe:
                profile_ml_models[pk] = {"exists": True, "display": _DISPLAY_NAMES.get(pk, pk), "error": str(_pe)}
    except Exception as _pme:
        logging.error("Profile ML model status error: %s", _pme)

    return _san({
        "global":           global_info,
        "profiles":         profiles,
        "profile_ml_models": profile_ml_models,
    })


@router.post("/trigger/calibrate-profiles", response_model=Dict[str, Any])
def admin_trigger_calibrate_profiles(
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Profil bazlı kalibrasyon modellerini arka planda günceller."""
    from app.features.scoring.ml.ml_calib import retrain_profiles_from_db
    bg_tasks.add_task(retrain_profiles_from_db)
    log_admin_action(db, admin, "CALIBRATE_PROFILES")
    return {"ok": True, "message": "Profil kalibrasyon modelleri güncelleniyor (arka planda)."}


@router.post("/trigger/retrain", response_model=Dict[str, Any])
def admin_trigger_retrain(
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Base ML modelini (HistGradientBoosting) yeniden eğitir.
    ScanScore geçmişinden öğrenir; min 80 değerlendirilmiş kayıt gerekir.
    Holdout log-loss > 0.72 ise model reddedilir, eski model korunur.
    """
    from app.features.scoring.ml.training import run_full_retrain
    bg_tasks.add_task(run_full_retrain)
    log_admin_action(db, admin, "ML_RETRAIN")
    return {"ok": True, "message": "Base model retrain başlatıldı (arka planda). Min 80 değerlendirilmiş kayıt gerekli."}


@router.post("/trigger/calibrate", response_model=Dict[str, Any])
def admin_trigger_calibrate(
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Manually trigger the calibration/retrain pipeline in the background.
    Maturity dates are ALWAYS enforced — only predictions whose window has passed
    will be evaluated. This protects model integrity.
    """
    from app.features.scoring.ml.training import run_calibration_pipeline
    bg_tasks.add_task(run_calibration_pipeline)
    log_admin_action(db, admin, "ML_CALIBRATE")
    return {"ok": True, "message": "Kalibrasyon pipeline'ı başlatıldı. Yalnızca vadesi geçmiş tahminler değerlendirilecek."}


@router.get("/archetype-stats", response_model=Dict[str, Any])
def admin_archetype_stats(
    days: int = Query(90, ge=7, le=365, description="Lookback window in calendar days"),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Per-archetype performance stats from evaluated scan_scores.
    Returns hit_rate, directional_hit_rate, avg_return, avg_alpha, n for each archetype.
    Useful for validating which archetypes produce reliable signals.
    """
    from app.core.time_utils import now_utc

    cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=days)

    archetype_rows = db.execute(
        __import__("sqlalchemy").text(
            "SELECT profile_name, target_direction, hit_status, directional_hit, "
            "actual_return_pct, alpha "
            "FROM scan_scores WHERE evaluated_at IS NOT NULL AND evaluated_at >= :cutoff "
            "AND target_direction IN ('bullish','bearish')"
        ),
        {"cutoff": cutoff},
    ).fetchall()

    from collections import defaultdict
    buckets: Dict[str, Dict] = defaultdict(lambda: {
        "n": 0, "hits": 0, "dir_hits": 0, "returns": [], "alphas": []
    })

    for r in archetype_rows:
        # Synthetic archetype key: profile + direction
        key = f"{(r[0] or 'UNKNOWN').upper()}_{(r[1] or 'neutral').upper()}"
        b = buckets[key]
        b["n"] += 1
        if r[2] in ("target_hit", "near_miss"):
            b["hits"] += 1
        if r[3]:
            b["dir_hits"] += 1
        if r[4] is not None:
            b["returns"].append(float(r[4]))
        if r[5] is not None:
            b["alphas"].append(float(r[5]))

    result = {}
    for key, b in sorted(buckets.items()):
        n = b["n"]
        if n < 3:
            continue
        result[key] = {
            "n": n,
            "hit_rate": round(b["hits"] / n, 3),
            "directional_hit_rate": round(b["dir_hits"] / n, 3),
            "avg_return_pct": round(sum(b["returns"]) / len(b["returns"]), 2) if b["returns"] else None,
            "avg_alpha": round(sum(b["alphas"]) / len(b["alphas"]), 2) if b["alphas"] else None,
            "n_with_alpha": len(b["alphas"]),
        }

    return {"days": days, "archetypes": result, "total_evaluated": len(archetype_rows)}


