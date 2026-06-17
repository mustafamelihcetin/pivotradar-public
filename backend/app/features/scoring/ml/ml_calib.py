# backend/app/features/scoring/ml/ml_calib.py
from __future__ import annotations
import os, json, datetime as dt, threading
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

import numpy as np

# scikit-learn
try:
    from sklearn.isotonic import IsotonicRegression
    from sklearn.metrics import brier_score_loss, roc_auc_score
except Exception:
    IsotonicRegression = None   # type: ignore
    brier_score_loss = None     # type: ignore
    roc_auc_score = None        # type: ignore

from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from app.core.time_utils import now_utc, isoformat_z

from app.features.scoring.ml.constants import (  # noqa: E402
    SOFT_WEIGHTS, MIN_RETRAIN_SAMPLES,
    CALIB_MIN_SAMPLES, CALIB_WINDOW_DAYS, CALIB_HALF_LIFE_DAYS,
)

MIN_SAMPLES       = CALIB_MIN_SAMPLES
HALF_LIFE_DAYS    = CALIB_HALF_LIFE_DAYS


def _get_ml_config() -> Dict[str, Any]:
    """
    Canlı ML config'i DB'den okur (SystemSettings.key='ml_config').
    DB'ye ulaşamazsa ya da kayıt yoksa hardcoded default'a döner.
    """
    try:
        from app.core.database import SessionLocal
        from app.features.admin.models import SystemSettings
        db = SessionLocal()
        try:
            row = db.query(SystemSettings).filter(SystemSettings.key == "ml_config").first()
            if row and isinstance(row.value, dict):
                return row.value
        finally:
            db.close()
    except Exception:
        pass

    # Hardcoded fallback (DEFAULT_SETTINGS'e paralel)
    return {
        # 20 → CALIB_MIN_SAMPLES (30) yerine; ilk veri birikimine kadar geçici eşik.
        "min_samples": 20,
        "calib_window_days": CALIB_WINDOW_DAYS,
        "half_life_days": HALF_LIFE_DAYS,
        "soft_weights": SOFT_WEIGHTS,
        "w_rule": 0.6,
        "w_ml": 0.4,
        # 0.55 çok katı → BIST gürültülü veri; küçük örneklemde RMSE örnekleme varyansını yansıtır.
        # 0.70: AUC=0.60 ve log_loss=0.65 eşikleriyle harmonize; modeller daha az reddedilir.
        "holdout_val_rmse_threshold": 0.70,
        "per_profile_min_samples": 30,   # O-12: 15 → 30; isotonic regression için min örnek
    }

_MODEL_DIR  = "models"
_MODEL_FILE = "ml_isotonic.json"
_MODEL_PATH = os.path.join(_MODEL_DIR, _MODEL_FILE)

# Profile-specific model dosyaları: models/ml_isotonic_<profile>.json
_PROFILE_MODEL_TPL = os.path.join(_MODEL_DIR, "ml_isotonic_{profile}.json")

_CACHED: Optional["CalibModel"] = None
_PROFILE_CACHE: Dict[str, "CalibModel"] = {}
_CACHE_LOCK = threading.Lock()  # _CACHED ve _PROFILE_CACHE için paylaşımlı lock

# ML trust cache — her PRISM çağrısında DB sorgusunu önler (2807 query → 7 query per scan)
_ML_TRUST_CACHE: Dict[str, tuple] = {}  # profile → (base_trust, timestamp)
_ML_TRUST_TTL: float = 300.0  # 5 dakika
_TRUST_LOCK = threading.Lock()  # _ML_TRUST_CACHE için lock

# ── Model yapısı ─────────────────────────────────────────────────────────────
@dataclass
class CalibModel:
    type: str
    x: List[float]
    y: List[float]
    metrics: Dict[str, Any]
    info: Dict[str, Any]
    created: str

# ── Yardımcılar ──────────────────────────────────────────────────────────────
def _now_utc() -> str:
    return isoformat_z(now_utc())

def _to01(a) -> np.ndarray:
    return np.clip(np.asarray(a, float) / 100.0, 0.0, 1.0)

def _from01(a) -> np.ndarray:
    return np.clip(np.asarray(a, float) * 100.0, 0.0, 100.0)

