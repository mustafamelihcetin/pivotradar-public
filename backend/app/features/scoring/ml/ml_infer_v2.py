# app/features/scoring/ml/ml_infer_v2.py
from __future__ import annotations
import logging
from typing import Optional
import joblib
import pandas as pd
from app.features.scoring.ml.ml_features_v2 import build_features_v3
from app.features.scoring.ml.constants import FEATURES_HASH

logger = logging.getLogger(__name__)

class MLInferV2:
    def __init__(self, model_path: str):
        bundle = joblib.load(model_path)
        if bundle.get("schema") != "ML_V2":
            raise ValueError("Model bundle is not ML_V2")
        self.features = bundle["features"]
        self.model = bundle["model"]
        # Verify feature hash if stored in bundle
        stored_hash = bundle.get("features_hash")
        if stored_hash and stored_hash != FEATURES_HASH:
            logger.critical(
                "Feature hash mismatch! Model=%s code=%s — model was trained on a different feature set. "
                "Falling back to rules-only scoring is recommended.",
                stored_hash, FEATURES_HASH,
            )
        self.features_hash_ok = (stored_hash is None) or (stored_hash == FEATURES_HASH)

    def score_last(self, ohlcv: pd.DataFrame, indicators: Optional[dict] = None) -> float:
        if not self.features_hash_ok:
            return float("nan")
        X = build_features_v3(ohlcv, indicators=indicators)
        X = X.dropna()
        if X.empty:
            return float("nan")
        avail = [f for f in self.features if f in X.columns]
        x_last = X.iloc[[-1]][avail].values if avail else X.iloc[[-1]].values
        p = float(self.model.predict_proba(x_last)[0, 1])
        return max(0.0, min(100.0, p * 100.0))
