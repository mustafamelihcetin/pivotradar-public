# backend/app/features/scoring/ml/training.py
from __future__ import annotations
import os
import json
from pathlib import Path
import logging
import datetime as dt
from typing import Any, Dict, List, Optional

import numpy as np

from app.features.scoring.ml.evaluator import evaluate_past_predictions
from app.features.scoring.ml.ml_calib import run_full_calibration
from app.features.scoring.ml.constants import (
    FEATURE_SCHEMA_VERSION, RETRAIN_FEATURES, RETRAIN_FEATURES_V8, SCAN_SCORE_FEATURE_MAP,  # noqa: F401
    SOFT_WEIGHTS, MAX_VAL_LOG_LOSS, MAX_CV_LOG_LOSS, MIN_VAL_AUC, MIN_RETRAIN_SAMPLES, VAL_RATIO,
    PROFILE_ENCODING, FEATURE_BOUNDS, MAX_ECE,
)
from app.core.task_history import record_task_start, record_task_end
from app.core.time_utils import now_utc, isoformat_z

logger = logging.getLogger("PivotRadar.Training")

# ── Sabitler ──────────────────────────────────────────────────────────────────
_MIN_RETRAIN_SAMPLES  = MIN_RETRAIN_SAMPLES
_RETRAIN_WINDOW_DAYS  = 365
_VAL_RATIO            = VAL_RATIO
_MAX_VAL_LOG_LOSS     = MAX_VAL_LOG_LOSS
_MAX_CV_LOG_LOSS      = MAX_CV_LOG_LOSS
_MIN_VAL_AUC          = MIN_VAL_AUC
_BASE_MODEL_DIR       = "/app/models"  # bind mount: /root/PivotRadar/models → /app/models (kalıcı)
_BASE_MODEL_JOBLIB    = "ml_latest.joblib"
_BASE_MODEL_META      = "ml_latest.joblib.meta.json"

_RETRAIN_FEATURES     = RETRAIN_FEATURES
_SCAN_SCORE_FEATURE_MAP = SCAN_SCORE_FEATURE_MAP
_SOFT_WEIGHTS         = SOFT_WEIGHTS

import threading as _threading
_FEATURES_PATCH_LOCK = _threading.RLock()  # re-entrant: run_full_retrain + run_calibration_pipeline her ikisi de alabilir


# ── Yardımcılar ───────────────────────────────────────────────────────────────

def _log_feature_importance(model, feature_names: list, mlflow_module=None) -> None:
    """HistGradientBoosting feature importance'larını loglar ve opsiyonel olarak MLflow'a gönderir."""
    try:
        importances = model.feature_importances_
        paired = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)
        top10 = paired[:10]
        summary = "  ".join(f"{n}={v:.3f}" for n, v in top10)
        logger.info("[RETRAIN] Feature importance (top %d/%d): %s", len(top10), len(paired), summary)
        if mlflow_module is not None:
            for name, imp in paired:
                mlflow_module.log_metric(f"feat_imp_{name}", float(imp))
    except Exception as _e:
        logger.debug("[RETRAIN] Feature importance alınamadı: %s", _e)


def _safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if np.isfinite(f) else default
    except Exception:
        return default


# V8: formasyon tipi ordinal encoding
# Güçlü boğa formasyonları → +2, boğa devam → +1, nötr → 0, ayı devam → -1, güçlü ayı → -2
_PATTERN_ENCODING: Dict[str, float] = {
    # Güçlü boğa (reversal + birikim)
    "Çift Dip": 2.0, "Ters Baş Omuz": 2.0, "Üçlü Dip": 2.0, "Kupa Sap": 2.0, "Alçalan Takoz": 2.0,
    # Boğa devam
    "Yükselen Kanal": 1.0, "Yükselen Üçgen": 1.0, "Bayrak": 1.0, "Flama": 1.0,
    # Nötr / belirsiz
    "Daralan Üçgen": 0.0, "Range/Kutu": 0.0, "Destek Hattı": 0.5, "Direnç Hattı": -0.5,
    "Genişleyen Üçgen": 0.0,
    # Ayı devam
    "Alçalan Kanal": -1.0, "Alçalan Üçgen": -1.0,
    # Güçlü ayı (reversal + dağıtım)
    "Baş Omuz": -2.0, "Çift Tepe": -2.0, "Üçlü Tepe": -2.0, "Yükselen Takoz": -2.0,
}


def _encode_pattern_type(pattern_name: str) -> float:
    if not pattern_name:
        return 0.0
    return _PATTERN_ENCODING.get(pattern_name.strip(), 0.0)


def _build_feature_row(row, features=None) -> List[float]:
    """ScanScore satırından feature vektörü oluşturur."""
    _features = features if features is not None else _RETRAIN_FEATURES
    # V9: raw_features JSON → BB/MACD/ADX/Stoch gibi yeni feature'lar buradan okunur
    _raw_feats: dict = {}
    try:
        if getattr(row, "raw_features", None):
            _raw_feats = json.loads(row.raw_features)
    except Exception:
        pass

    feats = []
    for fname in _features:
        if fname == "pattern_type_encoded":
            feats.append(_encode_pattern_type(getattr(row, "pattern_name", None) or ""))
            continue
        if fname == "profile_encoded":
            # V9b: profil bağlamı — model hangi profil için tahmin yaptığını öğrenir
            prof_name = getattr(row, "profile_name", None) or ""
            feats.append(PROFILE_ENCODING.get(prof_name.strip(), 0.0))
            continue
        if fname == "pattern_formed_bars_ago":
            # V9c: formasyon yaşı — raw_features JSON'dan oku, yoksa 0 (bilinmiyor)
            feats.append(_safe_float(_raw_feats.get("pattern_formed_bars_ago", 0.0)))
            continue
        col = _SCAN_SCORE_FEATURE_MAP.get(fname)
        if col:
            val = getattr(row, col, None)
            if isinstance(val, bool):
                feats.append(1.0 if val else 0.0)
            else:
                # NaN: HistGBT'nin eksik değer mekanizması — 0.0 yanlış bir sinyal verir
                feats.append(_safe_float(val, float("nan")))
        elif fname in _raw_feats:
            feats.append(_safe_float(_raw_feats[fname]))
        else:
            feats.append(float("nan"))

    # Anomaly guard: FEATURE_BOUNDS dışı değerleri kırp (NaN korunur)
    clipped = []
    for val, fname in zip(feats, _features):
        bounds = FEATURE_BOUNDS.get(fname)
        if bounds is not None and val == val:  # val==val → NaN değil
            val = max(bounds[0], min(bounds[1], val))
        clipped.append(val)
    return clipped


