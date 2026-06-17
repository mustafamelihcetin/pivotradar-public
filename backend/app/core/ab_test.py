# backend/app/core/ab_test.py
"""
A-5: ML Model A/B testi — shadow model %10 trafik testi.

Shadow model prod model yerini korurken %10 isteğe yanıt verir.
Her 200 hit'ten sonra karşılaştırma logu yazar; kalite iyi ise (val_log_loss < prod)
admin'e otomatik terfi bildirimi gönderilir.

Kullanım (engine pipeline):
    from app.core.ab_test import maybe_shadow_score
    shadow_result = maybe_shadow_score(ml_feats)  # None veya float
"""
from __future__ import annotations

import json
import logging
import os
import random
import threading
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("PivotRadar.ABTest")

_SHADOW_RATIO   = 0.10   # %10 trafik shadow'a gider
_PROMOTE_HITS   = 200    # Bu kadar hit'ten sonra karşılaştır + terfi kararı ver
# Absolute path: bu dosya /app/backend/app/core/ab_test.py → 2 üst = /app/backend
_MODEL_DIR      = Path(os.getenv("MODEL_DIR", str(Path(__file__).parents[2] / "models")))

_lock            = threading.Lock()
_shadow_scorer   = None
_shadow_meta: Dict[str, Any] = {}
_shadow_hits     = 0
_shadow_score_sum = 0.0


def _load_shadow() -> None:
    global _shadow_scorer, _shadow_meta, _shadow_hits
    shadow_path = _MODEL_DIR / "ml_shadow.joblib"
    shadow_meta_path = _MODEL_DIR / "ml_shadow.joblib.meta.json"
    if not shadow_path.exists():
        _shadow_scorer = None
        return
    try:
        from app.features.scoring.ml.ai_score import MLScorer
        _shadow_scorer = MLScorer(str(shadow_path))
        if shadow_meta_path.exists():
            _shadow_meta = json.loads(shadow_meta_path.read_text("utf-8"))
        _shadow_hits = int(_shadow_meta.get("shadow_hits", 0))
        logger.info("[ABTest] Shadow model yüklendi: %s", shadow_path.name)
    except Exception as _e:
        logger.warning("[ABTest] Shadow model yüklenemedi: %s", _e)
        _shadow_scorer = None


def _maybe_promote() -> None:
    """Shadow hit sayısı PROMOTE_HITS'e ulaştığında kalite karşılaştır ve terfi et."""
    shadow_meta_path = _MODEL_DIR / "ml_shadow.joblib.meta.json"
    prod_meta_path   = _MODEL_DIR / "ml_latest.joblib.meta.json"
    shadow_path      = _MODEL_DIR / "ml_shadow.joblib"
    prod_path        = _MODEL_DIR / "ml_latest.joblib"

    try:
        shadow_ll  = float(_shadow_meta.get("val_log_loss", 999))
        shadow_auc = float(_shadow_meta.get("val_auc",      0.0))
        prod_ll    = 999.0
        prod_auc   = 0.0
        if prod_meta_path.exists():
            prod_meta  = json.loads(prod_meta_path.read_text("utf-8"))
            prod_ll    = float(prod_meta.get("val_log_loss", 999))
            prod_auc   = float(prod_meta.get("val_auc",      0.0))

        # Terfi kriteri: log_loss iyileşmeli VE AUC en fazla 0.01 gerilemeli
        # Sadece log_loss'a bakmak AUC'yu feda eden modellerı terfi ettirebilirdi.
        auc_ok      = (shadow_auc >= prod_auc - 0.01) or prod_auc == 0.0
        should_promote = shadow_ll < prod_ll and auc_ok

        if should_promote:
            import shutil
            shutil.copy2(str(shadow_path), str(prod_path))
            logger.info(
                "[ABTest] ✅ Shadow model prod'a terfi etti: "
                "shadow_ll=%.4f < prod_ll=%.4f | shadow_auc=%.4f ≥ prod_auc-0.01=%.4f",
                shadow_ll, prod_ll, shadow_auc, prod_auc - 0.01,
            )
            # Notifier ile admin'e bildir
            try:
                from app.core.notifier import send_alert
                send_alert(
                    "✅ Shadow Model Prod'a Terfi Etti",
                    f"shadow_log_loss={shadow_ll:.4f} < prod_log_loss={prod_ll:.4f}\n"
                    f"Yeni model otomatik üretime alındı.",
                    level="info",
                )
            except Exception:
                pass
            # Shadow dosyasını temizle
            try:
                shadow_path.unlink(missing_ok=True)
                (shadow_path.with_suffix(".joblib.meta.json")).unlink(missing_ok=True)
            except Exception:
                pass
        else:
            reason = "log_loss iyileşmedi" if shadow_ll >= prod_ll else "AUC gerilemesi fazla"
            logger.info(
                "[ABTest] Shadow model prod'u geçemedi (%s: shadow_ll=%.4f/auc=%.4f, prod_ll=%.4f/auc=%.4f) — shadow silindi.",
                reason, shadow_ll, shadow_auc, prod_ll, prod_auc,
            )
            try:
                shadow_path.unlink(missing_ok=True)
                (shadow_meta_path).unlink(missing_ok=True)
            except Exception:
                pass

    except Exception as _e:
        logger.warning("[ABTest] Terfi karşılaştırması başarısız: %s", _e)


def maybe_shadow_score(ml_feats: Dict[str, Any]) -> Optional[float]:
    """
    %SHADOW_RATIO olasılıkla shadow model ile skor hesaplar.
    Shadow model yoksa veya seçilmezse None döner.

    Engine pipeline'da: prod skor yerine kullanılmaz, sadece paralel log tutulur.
    """
    global _shadow_scorer, _shadow_hits, _shadow_score_sum

    if random.random() > _SHADOW_RATIO:
        return None

    with _lock:
        if _shadow_scorer is None:
            _load_shadow()
        if _shadow_scorer is None:
            return None

        try:
            shadow_result = _shadow_scorer.score(ml_feats)
            _shadow_hits += 1

            if _shadow_hits >= _PROMOTE_HITS:
                # Terfi kontrolü — background thread'de yap
                t = threading.Thread(target=_maybe_promote, daemon=True, name="ab-promote")
                t.start()
                _shadow_scorer = None   # yeniden yüklenecek
                _shadow_hits   = 0

            return float(shadow_result)
        except Exception as _e:
            logger.debug("[ABTest] Shadow score hatası: %s", _e)
            return None
