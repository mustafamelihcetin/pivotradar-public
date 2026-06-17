# backend/tests/test_ml_feature_parity.py
"""
Training-Inference feature parity guard.

RETRAIN_FEATURES (training pipeline) ile FEATURES_V2 (inference pipeline)
aynı feature setini kullanmalı. Ayrışırsa model tahminleri güvenilmez olur:
8 feature eğitimde öğrenilir ama inference'da her zaman 0.0 gelir.

Bu test FAZ 1.1 (feature mismatch fix) tamamlanana kadar xfail olarak işaretlidir.
Düzeltme yapılınca @pytest.mark.xfail kaldırılır ve CI'da hard blocker olur.
"""
def test_training_inference_feature_parity():
    """Training ve inference feature listelerinin birebir eşleşmesi gerekir."""
    from app.features.scoring.ml.constants import RETRAIN_FEATURES
    from app.features.scoring.ml.ml_features_v2 import FEATURES_V2

    inference_names = set(FEATURES_V2)
    training_names  = set(RETRAIN_FEATURES)

    missing_in_inference = training_names - inference_names
    extra_in_inference   = inference_names - training_names

    assert not missing_in_inference, (
        f"Bu feature'lar eğitimde var ama inference'da yok (her zaman 0.0 gelir): "
        f"{sorted(missing_in_inference)}"
    )
    assert not extra_in_inference, (
        f"Bu feature'lar inference'da var ama eğitimde yok (model bunları hiç öğrenmedi): "
        f"{sorted(extra_in_inference)}"
    )


def test_retrain_features_not_empty():
    """RETRAIN_FEATURES listesi boş olmamalı."""
    from app.features.scoring.ml.constants import RETRAIN_FEATURES
    assert len(RETRAIN_FEATURES) > 0, "RETRAIN_FEATURES boş!"


def test_feature_schema_version_is_int():
    """FEATURE_SCHEMA_VERSION integer olmalı ve pozitif olmalı."""
    from app.features.scoring.ml.constants import FEATURE_SCHEMA_VERSION
    assert isinstance(FEATURE_SCHEMA_VERSION, int)
    assert FEATURE_SCHEMA_VERSION > 0


def test_max_val_log_loss_below_random():
    """MAX_VAL_LOG_LOSS, random binary classifier log-loss'unun (0.693) altında olmalı."""
    from app.features.scoring.ml.constants import MAX_VAL_LOG_LOSS
    assert MAX_VAL_LOG_LOSS < 0.693, (
        f"MAX_VAL_LOG_LOSS={MAX_VAL_LOG_LOSS} random classifier (0.693) eşiğini geçiyor — "
        "bozuk model kabul edilebilir hale gelir."
    )


def test_min_val_auc_above_random():
    """MIN_VAL_AUC, random classifier AUC'sunun (0.50) üzerinde olmalı."""
    from app.features.scoring.ml.constants import MIN_VAL_AUC
    assert MIN_VAL_AUC > 0.50, (
        f"MIN_VAL_AUC={MIN_VAL_AUC} <= 0.50 — random'dan daha kötü model kabul edilebilir."
    )