def _soft_label(row) -> float:
    """
    V11 label hiyerarşisi:
    1. directional_hit (yön doğruluğu) — birincil sinyal
    2. max_gain_pct / max_loss_pct     — pencere içi gerçek hareket (kısmi kredi)
    3. hit_status (hedef yakınlığı)    — büyüklük bonusu
    4. target_hit binary               — fallback
    """
    dir_hit    = getattr(row, "directional_hit", None)
    hit_st     = getattr(row, "hit_status", None)
    max_gain   = getattr(row, "max_gain_pct", None)
    max_loss   = getattr(row, "max_loss_pct", None)
    target_dir = getattr(row, "target_direction", None)

    if dir_hit is not None:
        hs_w = _SOFT_WEIGHTS.get(hit_st, -1.0) if hit_st else -1.0
        if dir_hit:
            base = max(0.60, hs_w) if hs_w >= 0 else 0.72
            # Büyük intra-window hareket bonusu
            if target_dir == "bullish" and max_gain and max_gain >= 5.0:
                base = min(0.95, base + 0.10)
            elif target_dir == "bearish" and max_loss and max_loss <= -5.0:
                base = min(0.95, base + 0.10)
            return base
        else:
            # Yön yanlış ama pencere içi anlamlı hareket varsa kısmi kredi
            # (Sinyal anlık doğruydu ama vadeye kadar geri döndü)
            if target_dir == "bullish" and max_gain and max_gain >= 3.0:
                return 0.38  # Potansiyel vardı ama tutmadı
            if target_dir == "bearish" and max_loss and max_loss <= -3.0:
                return 0.38
            return min(0.30, hs_w * 0.55) if hs_w > 0 else 0.08

    # Fallback
    if hit_st:
        return _SOFT_WEIGHTS.get(hit_st, float(bool(getattr(row, "target_hit", False))))
    return float(bool(getattr(row, "target_hit", False)))


# ── Ana retrain fonksiyonu ────────────────────────────────────────────────────

