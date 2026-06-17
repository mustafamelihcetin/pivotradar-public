# backend/app/features/scoring/ml/feature_monitor.py
"""
Feature drift monitoring — her retrain sonrası ve kalibrasyon döngüsünde çağrılır.

Amaç:
  - Feature dağılımının zaman içinde kaymasını (drift) erken tespit et.
  - ML score dağılımının overconfident/dejenere hale geldiğini yakala.
  - Tüm bulgular log'a yazılır; action almak insanda (uyarı → inceleme → retrain).

Kullanım:
    from app.features.scoring.ml.feature_monitor import run_feature_monitor
    run_feature_monitor()  # kalibrasyon pipeline sonunda çağır
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger("PivotRadar.FeatureMonitor")

# ── Baz istatistikler (ilk retrain sonrası kaydedilir) ───────────────────────
_BASELINE_PATH = Path(os.getenv("MODEL_DIR", "models")) / "feature_baseline.json"

# Önemli feature'lar ve beklenen sağlıklı aralıkları
_FEATURE_HEALTHY_RANGES: Dict[str, tuple] = {
    "rsi14_x":          (20.0,  80.0),
    "vol_ratio20":      (0.3,   5.0),
    "atr_pct":          (0.5,   8.0),
    "ema20_gap":        (-0.15, 0.15),
    "ema50_gap":        (-0.20, 0.20),
    "w52_position":     (0.0,   1.0),
    "bb_width_pct":     (1.0,   20.0),
    "adx14":            (5.0,   60.0),
    "stoch_k":          (0.0,   100.0),
    "macd_hist":        (-5.0,  5.0),
}

# Drift eşiği: ortalama önceki baseline'a göre bu kadar std'den fazla değişirse uyar
_DRIFT_STD_THRESHOLD = 2.0

# ML skor sağlık eşikleri
_SCORE_MEDIAN_MAX = 87.0   # medyan bu değerin üstündeyse overconfident
_SCORE_SPREAD_MIN = 8.0    # p90-p10 bu değerin altındaysa ayrıştırmıyor


def _compute_stats(values: np.ndarray) -> Dict[str, float]:
    """Bir feature dizisi için temel istatistikler."""
    if len(values) == 0:
        return {}
    finite = values[np.isfinite(values)]
    if len(finite) == 0:
        return {"n": 0}
    return {
        "n":    int(len(finite)),
        "mean": round(float(np.mean(finite)), 4),
        "std":  round(float(np.std(finite)),  4),
        "p10":  round(float(np.percentile(finite, 10)), 4),
        "p50":  round(float(np.percentile(finite, 50)), 4),
        "p90":  round(float(np.percentile(finite, 90)), 4),
    }


def _load_baseline() -> Optional[Dict[str, Any]]:
    try:
        if _BASELINE_PATH.exists():
            return json.loads(_BASELINE_PATH.read_text("utf-8"))
    except Exception:
        pass
    return None


def _save_baseline(stats: Dict[str, Any]) -> None:
    try:
        _BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _BASELINE_PATH.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.debug("[FeatureMonitor] Baseline kaydedilemedi: %s", e)


def check_score_distribution(ml_scores: List[float]) -> Dict[str, Any]:
    """
    Canlı ML skor dağılımını kontrol eder.
    Overconfidence ve ayrıştırma kaybı tespiti.
    """
    if not ml_scores:
        return {"ok": True, "n": 0}
    arr = np.array(ml_scores, dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return {"ok": True, "n": 0}

    p10  = float(np.percentile(arr, 10))
    p50  = float(np.percentile(arr, 50))
    p90  = float(np.percentile(arr, 90))
    spread = p90 - p10
    warnings = []

    if p50 > _SCORE_MEDIAN_MAX:
        warnings.append(
            f"Medyan skor çok yüksek: {p50:.1f} > {_SCORE_MEDIAN_MAX} — "
            "model overconfident, kalibrasyon veya veri dengesi incelenmeli."
        )
    if spread < _SCORE_SPREAD_MIN:
        warnings.append(
            f"Skor yayılımı dar: p90-p10={spread:.1f} < {_SCORE_SPREAD_MIN} — "
            "model yeterince ayrıştırmıyor, dead zone olabilir."
        )

    result = {"ok": len(warnings) == 0, "n": int(len(arr)),
              "p10": round(p10, 1), "p50": round(p50, 1), "p90": round(p90, 1),
              "spread": round(spread, 1), "warnings": warnings}

    if warnings:
        for w in warnings:
            logger.warning("[FeatureMonitor] ⚠️ %s", w)
    else:
        logger.info("[FeatureMonitor] ML skor dağılımı sağlıklı: p10=%.1f p50=%.1f p90=%.1f spread=%.1f",
                    p10, p50, p90, spread)
    return result


def check_feature_drift(current_stats: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    """
    Mevcut feature istatistiklerini baseline ile karşılaştırır.
    Drift tespit edilen feature'ları listeler.
    """
    baseline = _load_baseline()
    if baseline is None:
        logger.info("[FeatureMonitor] Baseline yok — mevcut istatistikler kaydediliyor.")
        _save_baseline(current_stats)
        return {"ok": True, "drifted": [], "first_run": True}

    drifted = []
    for fname, cur in current_stats.items():
        if fname not in baseline:
            continue
        base = baseline[fname]
        base_std = float(base.get("std", 0))
        if base_std < 1e-6:
            continue
        base_mean = float(base.get("mean", 0))
        cur_mean  = float(cur.get("mean", base_mean))
        z = abs(cur_mean - base_mean) / base_std
        if z > _DRIFT_STD_THRESHOLD:
            drifted.append({"feature": fname, "z_score": round(z, 2),
                            "base_mean": round(base_mean, 4), "cur_mean": round(cur_mean, 4)})
            logger.warning(
                "[FeatureMonitor] ⚠️ Feature drift: %s | z=%.2f | base_mean=%.4f → cur_mean=%.4f",
                fname, z, base_mean, cur_mean,
            )

    if not drifted:
        logger.info("[FeatureMonitor] Feature drift yok (%d feature kontrol edildi).", len(current_stats))
    else:
        logger.warning("[FeatureMonitor] %d feature drift tespit edildi: %s",
                       len(drifted), [d["feature"] for d in drifted])

    # Baseline'ı güncelle (exponential moving average — eski bilgiyi çok hızlı silme)
    try:
        alpha = 0.2  # %20 yeni, %80 eski
        updated = {}
        for fname, cur in current_stats.items():
            if fname in baseline:
                base = baseline[fname]
                updated[fname] = {
                    k: round(alpha * cur.get(k, base.get(k, 0)) + (1 - alpha) * base.get(k, 0), 4)
                    for k in ("mean", "std", "p10", "p50", "p90")
                }
                updated[fname]["n"] = cur.get("n", base.get("n", 0))
            else:
                updated[fname] = cur
        _save_baseline(updated)
    except Exception as e:
        logger.debug("[FeatureMonitor] Baseline güncellenemedi: %s", e)

    return {"ok": len(drifted) == 0, "drifted": drifted}


def run_feature_monitor() -> Dict[str, Any]:
    """
    Tam monitoring döngüsü: DB'den son scan sonuçlarını çek,
    skor dağılımı + feature drift kontrolü yap.
    """
    try:
        from app.core.database import SessionLocal
        from app.features.scanner.models import ScanScore
        import datetime as dt
        from app.core.time_utils import now_utc

        db = SessionLocal()
        try:
            cutoff = now_utc().replace(tzinfo=None) - dt.timedelta(days=7)
            rows = db.query(
                ScanScore.ml_score,
                ScanScore.rsi,
                ScanScore.volume_ratio,
                ScanScore.atr_percent,
                ScanScore.ema20_gap,
                ScanScore.ema50_gap,
                ScanScore.w52_position,
                ScanScore.raw_features,
            ).filter(
                ScanScore.scanned_at >= cutoff,
                ScanScore.ml_score != None,
            ).limit(2000).all()
        finally:
            db.close()

        if not rows:
            logger.info("[FeatureMonitor] Son 7 gün içinde scan verisi yok.")
            return {"ok": True, "n": 0}

        # ML skor dağılımı
        ml_scores = [float(r.ml_score) for r in rows if r.ml_score is not None]
        score_result = check_score_distribution(ml_scores)

        # Feature istatistikleri
        feature_data: Dict[str, List[float]] = {
            "rsi14_x":     [float(r.rsi)          for r in rows if r.rsi          is not None],
            "vol_ratio20": [float(r.volume_ratio)  for r in rows if r.volume_ratio is not None],
            "atr_pct":     [float(r.atr_percent)   for r in rows if r.atr_percent  is not None],
            "ema20_gap":   [float(r.ema20_gap)     for r in rows if r.ema20_gap    is not None],
            "ema50_gap":   [float(r.ema50_gap)     for r in rows if r.ema50_gap    is not None],
            "w52_position":[float(r.w52_position)  for r in rows if r.w52_position is not None],
        }

        # V9 feature'lar raw_features JSON'dan
        for key in ("bb_width_pct", "adx14", "stoch_k", "macd_hist", "squeeze_kc"):
            vals = []
            for r in rows:
                try:
                    if r.raw_features:
                        d = json.loads(r.raw_features)
                        if key in d and d[key] is not None:
                            vals.append(float(d[key]))
                except Exception:
                    pass
            if vals:
                feature_data[key] = vals

        current_stats = {k: _compute_stats(np.array(v)) for k, v in feature_data.items() if v}
        drift_result  = check_feature_drift(current_stats)

        return {
            "ok":    score_result["ok"] and drift_result["ok"],
            "n":     len(rows),
            "score": score_result,
            "drift": drift_result,
        }

    except Exception as e:
        logger.warning("[FeatureMonitor] Monitoring çalıştırılamadı: %s", e)
        return {"ok": True, "error": str(e)}