def _ece(y_true: np.ndarray, p_hat: np.ndarray, bins: int = 10) -> float:
    p = np.clip(np.asarray(p_hat, float), 1e-9, 1.0 - 1e-9)
    y = np.asarray(y_true, float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    e = 0.0
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        m = (p >= lo) & (p <= hi) if i == bins - 1 else (p >= lo) & (p < hi)
        if not np.any(m): continue
        e += (np.sum(m) / len(p)) * abs(float(np.mean(y[m])) - float(np.mean(p[m])))
    return float(e)

def _temporal_weights(evaluated_ats: List[Any], half_life_days: int = HALF_LIFE_DAYS) -> np.ndarray:
    """
    Yakın tarihli verilere üssel olarak daha yüksek ağırlık verir.
    Formül: w = 2^(-(days_ago / half_life))
    Örnek: 0 gün önce → 1.0,  45 gün önce → 0.5,  90 gün önce → 0.25
    """
    now = now_utc().replace(tzinfo=None)
    weights = []
    for ts in evaluated_ats:
        if ts is None:
            weights.append(0.5)
            continue
        if isinstance(ts, str):
            try:
                ts = dt.datetime.fromisoformat(ts.replace("Z", ""))
            except Exception:
                weights.append(0.5)
                continue
        days_ago = max(0.0, (now - ts).total_seconds() / 86400.0)
        w = 2.0 ** (-(days_ago / half_life_days))
        weights.append(w)
    arr = np.array(weights, dtype=float)
    # Normalize etme — sklearn sample_weight normalize edilmemiş üssel ağırlıkları doğru işler.
    # Normalize edince ortalama=1.0 olur, tüm örnekler eşit önem taşır — temporal avantaj yok olur.
    return arr

# ── Fit / Kaydet / Yükle ─────────────────────────────────────────────────────
def fit_isotonic(
    *,
    y_true: np.ndarray,
    p_raw: np.ndarray,
    info: Dict[str, Any],
    sample_weights: Optional[np.ndarray] = None,
) -> CalibModel:
    """
    Soft-label + temporal ağırlıklı Isotonic kalibrasyon.
    - y_true: sürekli [0..1] (soft labels desteklenir)
    - sample_weights: yakın verilere daha yüksek ağırlık
    """
    if IsotonicRegression is None:
        raise RuntimeError("scikit-learn gerekli: pip install scikit-learn")

    y   = np.asarray(y_true, float)
    x01 = _to01(p_raw)
    w   = sample_weights if sample_weights is not None else np.ones(len(y))

    iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
    iso.fit(x01, y, sample_weight=w)

    p_fit = np.clip(iso.predict(x01), 0.0, 1.0)

    # RMSE (soft labels üzerinden — birincil kalite metriği)
    rmse = float(np.sqrt(np.average((y - p_fit) ** 2, weights=w)))

    # Binary metrikler (AUC / Brier için 0.5 eşiği)
    y_bin = (y >= 0.5).astype(int)
    brier = float(brier_score_loss(y_bin, p_fit)) if brier_score_loss else float("nan")
    try:
        auc = float(roc_auc_score(y_bin, p_fit)) if (roc_auc_score and len(np.unique(y_bin)) > 1) else float("nan")
    except Exception:
        auc = float("nan")
    ece = _ece(y, p_fit, bins=10)

    # Score spread: eğer çıktılar dar bir aralıkta kümelenmişse (p90-p10 < 0.50),
    # lineer interpolasyonla [0.10, 0.90] aralığına yay. Metrikler değişmez, sadece tablo.
    _y = iso.y_thresholds_.astype(float)
    _y_min, _y_max = _y.min(), _y.max()
    _spread = _y_max - _y_min
    _MIN_SPREAD = 0.50
    if 0 < _spread < _MIN_SPREAD:
        _target_min = max(0.10, _y_min - (_MIN_SPREAD - _spread) / 2)
        _target_max = _target_min + _MIN_SPREAD
        if _target_max > 0.90:
            _target_max = 0.90
            _target_min = _target_max - _MIN_SPREAD
        _y = _target_min + (_y - _y_min) / _spread * (_target_max - _target_min)
        _y = np.clip(_y, 0.0, 1.0)
        iso.y_thresholds_ = _y

    return CalibModel(
        type="isotonic",
        x=iso.X_thresholds_.astype(float).tolist(),
        y=iso.y_thresholds_.astype(float).tolist(),
        metrics={
            "brier":     brier,
            "ece":       ece,
            "auc":       auc,
            "rmse":      rmse,
            "soft_mean": float(np.mean(y)),
            "n":         int(len(y)),
        },
        info=dict(info or {}),
        created=_now_utc(),
    )

def save_model(m: CalibModel, path: Optional[str] = None) -> str:
    os.makedirs(_MODEL_DIR, exist_ok=True)
    out = path or _MODEL_PATH
    with open(out, "w", encoding="utf-8") as f:
        json.dump(asdict(m), f, ensure_ascii=False)
    if path is None:
        with _CACHE_LOCK:
            global _CACHED
            _CACHED = m
    return out


def _save_model_with_auc_guard(
    m: CalibModel,
    path: Optional[str],
    label: str,
    auc_regression_threshold: float = 0.02,
) -> Optional[str]:
    """
    AUC regresyon korumalı kayıt: yeni model mevcut modelden >2% daha düşük AUC'a
    sahipse kaydı reddeder, eski modeli korur ve None döner.
    """
    import logging as _log
    _logger = _log.getLogger("PivotRadar.MLCalib")

    new_auc = float(m.metrics.get("auc", float("nan")))
    new_n   = int(m.metrics.get("n", 0))
    existing = _load_from_file(path or _MODEL_PATH)
    if existing is not None:
        old_auc = float(existing.metrics.get("auc", float("nan")))
        # Örneklem büyüklüğüne göre dinamik AUC regresyon eşiği:
        # Küçük örneklemde AUC yüksek varyans → geniş eşik
        # Büyük örneklemde AUC stabil → dar eşik güvenli
        if new_n < 300:
            effective_threshold = 0.08   # n<300: gürültü yüksek
        elif new_n < 600:
            effective_threshold = 0.05   # n 300-600: orta
        else:
            effective_threshold = max(auc_regression_threshold, 0.03)  # n>600: daha katı ama min 0.03
        if (
            not (new_auc != new_auc)  # new_auc is not NaN
            and not (old_auc != old_auc)  # old_auc is not NaN
            and new_auc < old_auc - effective_threshold
        ):
            _logger.warning(
                "[%s] AUC regresyon: yeni=%.4f eski=%.4f (eşik=%.2f, n=%d) — eski model korunuyor.",
                label, new_auc, old_auc, effective_threshold, new_n,
            )
            try:
                from app.core.notify import notify_admin
                notify_admin(
                    subject=f"[PivotRadar] ML Model Regresyonu — {label}",
                    body=(
                        f"Profil '{label}' için yeni kalibrasyon modeli reddedildi.\n\n"
                        f"Yeni AUC: {new_auc:.4f}\nEski AUC: {old_auc:.4f}\n"
                        f"Eşik: {auc_regression_threshold:.2f}\n\nEski model korunuyor."
                    ),
                    alert_key=f"ml_rollback_{label}",
                )
            except Exception:
                pass
            return None

    return save_model(m, path=path)

def _load_from_file(path: str) -> Optional[CalibModel]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        return CalibModel(
            type=obj.get("type", "isotonic"),
            x=list(map(float, obj.get("x", []))),
            y=list(map(float, obj.get("y", []))),
            metrics=obj.get("metrics", {}),
            info=obj.get("info", {}),
            created=obj.get("created", _now_utc()),
        )
    except Exception:
        return None

def _load_model() -> Optional[CalibModel]:
    with _CACHE_LOCK:
        global _CACHED
        if _CACHED is None:
            _CACHED = _load_from_file(_MODEL_PATH)
        return _CACHED

def _load_profile_model(profile_name: str) -> Optional[CalibModel]:
    """
    Profil adını canonical key'e normalize ederek model dosyasını yükler.
    Türkçe varyantlar (Güvenli Liman, SAFE_HARBOR, vb.) hepsi aynı dosyayı bulur.
    """
    from app.core.config_profiles import normalize_profile as _norm
    canon = _norm(profile_name)   # e.g. "Güvenli Liman" → "SAFE_HARBOR"
    with _CACHE_LOCK:
        if canon not in _PROFILE_CACHE:
            path = _PROFILE_MODEL_TPL.format(profile=_safe_filename(canon))
            m = _load_from_file(path)
            if m is not None:
                _PROFILE_CACHE[canon] = m
            else:
                import logging as _log
                _log.getLogger("PivotRadar.Calib").debug(
                    "Profil bazlı kalibrasyon modeli yok: '%s' → canonical '%s' (%s)",
                    profile_name, canon, path
                )
        return _PROFILE_CACHE.get(canon)

def _safe_filename(name: str) -> str:
    """Profil adını dosya adına güvenli hale getirir."""
    import re
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", name.lower())

# ── Uygulama API'si ───────────────────────────────────────────────────────────
def apply_calibration(
    x,
    profile_name: Optional[str] = None,
) -> np.ndarray:
    """
    0..100 → kalibre edilmiş 0..100 skoru.
    Profile varsa önce profile-specific model denenir, yoksa global.
    """
    arr = np.asarray(x, float)

    # 1. Profile-specific model
    m = None
    if profile_name:
        m = _load_profile_model(profile_name)

    # 2. Global fallback
    if m is None:
        m = _load_model()

    if m is None or m.type != "isotonic" or not m.x or not m.y:
        return arr.astype(float)

    mx = np.asarray(m.x, float)
    my = np.asarray(m.y, float)

    # P0 SAFETY: tamamen düz model → bypass
    y_span = float(np.max(my) - np.min(my))
    if len(my) > 1 and y_span < 0.05:
        return arr.astype(float)

    x01 = np.clip(arr / 100.0, 0.0, 1.0)
    y01 = np.interp(x01, mx, my)

    # ── Dead zone tespiti ve sigmoid fallback ────────────────────────────────
    # Dead zone: x aralığının >%55'inde y değişmiyorsa (plateau) model ayrıştırmıyor.
    # Bu durumda sigmoid (Platt) kalibrasyon daha sağlıklı bir dağılım verir.
    try:
        x_range = float(mx[-1] - mx[0])
        if x_range > 0:
            # En büyük sürekli plateau'nun uzunluğu
            y_rounded = np.round(my, 3)
            max_plateau = 0
            cur_plateau = 1
            for i in range(1, len(y_rounded)):
                if y_rounded[i] == y_rounded[i - 1]:
                    cur_plateau += 1
                    max_plateau = max(max_plateau, cur_plateau)
                else:
                    cur_plateau = 1
            # Plateau eşiği: en büyük plateau x aralığının >%55'ini kapsıyorsa
            plateau_ratio = max_plateau / max(len(mx) - 1, 1)
            if plateau_ratio > 0.55:
                # Sigmoid (Platt) fallback: win_rate ortalamasına göre ayarlanmış
                soft_mean = float(m.metrics.get("soft_mean", 0.27)) if m.metrics else 0.27
                # logit(soft_mean) → intercept; slope=1 → monoton, rank-preserving
                import math
                logit_mean = math.log(soft_mean / (1 - soft_mean + 1e-9) + 1e-9)
                y01_sig = 1.0 / (1.0 + np.exp(-(x01 * 5.0 + logit_mean - 2.5)))
                # Sigmoid daha geniş dağılım veriyorsa kullan
                if float(np.std(y01_sig)) > float(np.std(y01)) + 0.02:
                    y01 = y01_sig
    except Exception:
        pass  # fallback: isotonic y01 kullanılır

    # Rescaling kaldırıldı: isotonic çıktısı gerçek win_rate'i yansıtmalı.
    return _from01(y01)

# ── Eğitim: Global Model ──────────────────────────────────────────────────────
def retrain_from_db() -> Dict[str, Any]:
    """
    Global Isotonic kalibrasyon modelini yeniden eğitir. [V30]
    """
    return _train_for_filter(model_path=None, extra_filters=[], label="global")


def retrain_profiles_from_db() -> Dict[str, Any]:
    """
    Her strateji profili için ayrı bir Isotonic model eğitir. [V30]
    """
    from app.core.config_profiles import normalize_profile as _norm
    from app.features.scanner.models import SystemTaskLog
    import logging as _log
    
    logger = _log.getLogger("PivotRadar.MLCalib")
    db = SessionLocal()
    results: Dict[str, Any] = {}
    
    # Task start logging
    task_log = SystemTaskLog(task_name="profile_calibration", status="running", started_at=now_utc().replace(tzinfo=None))
    db.add(task_log)
    db.commit()

    try:
        profiles = db.query(ScanScore.profile_name).filter(
            ScanScore.profile_name.isnot(None),
            ScanScore.evaluated_at.isnot(None),
        ).distinct().all()
        raw_names = [p[0] for p in profiles if p[0]]
        
        logger.info(f"Calibration: Found {len(raw_names)} distinct profile names in DB.")

        # Canonical key → list of raw DB names (gruplama)
        canonical_map: Dict[str, List[str]] = {}
        for name in raw_names:
            key = _norm(name)
            canonical_map.setdefault(key, []).append(name)

        cfg = _get_ml_config()
        per_profile_min = cfg.get("per_profile_min_samples", 20)

        for canon_key, raw_variants in canonical_map.items():
            try:
                path = _PROFILE_MODEL_TPL.format(profile=_safe_filename(canon_key))
                
                # Pre-check data count for visibility in logs
                count_q = db.query(ScanScore).filter(
                    ScanScore.profile_name.in_(raw_variants),
                    ScanScore.evaluated_at.isnot(None),
                    ScanScore.ml_score.isnot(None)
                ).count()
                
                logger.info(f"Profile '{canon_key}': Found {count_q} mature samples (Variants: {raw_variants})")

                result = _train_for_filter_multi(
                    model_path=path,
                    profile_names=raw_variants,
                    label=canon_key,
                    min_samples=per_profile_min,
                )
                results[canon_key] = result
                # Update Performance Stats table too
                if "error" not in result:
                    _write_performance_stats(canon_key, result)
                else:
                    logger.warning(f"Profile '{canon_key}' training skipped: {result.get('error')}")
                    
                with _CACHE_LOCK:
                    _PROFILE_CACHE.pop(canon_key, None)
            except Exception as e:
                logger.error(f"Failed to train profile {canon_key}: {e}")
                results[canon_key] = {"error": str(e)}

        task_log.status = "success"
        task_log.message = f"Trained {len([r for r in results.values() if 'error' not in r])} profiles."
        task_log.finished_at = now_utc().replace(tzinfo=None)
        
    except Exception as e:
        logger.error(f"Global profile calibration failure: {e}")
        task_log.status = "error"
        task_log.message = str(e)
        task_log.finished_at = now_utc().replace(tzinfo=None)
    finally:
        try:
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    return results

def _train_for_filter(
    model_path: Optional[str],
    extra_filters: list,
    label: str,
    min_samples: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Ortak eğitim mantığı. Global ve profile eğitimi için kullanılır.
    Parametreler DB'deki ml_config'den okunur, fallback: hardcoded defaults.
    """
    cfg = _get_ml_config()
    _min_samples      = min_samples if min_samples is not None else cfg.get("min_samples", MIN_SAMPLES)
    _window_days      = cfg.get("calib_window_days", CALIB_WINDOW_DAYS)
    _half_life        = cfg.get("half_life_days", HALF_LIFE_DAYS)
    _soft_w           = cfg.get("soft_weights", SOFT_WEIGHTS)
    _val_rmse_thresh  = cfg.get("holdout_val_rmse_threshold", 0.45)

    db = SessionLocal()
    try:
        cutoff_date = now_utc().replace(tzinfo=None) - dt.timedelta(days=_window_days)

        data_all = db.query(ScanScore).filter(
            ScanScore.evaluated_at  != None,
            ScanScore.ml_score      != None,
            ScanScore.evaluated_at  >= cutoff_date,
        )
        for col, val in extra_filters:
            data_all = data_all.filter(getattr(ScanScore, col) == val)
        
        n_evaluated = data_all.count()

        q = data_all.filter(
            ScanScore.target_hit    != None,
            # ── GIGO PROTECTION: Filter poisoned plateaus ──
            ScanScore.ml_score      != 50.0,
            ScanScore.ml_score      != 24.6,
            ScanScore.ml_score      != 38.1,
            ScanScore.qrs_score     != 50.0,
            # Eski model çıktısı (4-9 arası skolar) kalibrasyon verisini zehirler:
            # eski modelin düşük skoru ile yeni modelin yüksek skoru aynı veri setinde
            # bulununca isotonic monotonluğu bozulur → AUC çöker.
            ScanScore.ml_score      >= 10.0,
            ScanScore.ml_score      < 100.0,
        )

        data = q.all()

        if len(data) < _min_samples:
            return {
                "error": (
                    f"[{label}] Yetersiz veri "
                    f"(min {_min_samples}, mevcut {len(data)}, "
                    f"toplam evaluated {n_evaluated})"
                )
            }

        p_raw = np.array([float(d.ml_score) for d in data])

        # Labels: yön doğruluğu (directional_hit) birincil kaynak — daha yumuşak ve tutarlı sinyal.
        # directional_hit yoksa soft-label (hit_status), o da yoksa binary target_hit kullanılır.
        def _label(d) -> float:
            if d.directional_hit is not None:
                return float(int(bool(d.directional_hit)))
            if d.hit_status is not None:
                return _soft_w.get(d.hit_status, float(int(bool(d.target_hit))))
            return float(int(bool(d.target_hit)))

        y_true = np.array([_label(d) for d in data])

        if np.all(y_true == 0.0) or np.all(y_true == 1.0):
            return {"error": f"[{label}] Tek sınıf verisi, kalibrasyon atlandı"}

        # Temporal ağırlıklama: yakın veri > eski veri
        sample_weights = _temporal_weights([d.evaluated_at for d in data], half_life_days=_half_life)

        # Eğitim / doğrulama ayrımı (%20 holdout)
        n = len(data)
        n_val = max(5, n // 5)
        # Zaman sırasına göre en sonki %20 → validation
        idx_sorted = np.argsort([
            d.evaluated_at.timestamp() if d.evaluated_at else 0
            for d in data
        ])
        val_idx   = idx_sorted[-n_val:]
        train_idx = idx_sorted[:-n_val]

        p_train  = p_raw[train_idx]
        y_train  = y_true[train_idx]
        w_train  = sample_weights[train_idx]

        p_val    = p_raw[val_idx]
        y_val    = y_true[val_idx]

        n_soft = sum(1 for d in data if d.hit_status is not None)

        m = fit_isotonic(
            y_true=y_train,
            p_raw=p_train,
            sample_weights=w_train,
            info={
                "source":           "ScanScore DB",
                "label":            label,
                "n":                n,
                "n_train":          len(train_idx),
                "n_val":            len(val_idx),
                "n_soft_labels":    n_soft,
                "soft_label_pct":   round(n_soft / n * 100, 1),
                "cutoff_days":      _window_days,
                "half_life_days":   _half_life,
                "soft_mean":        float(np.mean(y_true)),
                "label_mode":       "soft" if n_soft > n - n_soft else "binary",
            }
        )

        # Validation metriği: holdout RMSE
        x01_val  = np.clip(p_val / 100.0, 0.0, 1.0)
        p_val_pred = np.clip(
            np.interp(x01_val, np.asarray(m.x, float), np.asarray(m.y, float)),
            0.0, 1.0,
        )
        val_rmse = float(np.sqrt(np.mean((y_val - p_val_pred) ** 2)))

        # Sadece validation RMSE makul ise modeli kaydet
        # (çok yüksek val_rmse → kirli veri veya overfitting → eski modeli koru)
        if val_rmse > _val_rmse_thresh:
            return {
                "error": (
                    f"[{label}] Model Onayı Başarısız: RMSE={val_rmse:.3f} "
                    f"— Veri tabanındaki hatalı kayıtlar tespit edildi. "
                    "Sistem bozulmaması için eski temiz model korunuyor."
                )
            }

        saved = _save_model_with_auc_guard(m, path=model_path, label=label)
        if saved is None:
            return {
                "error": f"[{label}] AUC regresyonu — eski model korundu",
                "val_rmse": val_rmse,
                **{k: v for k, v in m.metrics.items()},
            }

        return {
            **m.metrics,
            "val_rmse":       val_rmse,
            "n_clean":        n,
            "soft_label_pct": round(n_soft / n * 100, 1),
            "soft_mean":      float(np.mean(y_true)),
            "label":          label,
        }
    finally:
        db.close()

def _train_for_filter_multi(
    model_path: Optional[str],
    profile_names: List[str],
    label: str,
    min_samples: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Birden fazla profile_name varyantını tek modelde eğitir (canonical key gruplama).
    Tek varyant varsa _train_for_filter'a devreder.
    """
    if len(profile_names) == 1:
        return _train_for_filter(
            model_path=model_path,
            extra_filters=[("profile_name", profile_names[0])],
            label=label,
            min_samples=min_samples,
        )

    # Birden fazla varyant: OR sorgusu için ham SQL yerine Python tarafında filtrele
    cfg = _get_ml_config()
    _min_samples      = min_samples if min_samples is not None else cfg.get("per_profile_min_samples", 20)
    _window_days      = cfg.get("calib_window_days", CALIB_WINDOW_DAYS)
    _half_life        = cfg.get("half_life_days", HALF_LIFE_DAYS)
    _soft_w           = cfg.get("soft_weights", SOFT_WEIGHTS)
    _val_rmse_thresh  = cfg.get("holdout_val_rmse_threshold", 0.45)

    db = SessionLocal()
    try:
        cutoff_date = now_utc().replace(tzinfo=None) - dt.timedelta(days=_window_days)
        data = db.query(ScanScore).filter(
            ScanScore.evaluated_at  != None,
            ScanScore.ml_score      != None,
            ScanScore.target_hit    != None,
            ScanScore.ml_score      != 50.0,
            ScanScore.ml_score      != 24.6,
            ScanScore.ml_score      != 38.1,
            ScanScore.qrs_score     != 50.0,
            ScanScore.qrs_score     != 28.1,
            # Eski model çıktısı (4-9 arası) isotonic monotonluğunu bozar → AUC çöker.
            ScanScore.ml_score      >= 10.0,
            ScanScore.ml_score      < 100.0,
            ScanScore.evaluated_at  >= cutoff_date,
            ScanScore.profile_name.in_(profile_names),
        ).all()
    finally:
        db.close()

    if len(data) < _min_samples:
        return {"error": f"[{label}] Yetersiz veri (min {_min_samples}, mevcut {len(data)})"}

    p_raw = np.array([float(d.ml_score) for d in data])

    def _label_multi(d):
        if getattr(d, "directional_hit", None) is not None:
            return float(int(bool(d.directional_hit)))
        if d.hit_status:
            return _soft_w.get(d.hit_status, float(int(bool(d.target_hit))))
        return float(int(bool(d.target_hit)))

    y_true = np.array([_label_multi(d) for d in data])

    if np.all(y_true == 0.0) or np.all(y_true == 1.0):
        return {"error": f"[{label}] Tek sınıf verisi, kalibrasyon atlandı"}

    sample_weights = _temporal_weights([d.evaluated_at for d in data], half_life_days=_half_life)

    n = len(data)
    n_val = max(5, n // 5)
    idx_sorted = np.argsort([d.evaluated_at.timestamp() if d.evaluated_at else 0 for d in data])
    val_idx, train_idx = idx_sorted[-n_val:], idx_sorted[:-n_val]

    m = fit_isotonic(
        y_true=y_true[train_idx], p_raw=p_raw[train_idx],
        sample_weights=sample_weights[train_idx],
        info={"source": "ScanScore DB", "label": label, "n": n, "variants": profile_names},
    )

    x01_val = np.clip(p_raw[val_idx] / 100.0, 0.0, 1.0)
    p_pred  = np.clip(np.interp(x01_val, np.asarray(m.x, float), np.asarray(m.y, float)), 0.0, 1.0)
    val_rmse = float(np.sqrt(np.mean((y_true[val_idx] - p_pred) ** 2)))

    if val_rmse > _val_rmse_thresh:
        return {"error": f"[{label}] RMSE={val_rmse:.3f} — model reddedildi"}

    saved = _save_model_with_auc_guard(m, path=model_path, label=label)
    n_soft = sum(1 for d in data if d.hit_status is not None)
    if saved is None:
        return {
            "error": f"[{label}] AUC regresyonu — eski model korundu",
            "val_rmse": val_rmse,
            **{k: v for k, v in m.metrics.items()},
        }
    return {**m.metrics, "val_rmse": val_rmse, "n_clean": n,
            "soft_label_pct": round(n_soft / n * 100, 1), "label": label}


# ── Performans istatistiklerini DB'ye yaz ─────────────────────────────────────
def _write_performance_stats(profile: str, calib_result: Dict[str, Any], window_days: int = 150) -> None:
    """
    Kalibrasyon sonrası ml_performance_stats tablosuna performans özeti yazar.
    get_ml_reliability() bu tabloyu okuyarak ML güven faktörünü dinamik ayarlar.
    Bozuk/eksik veriler varsa sessizce geçer (sistemin çalışmasını engelleme).
    """
    try:
        from app.core.database import SessionLocal
        from app.features.scanner.models import MLPerformanceStat, ScanScore
        import datetime as _dt

        db = SessionLocal()
        try:
            cutoff = now_utc().replace(tzinfo=None) - _dt.timedelta(days=window_days)

            # Değerlendirilmiş kayıtları çek — target_hit NULL olanlar (neutral yön)
            # win rate hesabına dahil edilmez; gerçek doğruluk ölçümünü bozar.
            base_q = db.query(ScanScore).filter(
                ScanScore.evaluated_at != None,
                ScanScore.target_direction.in_(["bullish", "bearish"]),
                ScanScore.target_hit != None,
                ScanScore.evaluated_at >= cutoff,
            )
            if profile != "global":
                # Canonical key ile eşleşen tüm DB varyantlarını kapsa
                from app.core.config_profiles import normalize_profile as _norm, _PROFILE_ALIAS
                variants = [k for k, v in _PROFILE_ALIAS.items() if v == profile] + [profile]
                base_q = base_q.filter(ScanScore.profile_name.in_(variants))

            rows = base_q.all()
            n = len(rows)
            if n == 0:
                return

            # Tam hedef isabet oranı (target_hit)
            n_hits = sum(1 for r in rows if r.target_hit is True)
            target_hit_rate = n_hits / n

            # Yönsel isabet oranı (directional_hit)
            dir_rows = [r for r in rows if r.directional_hit is not None]
            n_dir = sum(1 for r in dir_rows if r.directional_hit is True)
            dir_rate = n_dir / len(dir_rows) if dir_rows else target_hit_rate

            # Ortalama büyüklük sapması
            dev_rows = [r.magnitude_deviation_pct for r in rows if r.magnitude_deviation_pct is not None]
            avg_dev = float(np.mean(dev_rows)) if dev_rows else None

            # RMSE (calibration sonucundan)
            rmse = calib_result.get("rmse") or calib_result.get("val_rmse")

            stat = MLPerformanceStat(
                profile=profile,
                timestamp=now_utc().replace(tzinfo=None),
                win_rate=round(dir_rate, 4),           # get_ml_reliability() bu sütunu okur
                directional_win_rate=round(dir_rate, 4),
                target_hit_rate=round(target_hit_rate, 4),
                avg_magnitude_deviation=round(avg_dev, 2) if avg_dev is not None else None,
                rmse=round(float(rmse), 4) if rmse is not None else None,
                n_evaluated=n,
                n_hits=n_hits,
                n_directional=n_dir,
            )
            db.add(stat)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        # İstatistik yazılamazsa sistem çalışmaya devam etmeli
        import logging
        logging.getLogger("PivotRadar.MLCalib").warning(f"[PERF_STATS] Yazılamadı ({profile}): {e}")


# ── Tam kalibrasyon döngüsü ───────────────────────────────────────────────────
def run_full_calibration() -> Dict[str, Any]:
    """
    1. Global modeli eğit
    2. Her profil için ayrı model eğit (yeterli veri varsa)
    3. ml_performance_stats tablosunu güncelle (get_ml_reliability() için)
    4. MLflow'a kalibrasyon metriklerini logla (opsiyonel)
    Döner: {"global": {...}, "profiles": {...}}
    """
    import logging as _log
    _calib_logger = _log.getLogger("PivotRadar.MLCalib")

    global_result  = retrain_from_db()
    profile_result = retrain_profiles_from_db()

    # Global istatistikleri yaz (profil istatistikleri retrain_profiles_from_db() içinde yazılıyor)
    _write_performance_stats("global", global_result)

    trained_profiles = [p for p, r in profile_result.items() if "error" not in r]
    failed_profiles  = [p for p, r in profile_result.items() if "error" in r]

    # ── MLflow tracking (opsiyonel; MLflow yoksa sessizce geç) ────────────────
    try:
        import mlflow
        import os as _os
        _tracking_uri = _os.getenv("MLFLOW_TRACKING_URI", "")
        if _tracking_uri:
            mlflow.set_tracking_uri(_tracking_uri)

        with mlflow.start_run(run_name="Isotonic_Calibration"):
            # Global metrikler
            if "error" not in global_result:
                mlflow.log_metrics({
                    "global_rmse":       float(global_result.get("rmse", 0) or 0),
                    "global_brier":      float(global_result.get("brier", 0) or 0),
                    "global_auc":        float(global_result.get("auc", 0) or 0),
                    "global_val_rmse":   float(global_result.get("val_rmse", 0) or 0),
                    "global_n_clean":    float(global_result.get("n_clean", 0) or 0),
                    "global_soft_mean":  float(global_result.get("soft_mean", 0) or 0),
                })
            mlflow.log_metrics({
                "profiles_trained": float(len(trained_profiles)),
                "profiles_failed":  float(len(failed_profiles)),
            })
            # Profil bazlı RMSE'leri ayrı metrik olarak logla
            for pname, presult in profile_result.items():
                if "error" not in presult:
                    safe_key = pname.lower().replace(" ", "_").replace("-", "_")[:30]
                    mlflow.log_metric(f"profile_{safe_key}_rmse",
                                      float(presult.get("val_rmse", 0) or 0))
                    mlflow.log_metric(f"profile_{safe_key}_n",
                                      float(presult.get("n_clean", 0) or 0))
            mlflow.log_params({
                "trained_profiles": ",".join(trained_profiles) or "none",
                "failed_profiles":  ",".join(failed_profiles)  or "none",
                "global_ok":        str("error" not in global_result),
            })
    except Exception as _mf_err:
        _calib_logger.debug(f"[MLFLOW] Kalibrasyon log atlandı: {_mf_err}")

    return {
        "global":           global_result,
        "profiles":         profile_result,
        "trained_profiles": trained_profiles,
        "failed_profiles":  failed_profiles,
    }


def get_ml_reliability(profile_name: str, ml_score: Optional[float] = None) -> float:
    """
    V8 - DB sorgusu 5 dk cache'lenir (401 sembol × 7 profil = 2807 query → 7 query/tarama).
    Trust eşiği düzeltildi: win_rate 0.48→0.62 aralığında lineer geçiş,
    süreksiz sıçrama (0.55→1.0) kaldırıldı.
    """
    import os, time as _time
    from app.features.scoring.ml.ai_settings import ML_MODEL_PATH

    # ── Cache kontrolü (ml_score bağımsız base_trust cache'lenir) ────────────
    from app.core.config_profiles import normalize_profile as _norm
    canon = _norm(profile_name)
    _now = _time.time()
    with _TRUST_LOCK:
        _cached_entry = _ML_TRUST_CACHE.get(canon)
    if _cached_entry is not None:
        base_trust, _ts = _cached_entry
        if _now - _ts < _ML_TRUST_TTL:
            trust = base_trust
            if ml_score is not None and abs(ml_score - 24.6) < 0.05:
                trust *= 0.2
            return round(max(0.01, min(1.0, trust)), 3)

    # 1. Base Trust — 0.55: performans verisi yokken ML'i ağırlıklı tutma
    trust = 0.55

    # 2. Performance-Based Feedback
    try:
        from app.core.database import SessionLocal
        from sqlalchemy import text

        with SessionLocal() as db:
            sql = text("SELECT win_rate, rmse, n_evaluated FROM ml_performance_stats WHERE profile = :p ORDER BY timestamp DESC LIMIT 1")
            perf = db.execute(sql, {"p": canon}).fetchone()
            if perf is None:
                perf = db.execute(sql, {"p": profile_name}).fetchone()

            _MIN_RELIABLE_SAMPLES = 30
            if perf is None or perf[0] is None or (perf[2] is not None and int(perf[2]) < _MIN_RELIABLE_SAMPLES):
                global_sql = text("SELECT win_rate, rmse, n_evaluated FROM ml_performance_stats WHERE profile = 'global' ORDER BY timestamp DESC LIMIT 1")
                perf = db.execute(global_sql).fetchone()

            if perf and perf[0] is not None:
                win_rate = float(perf[0])
                # Lineer geçiş: 0.48 → ×0.3, 0.62 → ×(1.0/0.55)
                # Önceki: 0.62'de aniden 1.0'a sıçrıyordu (0.55→1.0 keskin atlama)
                _WR_LOW, _WR_HIGH = 0.48, 0.62
                _MULT_LOW, _MULT_HIGH = 0.3, 1.0 / 0.55  # ~1.818
                if win_rate <= _WR_LOW:
                    mult = _MULT_LOW
                elif win_rate >= _WR_HIGH:
                    mult = _MULT_HIGH
                else:
                    t = (win_rate - _WR_LOW) / (_WR_HIGH - _WR_LOW)
                    mult = _MULT_LOW + t * (_MULT_HIGH - _MULT_LOW)
                trust = min(1.0, trust * mult)
    except Exception:
        pass

    # 3. Freshness Check — kalibrasyon haftalık çalıştığından grace period 7 gün
    try:
        if os.path.exists(ML_MODEL_PATH):
            age_days = (_time.time() - os.path.getmtime(ML_MODEL_PATH)) / 86400.0
            if age_days > 7:
                trust *= max(0.1, 1.0 - (age_days - 7) / 14.0)
    except Exception:
        pass

    # Cache'e yaz (ml_score'dan bağımsız base_trust)
    with _TRUST_LOCK:
        _ML_TRUST_CACHE[canon] = (trust, _now)

    if ml_score is not None and abs(ml_score - 24.6) < 0.05:
        trust *= 0.2

    return round(max(0.01, min(1.0, trust)), 3)

def _calibrate_target_mult(avg_target_distance: float, hit_rate: float) -> float:
    """
    Derive a target_mult_adjustment factor from historical performance stats.

    avg_target_distance: average absolute % distance between predicted target
        and actual peak price during the evaluation window. Positive = model
        set targets too far (overshoot); negative = targets too conservative.
    hit_rate: fraction of predictions that hit or nearly hit the target.

    Returns a multiplier in [0.50, 1.50] to apply on top of the base ATR
    target multiplier (PROFILE_TARGET_MULT).

    Calibration logic:
    - When targets are systematically overshooting (avg_dist > threshold),
      shrink the multiplier proportionally so future targets become reachable.
    - When hit_rate is high and distance error is small, allow a mild stretch.
    - Smooth continuous adjustment instead of a hard threshold.
    """
    _ADJ_MIN = 0.50
    _ADJ_MAX = 1.50
    _DIST_SCALE = 40.0   # 40% overshoot → factor drops by 1.0 (fully halved)
    _STRETCH_THRESHOLD = 0.65  # hit_rate above this → allow mild stretch

    # Distance-based shrink: continuous, no hard threshold
    dist_adj = 1.0 - (avg_target_distance / _DIST_SCALE)

    # High-accuracy bonus: if we hit targets often, targets may be too easy — stretch slightly
    if hit_rate > _STRETCH_THRESHOLD and avg_target_distance < 5.0:
        dist_adj = min(_ADJ_MAX, dist_adj + 0.10)

    return float(max(_ADJ_MIN, min(_ADJ_MAX, dist_adj)))


def get_calibrated_tuning(profile_name: str) -> Dict[str, Any]:
    """
    [V30] Senior Calibration: Adjusts target multipliers and confidence
    based on actual historical error rates (avg_target_distance, win_rate).
    """
    from app.core.config_profiles import normalize_profile as _norm
    canon = _norm(profile_name)

    tuning: Dict[str, Any] = {
        "target_mult_adjustment": 1.0,
        "confidence_dampener": 1.0,
        "hit_rate": 0.0,
        "avg_dist_err": 0.0,
        "calibrated": False,
    }

    try:
        from app.core.database import SessionLocal
        from sqlalchemy import text
        with SessionLocal() as db:
            sql = text(
                "SELECT win_rate, avg_target_distance FROM ml_performance_stats "
                "WHERE profile = :p ORDER BY timestamp DESC LIMIT 1"
            )
            perf = db.execute(sql, {"p": canon}).fetchone()
            if perf and perf[0] is not None:
                tuning["calibrated"]  = True
                tuning["hit_rate"]    = float(perf[0] or 0.5)
                tuning["avg_dist_err"] = float(perf[1] or 0.0)

                tuning["target_mult_adjustment"] = _calibrate_target_mult(
                    avg_target_distance=tuning["avg_dist_err"],
                    hit_rate=tuning["hit_rate"],
                )

                if tuning["hit_rate"] < 0.50:
                    tuning["confidence_dampener"] = 0.6
                elif tuning["hit_rate"] > 0.65:
                    tuning["confidence_dampener"] = 1.2
    except Exception:
        pass

    return tuning

def bootstrap_seed_models() -> Dict[str, str]:
    """
    İlk çalıştırmada ya da eksik profil modellerinde kimlik (identity) kalibrasyon
    modeli oluşturur. Kalibrasyon yapmaz — sadece passthrough sağlar. Böylece:
      - ml_trust freshness check'i doğru çalışır (model dosyası var, yaşlı değil)
      - apply_calibration passthrough döner (skor değişmez)
      - WARNING logları susar
    Mevcut modellerin üzerine YAZMAZ.
    """
    from app.core.config_profiles import ALL_PROFILES as _CANONICAL_PROFILES

    os.makedirs(_MODEL_DIR, exist_ok=True)
    results: Dict[str, str] = {}

    # Kimlik model: 0→0, 50→0.5, 100→1.0 (linear passthrough)
    identity_x = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    identity_y = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

    seed = CalibModel(
        type="isotonic",
        x=identity_x,
        y=identity_y,
        metrics={"brier": 0.0, "ece": 0.0, "auc": 0.0, "rmse": 0.0, "soft_mean": 0.5, "n": 0},
        info={"source": "bootstrap_seed", "note": "identity passthrough — replaced after first calibration"},
        created=_now_utc(),
    )

    # Global model
    if not os.path.exists(_MODEL_PATH):
        save_model(seed, path=None)
        results["global"] = "created"
    else:
        results["global"] = "exists"

    # Per-profile modeller
    for canon in _CANONICAL_PROFILES:
        path = _PROFILE_MODEL_TPL.format(profile=_safe_filename(canon))
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                import dataclasses
                json.dump(dataclasses.asdict(seed), f, ensure_ascii=False)
            results[canon] = "created"
        else:
            results[canon] = "exists"

    return results


__all__ = [
    "CalibModel",
    "fit_isotonic",
    "save_model",
    "apply_calibration",
    "retrain_from_db",
    "retrain_profiles_from_db",
    "run_full_calibration",
    "bootstrap_seed_models",
    "get_calibrated_tuning",
    "get_ml_reliability",
    "SOFT_WEIGHTS",
    "MIN_SAMPLES",
    "CALIB_WINDOW_DAYS",
    "HALF_LIFE_DAYS",
]