def run_full_retrain(feature_override: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    ScanScore geçmişinden yeni bir base ML modeli eğitir ve kaydeder.

    Pipeline:
      1. Değerlendirilmiş kayıtları çek (target_hit veya directional_hit dolu)
      2. ScanScore kolonlarından feature vektörü oluştur
      3. Temporal holdout ile GradientBoosting (HistGB) eğit
      4. Holdout log-loss > eşik → reject, eski model korunur
      5. Başarılıysa .joblib + .meta.json kaydet; MLScorer bir sonraki istekte yeni modeli yükler
    """
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.metrics import log_loss, roc_auc_score
        import joblib as jl
    except ImportError:
        msg = "scikit-learn veya joblib yüklü değil. pip install scikit-learn joblib"
        logger.error(f"[RETRAIN] {msg}")
        return {"error": msg}

    # Concurrent V8 patch'e karşı koruma: _RETRAIN_FEATURES değerini lock altında snapshot al.
    # RLock sayesinde run_calibration_pipeline'dan zaten lock tutularak çağrıldığında re-entrant çalışır.
    with _FEATURES_PATCH_LOCK:
        _eff_features: List[str] = list(feature_override if feature_override is not None else _RETRAIN_FEATURES)

    from app.core.database import SessionLocal
    from app.features.scanner.models import ScanScore

    logger.info("[RETRAIN] Base model yeniden eğitim başlıyor...")

    db = SessionLocal()
    try:
        cutoff = now_utc().replace(tzinfo=None) - dt.timedelta(days=_RETRAIN_WINDOW_DAYS)
        # Duplikasyon koruması: aynı symbol+scan_date+profile kombinasyonu birden fazla kez
        # girilmişse (APScheduler çift tetikleme artıkları) en yeni kaydı tut.
        from sqlalchemy import func as _sqfunc
        latest_ids_subq = (
            db.query(_sqfunc.max(ScanScore.id))
            .filter(
                ScanScore.evaluated_at != None,
                ScanScore.target_hit   != None,
                ScanScore.target_direction.in_(["bullish", "bearish"]),
            )
            .group_by(ScanScore.symbol, ScanScore.scan_date, ScanScore.profile_name)
            .subquery()
        )
        rows = db.query(ScanScore).filter(
            ScanScore.id.in_(latest_ids_subq),
            ScanScore.rsi           != None,
            ScanScore.atr_percent   != None,
            ScanScore.volume        > 0,  # GIGO Koruması
            ScanScore.atr_percent   > 0,  # GIGO Koruması
            ScanScore.evaluated_at  >= cutoff,
            # Degenerate seed/collapsed model outputs — excluded from training data
            ScanScore.ml_score      != 50.0,
            ScanScore.ml_score      != 24.6,
            ScanScore.ml_score      != 38.1,
            # Eski model çıktısı (4-9 arası): farklı model versiyonunun skoru
            # yeni model eğitiminde çakışık sinyal yaratır → AUC çökmesinin kök nedeni.
            ScanScore.ml_score      >= 10.0,
        ).order_by(ScanScore.evaluated_at).all()
    finally:
        db.close()

    n = len(rows)
    if n < _MIN_RETRAIN_SAMPLES:
        msg = f"Yetersiz veri: {n} kayıt (min {_MIN_RETRAIN_SAMPLES}). Daha fazla değerlendirilmiş tahmin gerekli."
        logger.warning(f"[RETRAIN] {msg}")
        return {"error": msg, "n_available": n}

    # Feature matrisi ve soft labellar
    X = np.array([_build_feature_row(r, _eff_features) for r in rows], dtype=float)
    y = np.array([_soft_label(r) for r in rows], dtype=float)

    # Tek sınıf koruması
    unique_vals = np.unique((y >= 0.5).astype(int))
    if len(unique_vals) < 2:
        msg = "[RETRAIN] Tek sınıf etiketi — eğitim atlandı."
        logger.warning(msg)
        return {"error": msg}

    # ── Walk-forward temporal cross-validation ───────────────────────────────
    # Zaman serisi veride leakage'ı önlemek için: veriyi 3 bloğa böl,
    # her fold'da eski bloklar train, sonraki blok validation.
    # Ortalama log-loss > eşik ise model reddedilir.
    n_folds = 3 if n >= 150 else 2
    fold_size = n // (n_folds + 1)
    cv_log_losses = []

    for fold in range(n_folds):
        fold_train_end = fold_size * (fold + 1)
        fold_val_end   = fold_train_end + fold_size
        if fold_val_end > n:
            break
        Xf_tr, yf_tr = X[:fold_train_end], y[:fold_train_end]
        Xf_va, yf_va = X[fold_train_end:fold_val_end], y[fold_train_end:fold_val_end]
        yf_tr_bin = (yf_tr >= 0.5).astype(int)
        yf_va_bin = (yf_va >= 0.5).astype(int)
        if len(np.unique(yf_tr_bin)) < 2 or len(np.unique(yf_va_bin)) < 2:
            continue
        cv_model = HistGradientBoostingClassifier(
            max_iter=200, learning_rate=0.05, max_depth=6,
            min_samples_leaf=15, l2_regularization=2.0, random_state=42,
        )
        cv_model.fit(Xf_tr, yf_tr_bin)
        p_fold = cv_model.predict_proba(Xf_va)[:, 1]
        cv_log_losses.append(log_loss(yf_va_bin, p_fold))

    if cv_log_losses:
        avg_cv_ll = float(np.mean(cv_log_losses))
        logger.info(f"[RETRAIN] Walk-forward CV: {len(cv_log_losses)} folds, avg_log_loss={avg_cv_ll:.4f}")
        if avg_cv_ll > _MAX_CV_LOG_LOSS:
            msg = (
                f"[RETRAIN] Walk-forward CV reddetti: avg_log_loss={avg_cv_ll:.4f} > eşik {_MAX_CV_LOG_LOSS}. "
                "Eski model korunuyor."
            )
            logger.warning(msg)
            return {"error": msg, "cv_log_loss": avg_cv_ll, "n": n}

    # Final model: en eski %80 train, en yeni %20 final validation
    n_val   = max(10, int(n * _VAL_RATIO))
    n_train = n - n_val
    X_train, y_train = X[:n_train], y[:n_train]
    X_val,   y_val   = X[n_train:], y[n_train:]

    # HistGradientBoosting: NaN toleranslı, hızlı, prod-ready
    # V10: max_depth 4→6 (daha derin ağaçlar 37 feature için gerekli),
    #       min_samples_leaf 20→15 (daha ince sınır; l2 ile dengelendi),
    #       l2_regularization 1.0→2.0 (derinlik artışını frenleme)
    model = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_depth=6,
        min_samples_leaf=15,
        l2_regularization=2.0,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=20,
    )

    # Soft labels → binary label + sample_weight
    y_train_bin = (y_train >= 0.5).astype(int)
    y_val_bin   = (y_val   >= 0.5).astype(int)

    # ── Drift detection: önceki modelin win-rate'iyle karşılaştır ──────────────
    _prev_meta_path = Path(_BASE_MODEL_DIR) / _BASE_MODEL_META
    _prev_pos_ratio = None  # type: Optional[float]
    if _prev_meta_path.exists():
        try:
            with open(_prev_meta_path, encoding="utf-8") as _f:
                _pm = json.load(_f)
            _prev_pos_ratio = _pm.get("pos_ratio")
        except Exception:
            pass

    # Class imbalance detection & correction via sample weights
    n_pos = int(y_train_bin.sum())
    n_neg = n_train - n_pos
    pos_ratio = n_pos / max(n_train, 1)
    logger.info(f"[RETRAIN] Class distribution: pos={n_pos}({pos_ratio:.1%}), neg={n_neg}({1-pos_ratio:.1%})")

    # Balance weights: minority class gets higher weight to correct imbalance
    # Cap at 5x to avoid over-correction on severely imbalanced data
    if n_pos > 0 and n_neg > 0:
        imbalance_ratio = min(5.0, n_neg / n_pos) if pos_ratio < 0.4 else min(5.0, n_pos / n_neg)
        class_weight_map = {1: imbalance_ratio if pos_ratio < 0.4 else 1.0,
                            0: 1.0 if pos_ratio < 0.4 else imbalance_ratio}
    else:
        imbalance_ratio = 1.0
        class_weight_map = {0: 1.0, 1: 1.0}

    # Combine soft label weights with class balancing weights
    sw_soft  = np.where(y_train > 0, y_train, 0.0)
    sw_class = np.where(y_train_bin == 1, class_weight_map[1], class_weight_map[0])

    # Selection bias correction: "training_sample" etiketli reddedilmiş sinyaller
    # (8% ihtimalle eklenen rejected signals) daha düşük ağırlık alır.
    # Bu olmadan model, QRS<50 ama ML>20 olan yanıltıcı örnekleri tam ağırlıkla öğrenir.
    sw_rejection = np.ones(n_train)
    for _i, _row in enumerate(rows[:n_train]):
        _veto = getattr(_row, "veto_reasons", None)
        if _veto:
            try:
                _veto_list = json.loads(_veto) if isinstance(_veto, str) else _veto
                if isinstance(_veto_list, list) and "training_sample" in _veto_list:
                    sw_rejection[_i] = 0.40
            except Exception:
                pass

    # Temporal decay — yakın veriye daha yüksek ağırlık (yarı ömür: 90 gün)
    # Nisan/Mayıs gibi anormal piyasa dönemleri model eğitimini zehirlemez
    _now_ts = now_utc().replace(tzinfo=None)
    _HALF_LIFE_DAYS = 90.0
    sw_temporal = np.ones(n_train)
    for _i, _row in enumerate(rows[:n_train]):
        _scan_ts = getattr(_row, "scanned_at", None)
        if _scan_ts is not None:
            try:
                _age_days = max(0.0, (_now_ts - _scan_ts).total_seconds() / 86400.0)
                sw_temporal[_i] = np.exp(-_age_days / _HALF_LIFE_DAYS * np.log(2))
            except Exception:
                pass

    sw_train = sw_soft * sw_class * sw_rejection * sw_temporal
    _sw_mean = sw_train.mean()
    sw_train = sw_train / _sw_mean if _sw_mean > 1e-9 else np.ones_like(sw_train)

    logger.info(f"[RETRAIN] Training: n_train={n_train}, n_val={n_val}, features={_eff_features}, "
                f"imbalance_ratio={imbalance_ratio:.2f}")

    try:
        import mlflow
        import mlflow.sklearn
        mlflow_available = True
    except ImportError:
        mlflow_available = False
        logger.warning("[RETRAIN] mlflow kütüphanesi yüklü değil, takip (tracking) atlanıyor.")

    # ── Ortak eğitim + değerlendirme yardımcısı ─────────────────────────────────
    def _fit_and_evaluate():
        """
        Model eğitir, Platt scaling uygular, holdout metriklerini hesaplar.
        Ayrıca score dağılımını ve drift'i kontrol eder.
        Tüm metrikler dict olarak döner. Reddetme kararı çağıranda yapılır.
        """
        from sklearn.calibration import CalibratedClassifierCV

        # 1. Ham HGB eğitimi
        model.fit(X_train, y_train_bin, sample_weight=sw_train)
        _log_feature_importance(model, _eff_features)

        # 2. Platt scaling (Sigmoid kalibrasyon) — validation set üzerinde fit
        #    Bu sayede raw probability artık gerçek win-rate'e daha yakın olur.
        #    Dead zone sorununu (10-71 arası boşluk) kısmen giderir.
        try:
            cal_model = CalibratedClassifierCV(model, cv="prefit", method="sigmoid")
            cal_model.fit(X_val, y_val_bin)
            p_val_raw = model.predict_proba(X_val)[:, 1]
            p_val_cal = cal_model.predict_proba(X_val)[:, 1]
            # Platt calibration holdout'ta daha iyi log-loss üretiyorsa kullan
            ll_raw = log_loss(y_val_bin, p_val_raw)
            ll_cal = log_loss(y_val_bin, p_val_cal)
            if ll_cal < ll_raw - 0.005:
                logger.info(f"[RETRAIN] Platt scaling kabul edildi: ll_raw={ll_raw:.4f} → ll_cal={ll_cal:.4f}")
                final_model = cal_model
                p_val = p_val_cal
            else:
                logger.info(f"[RETRAIN] Platt scaling atlandı (fark küçük): ll_raw={ll_raw:.4f}, ll_cal={ll_cal:.4f}")
                final_model = model
                p_val = p_val_raw
        except Exception as _ce:
            logger.warning(f"[RETRAIN] Platt scaling başarısız, ham model kullanılıyor: {_ce}")
            final_model = model
            p_val = model.predict_proba(X_val)[:, 1]

        # 3. Holdout metrikleri
        val_ll  = log_loss(y_val_bin, p_val)
        val_acc = float(np.mean((p_val >= 0.5) == y_val_bin))
        try:
            val_auc = float(roc_auc_score(y_val_bin, p_val)) if len(np.unique(y_val_bin)) > 1 else float("nan")
        except Exception:
            val_auc = float("nan")

        # 4. Kalibrasyon sapması (olasılık güvenilirliği)
        try:
            from app.features.scoring.ml.ml_calib import _ece as _calc_ece
            val_ece = _calc_ece(y_val_bin.astype(float), p_val, bins=10)
        except Exception:
            val_ece = float("nan")

        # 4b. Multi-period AUC stability — holdout'u 3 alt periyoda böl
        #     Yüksek varyans (>0.04) → model belirli piyasa rejimlerinde başarısız olabilir
        n_val_rows = len(y_val_bin)
        auc_periods: list = []
        if n_val_rows >= 30 and not np.isnan(val_auc):
            third = n_val_rows // 3
            for _pi in range(3):
                _s = _pi * third
                _e = (_pi + 1) * third if _pi < 2 else n_val_rows
                _yp = y_val_bin[_s:_e]
                _pp = p_val[_s:_e]
                if len(np.unique(_yp)) > 1:
                    try:
                        auc_periods.append(float(roc_auc_score(_yp, _pp)))
                    except Exception:
                        pass
            if len(auc_periods) >= 2:
                _auc_var = float(np.var(auc_periods))
                _auc_min = min(auc_periods)
                logger.info(
                    "[RETRAIN] Multi-period AUC: %s → var=%.4f, min=%.3f",
                    [round(a, 3) for a in auc_periods], _auc_var, _auc_min,
                )
                if _auc_var > 0.04:
                    logger.warning(
                        "[RETRAIN] ⚠️ AUC kararsızlığı: var=%.4f > 0.04 — model belirli "
                        "dönemlerde tutarsız (rejim geçişlerine duyarlı olabilir).", _auc_var,
                    )

        # 5. Score dağılımı (p10 / median / p90) — bimodal / dead-zone tespiti
        pcts = np.percentile(p_val * 100, [10, 25, 50, 75, 90])
        logger.info(
            "[RETRAIN] Val score dağılımı (×100): p10=%.1f p25=%.1f p50=%.1f p75=%.1f p90=%.1f",
            *pcts,
        )
        if pcts[2] > 85.0:
            logger.warning(
                "[RETRAIN] ⚠️ Medyan validation skoru %.1f > 85 — model aşırı güvenli (overconfident). "
                "Kalibrasyon veya veri dengesi incelenmeli.", pcts[2]
            )
        if pcts[4] - pcts[0] < 10.0:
            logger.warning(
                "[RETRAIN] ⚠️ Val skor yayılımı dar (p90-p10=%.1f) — model yeterince ayrıştırmıyor.",
                pcts[4] - pcts[0],
            )

        # 6. Drift detection
        if _prev_pos_ratio is not None:
            drift = abs(pos_ratio - _prev_pos_ratio)
            if drift > 0.15:
                logger.warning(
                    "[RETRAIN] ⚠️ Win-rate drift tespit edildi: önceki=%.1f%% → şimdiki=%.1f%% (Δ=%.1f%%)",
                    _prev_pos_ratio * 100, pos_ratio * 100, drift * 100,
                )

        logger.info(
            "[RETRAIN] Holdout: log_loss=%.4f acc=%.3f auc=%.4f ece=%.4f",
            val_ll, val_acc, val_auc if not np.isnan(val_auc) else -1.0,
            val_ece if not np.isnan(val_ece) else -1.0,
        )

        return final_model, p_val, val_ll, val_acc, val_auc, val_ece, pcts

    if mlflow_available:
        with mlflow.start_run(run_name="HistGB_Retrain"):
            mlflow.log_params({
                "max_iter": 300,
                "learning_rate": 0.05,
                "max_depth": 6,
                "min_samples_leaf": 15,
                "l2_regularization": 2.0,
                "random_state": 42,
                "early_stopping": True,
                "validation_fraction": 0.15,
                "n_iter_no_change": 20,
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
                "imbalance_ratio": imbalance_ratio,
                "n_train": n_train,
                "n_val": n_val,
            })

            model, p_val, val_ll, val_acc, val_auc, val_ece, score_pcts = _fit_and_evaluate()

            cv_log_loss_avg = float(np.mean(cv_log_losses)) if cv_log_losses else None
            mlflow.log_metrics({
                "val_log_loss": val_ll,
                "val_accuracy": val_acc,
                "val_auc": val_auc if not np.isnan(val_auc) else 0.0,
                "val_ece": val_ece if not np.isnan(val_ece) else 0.0,
                "cv_log_loss": cv_log_loss_avg or 0.0,
                "score_p50": float(score_pcts[2]),
                "score_spread": float(score_pcts[4] - score_pcts[0]),
            })

            if val_ll > _MAX_VAL_LOG_LOSS:
                msg = (f"[RETRAIN] Model reddedildi: log_loss={val_ll:.4f} > eşik {_MAX_VAL_LOG_LOSS}.")
                logger.warning(msg)
                return {"error": msg, "val_log_loss": val_ll, "val_acc": val_acc, "n": n}

            if not np.isnan(val_auc) and val_auc < _MIN_VAL_AUC:
                msg = (f"[RETRAIN] Model reddedildi: AUC={val_auc:.4f} < eşik {_MIN_VAL_AUC}.")
                logger.warning(msg)
                return {"error": msg, "val_log_loss": val_ll, "val_auc": val_auc, "n": n}

            # Kalibrasyon sapması gate (V10: 0.20→0.15)
            if not np.isnan(val_ece) and val_ece > MAX_ECE:
                msg = (f"[RETRAIN] Model reddedildi: kalibrasyon_sapması={val_ece:.4f} > eşik {MAX_ECE}. "
                       "Olasılık tahmini güvenilmez — isotonic/Platt yetersiz kaldı.")
                logger.warning(msg)
                return {"error": msg, "val_ece": val_ece, "n": n}

            try:
                mlflow.sklearn.log_model(sk_model=model, artifact_path="model")
            except Exception as _mle:
                logger.warning(
                    "[RETRAIN] MLflow model artifact kaydedilemedi (kritik değil, model dosyaya yazılıyor): %s",
                    type(_mle).__name__,
                )
    else:
        model, p_val, val_ll, val_acc, val_auc, val_ece, score_pcts = _fit_and_evaluate()

        if val_ll > _MAX_VAL_LOG_LOSS:
            msg = (f"[RETRAIN] Model reddedildi: log_loss={val_ll:.4f} > eşik {_MAX_VAL_LOG_LOSS}.")
            logger.warning(msg)
            return {"error": msg, "val_log_loss": val_ll, "val_acc": val_acc, "n": n}

        if not np.isnan(val_auc) and val_auc < _MIN_VAL_AUC:
            msg = (f"[RETRAIN] Model reddedildi: AUC={val_auc:.4f} < eşik {_MIN_VAL_AUC}.")
            logger.warning(msg)
            return {"error": msg, "val_log_loss": val_ll, "val_auc": val_auc, "n": n}

        if not np.isnan(val_ece) and val_ece > MAX_ECE:
            msg = (f"[RETRAIN] Model reddedildi: kalibrasyon_sapması={val_ece:.4f} > eşik {MAX_ECE}.")
            logger.warning(msg)
            return {"error": msg, "val_ece": val_ece, "n": n}

    # ── Kaydet ───────────────────────────────────────────────────────────────
    import shutil, glob as _glob
    os.makedirs(_BASE_MODEL_DIR, exist_ok=True)
    model_path = Path(_BASE_MODEL_DIR) / _BASE_MODEL_JOBLIB
    meta_path  = Path(_BASE_MODEL_DIR) / _BASE_MODEL_META

    # Versiyonlama: mevcut modeli tarih damgalı kopyaya taşı, son 3 versiyonu tut
    if os.path.exists(model_path):
        ts_tag = now_utc().replace(tzinfo=None).strftime("%Y%m%d_%H%M%S")
        versioned = os.path.join(_BASE_MODEL_DIR, f"ml_latest_{ts_tag}.joblib")
        try:
            shutil.copy2(model_path, versioned)
            # Eski versiyonları temizle — son 3 tut
            old_versions = sorted(
                _glob.glob(os.path.join(_BASE_MODEL_DIR, "ml_latest_*.joblib"))
            )
            for old in old_versions[:-3]:
                try:
                    os.remove(old)
                except Exception:
                    pass
        except Exception as _ve:
            logger.warning(f"[RETRAIN] Versiyon yedeklemesi başarısız: {_ve}")

    _tmp_model_path = model_path.with_suffix(".tmp.pkl")
    try:
        jl.dump(model, _tmp_model_path)
        _tmp_model_path.replace(model_path)
    except Exception as _save_err:
        logger.error("[RETRAIN] Model dosyası kaydedilemedi: %s — eski model korunuyor.", _save_err)
        try:
            _tmp_model_path.unlink(missing_ok=True)
        except Exception:
            pass
        return {"error": f"Model save failed: {_save_err}"}

    meta = {
        "feature_names":      _eff_features,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "created":            isoformat_z(now_utc()),
        "n_train":            n_train,
        "n_val":              n_val,
        "n_total":            n,
        "pos_ratio":          round(pos_ratio, 4),
        "val_log_loss":       round(val_ll, 4),
        "val_accuracy":       round(val_acc, 3),
        "val_auc":            round(val_auc, 4) if not np.isnan(val_auc) else None,
        "val_ece":            round(val_ece, 4) if not np.isnan(val_ece) else None,
        "score_p10":          round(float(score_pcts[0]), 2),
        "score_p25":          round(float(score_pcts[1]), 2),
        "score_p50":          round(float(score_pcts[2]), 2),
        "score_p75":          round(float(score_pcts[3]), 2),
        "score_p90":          round(float(score_pcts[4]), 2),
        "score_spread_p90_p10": round(float(score_pcts[4] - score_pcts[0]), 2),
        "cv_log_loss":        round(float(np.mean(cv_log_losses)), 4) if cv_log_losses else None,
        "cv_folds":           len(cv_log_losses),
        "model_type":         "HistGradientBoostingClassifier+PlattIfBetter",
        "window_days":        _RETRAIN_WINDOW_DAYS,
        "label_mode":         "binary(soft>=0.5)+sample_weight",
        "soft_weights":       _SOFT_WEIGHTS,
        "directional_hit_min_threshold_pct": 20.0,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # A-5: Yeni modeli önce shadow olarak kaydet.
    # Shadow model %10 trafik alır; prod model yerini korur.
    # 48 saat veya ≥200 shadow hit sonrası otomatik prod'a terfi eder.
    shadow_path = Path(_BASE_MODEL_DIR) / "ml_shadow.joblib"
    shadow_meta_path = Path(_BASE_MODEL_DIR) / "ml_shadow.joblib.meta.json"
    try:
        import shutil as _sh
        _sh.copy2(model_path, shadow_path)
        shadow_meta = dict(meta)
        shadow_meta["shadow_mode"] = True
        shadow_meta["shadow_start"] = isoformat_z(now_utc())
        shadow_meta["shadow_hits"]  = 0
        shadow_meta["promote_after_hits"] = 200
        with open(shadow_meta_path, "w", encoding="utf-8") as f:
            json.dump(shadow_meta, f, ensure_ascii=False, indent=2)
        logger.info("[RETRAIN] Shadow model oluşturuldu: %s (%%10 trafik alacak)", shadow_path.name)
    except Exception as _se:
        logger.warning("[RETRAIN] Shadow model oluşturulamadı: %s", _se)

    # MLScorer önbelleğini temizle — bir sonraki istekte yeni model yüklensin
    try:
        import app.features.scanner.engine as _eng
        if hasattr(_eng, "_ml_scorer"):
            _eng._ml_scorer = None
    except Exception:
        pass

    # Retrain sonrası monitoring: feature drift + score dağılımı kontrol et
    try:
        from app.features.scoring.ml.feature_monitor import run_feature_monitor
        _mon = run_feature_monitor()
        if not _mon.get("ok", True):
            logger.warning("[RETRAIN] ⚠️ Post-retrain monitoring uyarı verdi: %s", _mon)
        else:
            logger.info("[RETRAIN] Post-retrain monitoring: OK (n=%d)", _mon.get("n", 0))
    except Exception as _me:
        logger.debug("[RETRAIN] Monitoring çalışmadı (kritik değil): %s", _me)

    logger.info(
        f"[RETRAIN] ✅ Yeni base model + shadow kaydedildi: {model_path} "
        f"(log_loss={val_ll:.4f}, acc={val_acc:.3f}, n={n})"
    )

    return {
        "ok":           True,
        "model_path":   model_path,
        "n_train":      n_train,
        "n_val":        n_val,
        "n_total":      n,
        "val_log_loss": round(val_ll, 4),
        "val_accuracy": round(val_acc, 3),
        "cv_log_loss":  round(float(np.mean(cv_log_losses)), 4) if cv_log_losses else None,
        "cv_folds":     len(cv_log_losses),
        "features":     _eff_features,
        **_train_per_profile_models(rows, _eff_features, _MAX_CV_LOG_LOSS),
    }


# ── Per-profil mini model eğitimi ────────────────────────────────────────────

_PROFILE_KEYS = [
    "SAFE_HARBOR", "AGGRESSIVE", "REVERSAL", "TREND_HUNTER",
    "VALUE_SCOUT", "SCALPER", "BREAKOUT",
]
_MIN_PROFILE_SAMPLES = 40  # her profil için minimum eğitim kaydı


def _train_per_profile_models(
    rows: list,
    features: list,
    max_log_loss: float,
) -> dict:
    """
    Global retrain sonrası 7 profil için ayrı mini-model eğitir.
    Yeterli veri olan profiller için ml_profile_{KEY}.joblib kaydeder.
    """
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.metrics import log_loss as _log_loss
        import joblib as _jl
    except ImportError:
        return {"trained_profiles": [], "failed_profiles": []}

    from app.core.config_profiles import normalize_profile as _norm

    trained, failed = [], []
    os.makedirs(_BASE_MODEL_DIR, exist_ok=True)

    for pk in _PROFILE_KEYS:
        p_rows = [r for r in rows if _norm(getattr(r, "profile_name", "") or "") == pk]
        n_p = len(p_rows)

        if n_p < _MIN_PROFILE_SAMPLES:
            failed.append({"profile": pk, "n": n_p, "reason": f"yetersiz veri (min {_MIN_PROFILE_SAMPLES})"})
            logger.info("[RETRAIN-PROFILE] %s: %d kayıt < %d, atlandı.", pk, n_p, _MIN_PROFILE_SAMPLES)
            continue

        try:
            Xp = np.array([_build_feature_row(r, features) for r in p_rows], dtype=float)
            yp = np.array([_soft_label(r) for r in p_rows], dtype=float)

            n_val_p  = max(8, int(n_p * 0.20))
            n_tr_p   = n_p - n_val_p
            Xtr, ytr = Xp[:n_tr_p], yp[:n_tr_p]
            Xva, yva = Xp[n_tr_p:], yp[n_tr_p:]
            ytr_bin  = (ytr >= 0.5).astype(int)
            yva_bin  = (yva >= 0.5).astype(int)

            if len(np.unique(ytr_bin)) < 2:
                failed.append({"profile": pk, "n": n_p, "reason": "tek sınıf etiket"})
                continue

            p_model = HistGradientBoostingClassifier(
                max_iter=200, learning_rate=0.05, max_depth=4,
                min_samples_leaf=10, l2_regularization=2.0, random_state=42,
            )
            p_model.fit(Xtr, ytr_bin)

            # Holdout log-loss kontrolü
            if len(np.unique(yva_bin)) >= 2:
                p_prob = p_model.predict_proba(Xva)[:, 1]
                p_ll   = float(_log_loss(yva_bin, p_prob))
                if p_ll > max_log_loss:
                    failed.append({"profile": pk, "n": n_p, "reason": f"log_loss={p_ll:.3f} > eşik"})
                    logger.info("[RETRAIN-PROFILE] %s: reddedildi (log_loss=%.3f).", pk, p_ll)
                    continue
            else:
                p_ll = float("nan")

            # Platt scaling
            try:
                cal = CalibratedClassifierCV(p_model, cv="prefit", method="sigmoid")
                cal.fit(Xva, yva_bin)
                final_p = cal
            except Exception:
                final_p = p_model

            # Kaydet — ml_profile_{KEY}.joblib  (ml_latest_* glob'undan ayrı)
            p_path = Path(_BASE_MODEL_DIR) / f"ml_profile_{pk}.joblib"
            p_meta_path = p_path.with_suffix(".joblib.meta.json")
            tmp_p = p_path.with_suffix(".tmp.pkl")
            _jl.dump(final_p, tmp_p)
            tmp_p.replace(p_path)

            with open(p_meta_path, "w", encoding="utf-8") as _f:
                import json as _j
                _j.dump({
                    "model_type":           "profile",
                    "profile":              pk,
                    "feature_names":        features,
                    "feature_schema_version": FEATURE_SCHEMA_VERSION,
                    "n_samples":            n_p,
                    "n_train":              n_tr_p,
                    "n_val":                n_val_p,
                    "val_log_loss":         round(p_ll, 4) if not np.isnan(p_ll) else None,
                    "created":              isoformat_z(now_utc()),
                }, _f, ensure_ascii=False, indent=2)

            trained.append({"profile": pk, "n": n_p, "val_log_loss": round(p_ll, 4) if not np.isnan(p_ll) else None})
            logger.info("[RETRAIN-PROFILE] %s: ✅ kaydedildi (%d kayıt, ll=%.3f).", pk, n_p, p_ll if not np.isnan(p_ll) else 0)

        except Exception as pe:
            failed.append({"profile": pk, "n": n_p, "reason": str(pe)})
            logger.warning("[RETRAIN-PROFILE] %s: hata — %s", pk, pe)

    logger.info(
        "[RETRAIN-PROFILE] Tamamlandı: %d profil eğitildi, %d atlandı/başarısız.",
        len(trained), len(failed),
    )
    return {"trained_profiles": trained, "failed_profiles": failed}


# ── Tam pipeline (kalibrasyon + retrain) ─────────────────────────────────────

def run_calibration_pipeline():
    """
    Otomatik kalibrasyon döngüsü:
      1. Vadesi geçmiş tahminleri değerlendir
      2. Global + profil bazlı Isotonic modeli güncelle
      3. Yeterli veri varsa base modeli de yeniden eğit

    Distributed lock ile autonomous_calibration ile çakışma engellenir.
    """
    from app.core.database import SessionLocal as _SessionLocal
    from app.core.ml_lock import acquire_ml_lock, release_ml_lock

    lock_db = _SessionLocal()
    try:
        if not acquire_ml_lock(lock_db):
            logger.info("[ML-PIPELINE] Başka bir ML görevi çalışıyor (lock tutulmuş) — atlanıyor.")
            lock_db.close()
            return
    except Exception as e:
        logger.warning(f"[ML-PIPELINE] Lock alınamadı, devam ediliyor: {e}")
        try:
            release_ml_lock(lock_db)
        except Exception:
            pass
        lock_db.close()
        lock_db = None

    log_id = record_task_start("ml_calibration")
    logger.info("[ML-PIPELINE] Kalibrasyon pipeline başlatıldı.")

    try:
        # 1. Evaluate
        eval_count = evaluate_past_predictions()
        if eval_count and eval_count > 0:
            logger.info(f"[ML-EVAL] {eval_count} adet yeni tahmin değerlendirildi.")
        else:
            logger.info("[ML-EVAL] Değerlendirilecek yeni olgunlaşmış tahmin bulunamadı.")

        # 2. Isotonic kalibrasyon
        logger.info("[ML-TRAIN] Global + profil bazlı kalibrasyon başlatılıyor...")
        result = run_full_calibration()

        global_r = result.get("global", {})
        trained  = result.get("trained_profiles", [])
        failed   = result.get("failed_profiles", [])

        if "error" in global_r:
            calib_warn = f"Global isotonic uyarısı: {global_r['error']}"
            logger.warning(f"[ML-TRAIN] {calib_warn}")
        else:
            calib_warn = ""

        # 3. Base model retrain — akıllı tetikleme koşulları
        #    a) Son retrainden bu yana yeterli yeni kayıt var mı?
        #    b) V9 özelliklerle (raw_features dolu) yeterli kayıt var mı?
        #    c) Calibration quality degraded mı?
        _should_retrain = True
        _v9_count = 0   # default: DB sorgusu başarısız olursa V8 fallback aktif kalır
        _new_count = 0
        try:
            from app.core.database import SessionLocal as _DB
            import datetime as _dt
            _db2 = _DB()
            try:
                from app.features.scanner.models import ScanScore as _SS
                # Son retrain tarihi meta.json'dan oku
                _prod_meta_p = Path(_BASE_MODEL_DIR) / _BASE_MODEL_META
                _last_retrain = None
                if _prod_meta_p.exists():
                    _pm = json.loads(_prod_meta_p.read_text("utf-8"))
                    _created = _pm.get("created")
                    if _created:
                        try:
                            import dateutil.parser as _dp
                            _last_retrain = _dp.parse(_created).replace(tzinfo=None)
                        except Exception:
                            pass

                _now = now_utc().replace(tzinfo=None)
                # Koşul A: son retrainden bu yana en az 3 takvim günü geçmeli.
                # V9 verisi hızla biriktiğinden ve model güncel kalmalı.
                if _last_retrain and (_now - _last_retrain).days < 3:
                    logger.info("[ML-PIPELINE] Retrain atlandı: son retrainden %d gün geçmiş (min 3 gün).",
                                (_now - _last_retrain).days)
                    _should_retrain = False

                if _should_retrain:
                    # Koşul B: son 45 takvim günü (~30 iş günü) içinde en az 50 yeni değerlendirilmiş kayıt.
                    # NOT: Tarama sadece iş günlerinde çalışır — 30 takvim günü ≈ 22 iş günü → yetersiz.
                    # 45 takvim günü = ~30 iş günü → anlamlı V9 verisi için gerçekçi bekleme süresi.
                    _cutoff45 = _now - _dt.timedelta(days=45)
                    _new_count = _db2.query(_SS).filter(
                        _SS.evaluated_at >= _cutoff45,
                        _SS.target_hit != None,
                    ).count()
                    if _new_count < 50:
                        logger.info("[ML-PIPELINE] Retrain atlandı: son 45 günde (%d iş günü eşdeğeri) yalnızca %d değerlendirilmiş kayıt (min 50).",
                                    45 * 5 // 7, _new_count)
                        _should_retrain = False

                if _should_retrain:
                    # Koşul C: V9 verisi (raw_features dolu) en az 20 kayıt
                    _v9_count = _db2.query(_SS).filter(
                        _SS.raw_features != None,
                        _SS.evaluated_at != None,
                    ).count()
                    logger.info("[ML-PIPELINE] V9 özellikli kayıt sayısı: %d", _v9_count)
                    # V9 verisi az da olsa retrain engelleme — model 0.0 ile başlar
                    # 5+ V9 kaydı varsa devam et
                    if _v9_count < 5 and _new_count < 80:
                        logger.info("[ML-PIPELINE] Retrain atlandı: V9 verisi yetersiz (%d kayıt).", _v9_count)
                        _should_retrain = False
            finally:
                _db2.close()
        except Exception as _ce:
            logger.debug("[ML-PIPELINE] Retrain koşul kontrolü başarısız (devam): %s", _ce)
            _should_retrain = True  # hata durumunda normal akışa dön

        # V9 verisi yoksa V8 özellik setine geçici fallback yap
        import app.features.scoring.ml.training as _self_mod
        with _FEATURES_PATCH_LOCK:
            _orig_features = _self_mod._RETRAIN_FEATURES
            if _should_retrain and _v9_count < 50:
                _self_mod._RETRAIN_FEATURES = RETRAIN_FEATURES_V8
                logger.info(
                    "[ML-PIPELINE] V9 verisi yetersiz (%d kayıt) — V8 özellik seti kullanılıyor (%d özellik).",
                    _v9_count, len(RETRAIN_FEATURES_V8),
                )
            try:
                retrain_result = run_full_retrain() if _should_retrain else {"skipped": True, "reason": "conditions_not_met"}
            finally:
                _self_mod._RETRAIN_FEATURES = _orig_features
        retrain_note = ""
        if retrain_result.get("ok"):
            retrain_note = (
                f" | Base model yenilendi: "
                f"log_loss={retrain_result['val_log_loss']:.4f} "
                f"acc={retrain_result['val_accuracy']:.3f}"
            )
        elif retrain_result.get("skipped"):
            retrain_note = f" | Retrain koşulları karşılanmadı: {retrain_result.get('reason', '')}"
        elif "error" in retrain_result:
            retrain_note = f" | Retrain reddedildi: {retrain_result['error'][:80]}"

        both_failed = bool(calib_warn) and bool("error" in retrain_result)
        if both_failed:
            msg = f"{calib_warn}{retrain_note}"
            logger.warning(f"[ML-TRAIN] {msg}")
            record_task_end(log_id, "error", msg)
            try:
                from app.core.notifier import send_alert
                send_alert("ML Pipeline: Kalibrasyon + Retrain Başarısız", msg[:500], level="warning")
            except Exception:
                pass
        else:
            rmse_val = global_r.get("rmse")
            rmse_str = f"{rmse_val:.4f}" if isinstance(rmse_val, float) else "n/a"
            msg = (
                f"Isotonic: {'WARN' if calib_warn else 'OK'} (rmse={rmse_str}). "
                f"Profil: {len(trained)} OK, {len(failed)} FAIL."
                f"{retrain_note}"
            )
            logger.info(f"[ML-TRAIN] {msg}")
            record_task_end(log_id, "success", msg)

    except Exception as e:
        error_msg = f"ML PIPELINE CRITICAL FAULT: {str(e)}"
        logger.error(error_msg, exc_info=True)
        record_task_end(log_id, "error", error_msg)
        try:
            from app.core.notifier import send_alert
            send_alert("🚨 ML Pipeline Kritik Hata", str(e)[:500], level="critical")
        except Exception:
            pass

    finally:
        if lock_db is not None:
            release_ml_lock(lock_db)
            lock_db.close()
