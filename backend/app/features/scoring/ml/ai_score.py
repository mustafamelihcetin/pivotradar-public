from __future__ import annotations
import os, json, re, sys, types, hashlib, time, logging
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
import warnings

logger = logging.getLogger(__name__)

# --- Windows/loky gürültü bastırma: env seviyesinde ---
os.environ.setdefault("JOBLIB_MULTIPROCESSING", "0")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))
os.environ.setdefault("JOBLIB_START_METHOD", "spawn")

warnings.filterwarnings(
    "ignore",
    message="Could not find the number of physical cores",
    module=r"joblib\.externals\.loky\.backend\.context"
)
warnings.filterwarnings(
    "ignore",
    message="X does not have valid feature names, but",
    category=UserWarning
)
warnings.filterwarnings(
    "ignore",
    message="X has feature names, but",
    category=UserWarning
)

from .ai_settings import (
    ML_MODEL_PATH, ML_CALIBRATED,
    LLM_ENABLED, LLM_MODEL, LLM_CTX, LLM_MAX_TOK, LLM_TEMP, LLM_TOP_P,
    W_RULE, W_ML, W_LLM
)

# ===== Exceptions =====
class ModelLoadError(RuntimeError): ...
class MetaNotFoundError(RuntimeError): ...
class MultipleMetaError(RuntimeError): ...
class FeatureError(RuntimeError): ...
class LLMError(RuntimeError): ...

# ===== Eğitim ortamı uyumluluk şimleri =====
def _install_compat_shims():
    if "utils" not in sys.modules:
        pkg = types.ModuleType("utils")
        pkg.__path__ = []
        sys.modules["utils"] = pkg
    else:
        if not hasattr(sys.modules["utils"], "__path__"):
            sys.modules["utils"].__path__ = []

    if "utils.blend" not in sys.modules:
        sub = types.ModuleType("utils.blend")
        sys.modules["utils.blend"] = sub
    else:
        sub = sys.modules["utils.blend"]

    class DWBlender:  # noqa: N801
        def __init__(self, *args, **kwargs):
            pass
        def get_params(self, deep: bool = True):
            return getattr(self, "__dict__", {}).copy()
        def set_params(self, **params):
            for k, v in params.items():
                setattr(self, k, v)
            return self
        def _single_delegate(self):
            for name in ("model_", "estimator_", "clf_", "final_estimator_", "base_estimator_"):
                if hasattr(self, name):
                    return getattr(self, name)
            return None
        def _iter_estimators_weights(self):
            ests = getattr(self, "estimators_", None)
            w    = getattr(self, "weights_", None)
            if ests is None and hasattr(self, "models_"):
                ests = getattr(self, "models_")
            if ests is None:
                return None, None
            if w is None:
                w = np.ones(len(ests), dtype=float)
            w = np.asarray(w, dtype=float)
            if w.sum() == 0:
                w = np.ones(len(ests), dtype=float)
            return ests, w / w.sum()
        def predict_proba(self, X):
            d = self._single_delegate()
            if d is not None and hasattr(d, "predict_proba"):
                return d.predict_proba(X)
            ests, w = self._iter_estimators_weights()
            if ests is not None:
                probs = None
                for i, est in enumerate(ests):
                    if hasattr(est, "predict_proba"):
                        p = est.predict_proba(X)
                    elif hasattr(est, "decision_function"):
                        z = est.decision_function(X)
                        if len(np.shape(z)) == 1:
                            p1 = 1.0 / (1.0 + np.exp(-z))
                            p  = np.vstack([1 - p1, p1]).T
                        else:
                            z = np.asarray(z, dtype=float)
                            z = z - z.max(axis=1, keepdims=True)
                            e = np.exp(z)
                            p = e / e.sum(axis=1, keepdims=True)
                    else:
                        raise RuntimeError("Alt estimator predict_proba/decision_function sağlamıyor.")
                    probs = p * w[i] if probs is None else probs + p * w[i]
                return probs
            raise RuntimeError(
                "DWBlender: Alt estimator(lar) bulunamadı. Beklenen alanlardan hiçbiri yok: "
                "[model_, estimator_, clf_, final_estimator_, base_estimator_, estimators_/models_ + weights_]. "
                f"Mevcut alanlar: {sorted(list(getattr(self, '__dict__', {}).keys()))}"
            )
        def decision_function(self, X):
            if hasattr(self, "predict_proba"):
                p = self.predict_proba(X)
                if p is None:
                    raise RuntimeError("DWBlender: decision_function için olasılık üretilemedi.")
                if p.shape[1] == 2:
                    p1 = np.clip(p[:, 1], 1e-8, 1 - 1e-8)
                    return np.log(p1 / (1 - p1))
                return np.max(p, axis=1)
            d = self._single_delegate()
            if d is not None and hasattr(d, "decision_function"):
                return d.decision_function(X)
            raise RuntimeError("DWBlender: decision_function bulunamadı.")
    sub.DWBlender = DWBlender

# ===== Meta çözüm =====
def _models_dir(path: str) -> str:
    return os.path.dirname(os.path.abspath(path))

def _find_single_meta(models_dir: str) -> Optional[str]:
    metas = [f for f in os.listdir(models_dir) if f.endswith(".joblib.meta.json")]
    if len(metas) == 1:
        return os.path.join(models_dir, metas[0])
    if len(metas) == 0:
        return None
    raise MultipleMetaError(
        "Birden fazla *.joblib.meta.json bulundu. Doğru meta dosyasını model ile aynı adla koyun "
        "(ör: ml_latest.joblib.meta.json)."
    )

def _resolve_meta_path(joblib_path: str) -> Optional[str]:
    exact = joblib_path + ".meta.json"
    if os.path.exists(exact):
        return exact
    return _find_single_meta(_models_dir(joblib_path))

def _extract_feature_names_from_meta(meta: Dict[str, Any]) -> Optional[List[str]]:
    for key in ("feature_names", "features", "feature_list", "columns", "cols", "X_columns"):
        v = meta.get(key)
        if isinstance(v, list) and v:
            return [str(x) for x in v]
    return None

def _extract_feature_names_from_model(model) -> Optional[List[str]]:
    if hasattr(model, "feature_names_in_"):
        try:
            return [str(x) for x in list(model.feature_names_in_)]
        except Exception:
            pass
    try:
        steps = getattr(model, "named_steps", None)
        if steps and "preprocess" in steps:
            pp = steps["preprocess"]
            if hasattr(pp, "get_feature_names_out"):
                out = pp.get_feature_names_out()
                if out is not None and len(out) > 0:
                    return [str(x) for x in list(out)]
    except Exception:
        pass
    for attr in ("estimator", "base_estimator"):
        est = getattr(model, attr, None)
        if est is not None and hasattr(est, "feature_names_in_"):
            try:
                return [str(x) for x in list(est.feature_names_in_)]
            except Exception:
                pass
    return None

# ===== yardımcı: estimator unwrap =====
def _unwrap_estimator(obj) -> Any:
    # 1. Dictionary unwrapping
    if isinstance(obj, dict):
        for k in ("model", "estimator", "clf"):
            if k in obj:
                return _unwrap_estimator(obj[k])
        if len(obj) == 1:
            return _unwrap_estimator(list(obj.values())[0])

    # 2. Pipeline / Intelligent Wrapper Preservation (P0 FIX - V12)
    # MUST NOT UNWRAP Pipelines OR we lose StandardScalers/Normalization.
    if hasattr(obj, "steps") and hasattr(obj, "predict_proba"):
        return obj

    # 3. Project-specific blender preservation
    if type(obj).__name__ == "DWBlender" or hasattr(obj, "daily_model") or hasattr(obj, "_models"):
        return obj

    # 4. Search wrappers (GridSearchCV etc.)
    for attr in ("best_estimator_", "best_estimator", "best_model_"):
        if hasattr(obj, attr):
            return _unwrap_estimator(getattr(obj, attr))

    # 5. Generic lazy wrappers
    # WARNING: Be careful here. Some models (like HGB) have internal 'model_' attrs.
    if not (hasattr(obj, "predict_proba") or hasattr(obj, "predict")): 
        for attr in ("model_", "estimator_", "clf_", "final_estimator_", "base_estimator_", "model", "estimator", "clf"):
            if hasattr(obj, attr):
                inner = getattr(obj, attr)
                if inner is not None:
                    return _unwrap_estimator(inner)
    
    return obj


# ===== ML Scorer =====
class MLScorer:
    def __init__(self, joblib_file_or_env: Optional[str] = None):
        # LOUD LOG to verify code is live in Docker (V12)
        logger.info("!!! PIVOTRADAR ML SCORER V12 (TEMELDEN FIX) IS LIVE !!!")
        joblib_path = joblib_file_or_env
        if joblib_path and not os.path.isabs(joblib_path):
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            joblib_path = os.path.join(root, "assets", "models", joblib_path)
        self.joblib_path = joblib_path or ML_MODEL_PATH
        if not os.path.exists(self.joblib_path):
            raise ModelLoadError(f"ML modeli bulunamadı: {self.joblib_path}")

        meta_path = _resolve_meta_path(self.joblib_path)
        self.feature_names: Optional[List[str]] = None
        self.meta: Dict[str, Any] = {}
        if meta_path:
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.meta = json.load(f)
            except Exception as e:
                raise ModelLoadError(f"Meta okunamadı: {meta_path} - {e}") from e
            self.feature_names = _extract_feature_names_from_meta(self.meta)

        _install_compat_shims()

        try:
            import joblib  # local import
            try:
                import joblib.externals.loky.backend.context as _loky_ctx  # type: ignore
                def _safe_count_physical_cores():
                    try:
                        c = os.cpu_count() or 1
                        return (int(c), None)
                    except Exception as e:
                        return (1, e)
                _loky_ctx._count_physical_cores = _safe_count_physical_cores  # type: ignore[attr-defined]
            except Exception:
                pass
            loaded = joblib.load(self.joblib_path)
        except Exception as e:
            raise ModelLoadError(f"ML modeli yüklenemedi: {self.joblib_path} - {e}") from e

        self.model = _unwrap_estimator(loaded)
        
        # Freshness Tracking (P0 - Real Fix for Stale Models)
        self.mtime = os.path.getmtime(self.joblib_path)
        self.age_days = (time.time() - self.mtime) / 86400.0

        if not self.feature_names:
            self.feature_names = _extract_feature_names_from_model(self.model)

        if not self.feature_names:
            raise ModelLoadError(
                "Meta geçersiz: 'feature_names' yok/boş ve modelden çıkarılamadı.\n"
                "Çözüm: Eğitimde kullanılan sırayla bir meta oluşturup, modele bitişik koyun (örn. ml_latest.joblib.meta.json):\n"
                '{ "feature_names": ["open","high","low","close","volume", "..."] }'
            )

        # Feature schema version guard
        try:
            from app.features.scoring.ml.constants import FEATURE_SCHEMA_VERSION
            model_schema_ver = self.meta.get("feature_schema_version")
            if model_schema_ver is not None and model_schema_ver != FEATURE_SCHEMA_VERSION:
                logger.warning(
                    "[MLScorer] Schema version mismatch: model=%s current=%s — model may be stale, retrain recommended.",
                    model_schema_ver, FEATURE_SCHEMA_VERSION,
                )
        except Exception:
            pass

    def _vectorize(self, row_dict: Dict[str, Any]) -> "pd.DataFrame":
        assert self.feature_names is not None
        vec: List[float] = []
        for name in self.feature_names:
            # Model input'u her zaman sabit uzunlukta olmalı.
            # Eksik/bozuk feature'ları 0.0 ile dolduruyoruz (robust inference).
            if name not in row_dict:
                vec.append(0.0)
                continue
            obj = row_dict[name]
            # pandas.Series tek elemanlı olabiliyor; float(Series) FutureWarning veriyor.
            if isinstance(obj, pd.Series):
                obj = obj.iloc[0]
            try:
                v = float(obj)
            except Exception:
                v = 0.0
            if not np.isfinite(v):
                v = 0.0
            vec.append(v)
        X_df = pd.DataFrame([vec], columns=list(self.feature_names))
        return X_df

    @staticmethod
    def _to_prob_from_predict(yhat: np.ndarray) -> float:
        if yhat.ndim == 2 and yhat.shape[1] == 1:
            yhat = yhat.ravel()
        if yhat.size != 1:
            raise ModelLoadError(f"predict çıktı boyutu beklenmedik: {yhat.shape}")
        v = float(yhat[0])

        if v in (0, 1) or v in (0.0, 1.0):
            return float(v)
        if 0.0 <= v <= 1.0:
            return float(v)
        if 0.0 <= v <= 100.0:
            return float(v / 100.0)

        raise ModelLoadError(
            "Model sadece 'predict' sağlıyor ve çıktı aralığı olasılığa çevrilemedi. "
            "Lütfen modeli 'predict_proba' veya 'decision_function' destekleyecek şekilde "
            "kalibre edin ya da [0,1]/[0,100]/{0,1} aralığında skor döndürecek şekilde export edin."
        )

    def _prepare_X_for_estimator(self, est, X_df: pd.DataFrame):
        if hasattr(est, "feature_names_in_"):
            cols = list(est.feature_names_in_)
            missing = [c for c in cols if c not in X_df.columns]
            if missing:
                raise FeatureError(f"Estimator feature_names_in_ kolonları eksik: {missing}")
            return X_df[cols]
        return X_df.to_numpy(dtype=float)

    def _prob_from_estimator(self, est, X_df: pd.DataFrame) -> float:
        X_in = self._prepare_X_for_estimator(est, X_df)

        if hasattr(est, "predict_proba"):
            p = float(est.predict_proba(X_in)[0, -1])
            return float(np.clip(p, 0.0, 1.0))

        if hasattr(est, "decision_function"):
            z = float(est.decision_function(X_in)[0])
            p = 1.0 / (1.0 + np.exp(-z))
            return float(np.clip(p, 0.0, 1.0))

        if hasattr(est, "predict"):
            yhat = est.predict(X_in)
            try:
                p = self._to_prob_from_predict(np.asarray(yhat))
                return float(np.clip(p, 0.0, 1.0))
            except ModelLoadError:
                if ML_CALIBRATED:
                    v = float(np.asarray(yhat).ravel()[0])
                    p = 1.0 / (1.0 + np.exp(-v))
                    return float(np.clip(p, 0.0, 1.0))
                raise

        raise ModelLoadError("Alt estimator 'predict_proba'/'decision_function'/'predict' sunmuyor.")

    def _score_with_composite(self, row_dict: Dict[str, Any]) -> float:
        m = self.model
        if not (hasattr(m, "daily_model") and hasattr(m, "weekly_model") and hasattr(m, "meta_model")):
            raise ModelLoadError("Composite yol bekleniyordu ancak model alanları bulunamadı.")

        daily_cols = getattr(m, "daily_cols", None)
        weekly_cols = getattr(m, "weekly_cols", None)

        feat_map: Dict[str, float] = {}
        for k in (self.feature_names or []):
            if k in row_dict:
                try:
                    feat_map[k] = float(row_dict[k])
                except Exception:
                    raise FeatureError(f"Özellik sayı değil: '{k}'='{row_dict[k]}'")

        if daily_cols is None or weekly_cols is None:
            daily_cols = [c for c in (self.feature_names or []) if not str(c).endswith("_w")]
            weekly_cols = [c for c in (self.feature_names or []) if str(c).endswith("_w")]

        def build_X_df(cols: List[str]) -> pd.DataFrame:
            vals: List[float] = []
            for c in cols:
                # 1. Exact/Case match
                if c in feat_map:
                    vals.append(float(feat_map[c])); continue
                lc, uc = str(c).lower(), str(c).upper()
                if lc in feat_map:
                    vals.append(float(feat_map[lc])); continue
                if uc in feat_map:
                    vals.append(float(feat_map[uc])); continue
                
                # 2. Fuzzy suffix match (e.g. model wants 'rsi' but we have 'rsi14_x')
                stem = lc.split('_')[0] if '_' in lc else lc
                match = None
                for k in feat_map.keys():
                    kl = k.lower()
                    if kl.startswith(lc) or (len(stem) > 2 and kl.startswith(stem)):
                        match = feat_map[k]
                        break
                
                if match is not None:
                    vals.append(float(match)); continue
                
                # 3. Last resort
                vals.append(0.0)
            return pd.DataFrame([vals], columns=list(cols))

        Xd_df = build_X_df(list(daily_cols))
        Xw_df = build_X_df(list(weekly_cols))

        p_d = self._prob_from_estimator(getattr(m, "daily_model"), Xd_df)
        p_w = self._prob_from_estimator(getattr(m, "weekly_model"), Xw_df)

        meta_cols = ["p_daily", "p_weekly"]
        meta_in_df = pd.DataFrame([[p_d, p_w]], columns=meta_cols)
        meta = getattr(m, "meta_model")

        try:
            p = self._prob_from_estimator(meta, meta_in_df)
        except Exception:
            p = float(np.clip(0.5 * (p_d + p_w), 0.0, 1.0))

        return float(100.0 * float(np.clip(p, 0.0, 1.0)))

    def score(self, row_dict: Dict[str, Any]) -> float:
        X_df = self._vectorize(row_dict)

        if all(hasattr(self.model, attr) for attr in ("daily_model", "weekly_model", "meta_model")):
            return self._score_with_composite(row_dict)

        if hasattr(self.model, "predict_proba"):
            X_in = self._prepare_X_for_estimator(self.model, X_df)
            p = float(self.model.predict_proba(X_in)[0, 1])
            p = max(0.0, min(1.0, p))
            return float(100.0 * p)

        if hasattr(self.model, "decision_function"):
            X_in = self._prepare_X_for_estimator(self.model, X_df)
            z = float(self.model.decision_function(X_in)[0])
            p = 1.0 / (1.0 + np.exp(-z))
            p = max(0.0, min(1.0, p))
            return float(100.0 * p)

        if hasattr(self.model, "predict"):
            X_in = self._prepare_X_for_estimator(self.model, X_df)
            yhat = self.model.predict(X_in)
            try:
                p = self._to_prob_from_predict(np.asarray(yhat))
            except ModelLoadError:
                if ML_CALIBRATED:
                    v = float(np.asarray(yhat).ravel()[0])
                    p = 1.0 / (1.0 + np.exp(-v))
                else:
                    raise
            p = max(0.0, min(1.0, p))
            return float(100.0 * p)

        raise ModelLoadError("Model 'predict_proba', 'decision_function' veya 'predict' sağlamıyor.")

    def score_with_explanation(
        self, row_dict: Dict[str, Any], top_n: int = 5
    ) -> Dict[str, Any]:
        """
        F-1: ML skoru + özellik katkı açıklaması.

        SHAP kütüphanesi varsa gerçek SHAP değerleri hesaplar.
        Yoksa MDI (feature_importances_) × değer büyüklüğü ile yaklaşım yapar.

        Döndürür:
          {
            "score": 62.4,
            "top_factors": [
              {"feature": "rsi", "value": 72.3, "contribution": 8.2, "direction": "negative"},
              ...
            ],
            "explanation_method": "shap" | "mdi_approx"
          }
        """
        ml_score = self.score(row_dict)
        X_df = self._vectorize(row_dict)
        feature_names = list(self.feature_names or [])
        top_factors: list = []
        method = "none"

        try:
            model = self.model
            X_in = self._prepare_X_for_estimator(model, X_df)
            X_arr = X_in if isinstance(X_in, np.ndarray) else X_in.to_numpy(dtype=float)

            # Gerçek SHAP değerleri (opt-in — shap paketi gerekli)
            shap_vals = None
            try:
                import shap as _shap  # noqa: PLC0415
                explainer = _shap.TreeExplainer(model)
                sv = explainer.shap_values(X_arr)
                if isinstance(sv, list):
                    sv = sv[-1]  # binary: class-1
                shap_vals = sv.ravel()
                method = "shap"
            except Exception:
                pass

            if shap_vals is None:
                # MDI feature_importances_ × |değer| yaklaşımı
                fi = getattr(model, "feature_importances_", None)
                if fi is not None and len(fi) == len(feature_names):
                    vals_arr = X_arr.ravel()
                    shap_vals = fi * vals_arr
                    method = "mdi_approx"

            if shap_vals is not None and len(shap_vals) == len(feature_names):
                pairs = sorted(
                    zip(feature_names, shap_vals, X_arr.ravel()),
                    key=lambda t: abs(t[1]),
                    reverse=True,
                )
                for feat, contrib, val in pairs[:top_n]:
                    top_factors.append({
                        "feature":     feat,
                        "value":       round(float(val), 4),
                        "contribution": round(float(contrib), 4),
                        "direction":   "positive" if contrib > 0 else "negative",
                    })

        except Exception as _ex:
            logger.debug("score_with_explanation hata: %s", _ex)

        return {
            "score":               ml_score,
            "top_factors":         top_factors,
            "explanation_method":  method,
        }

# ===== Per-Profile ML Registry =====
class PerProfileMLRegistry:
    """
    Per-profil ML model yöneticisi.
    ml_profile_{KEY}.joblib varsa kullanır, yoksa base MLScorer'a düşer.
    score() çağrısında isotonic kalibrasyonu (apply_calibration) otomatik uygular.
    score_with_explanation() her zaman base scorer üzerinden çalışır (SHAP desteği).
    """

    def __init__(self, base: MLScorer):
        self._base = base
        self._profile_cache: Dict[str, Any] = {}
        self._models_dir = os.path.dirname(base.joblib_path)

    def _load_profile_model(self, profile_key: str) -> Optional[Any]:
        if profile_key in self._profile_cache:
            return self._profile_cache[profile_key]

        p_path = os.path.join(self._models_dir, f"ml_profile_{profile_key}.joblib")
        if not os.path.exists(p_path):
            self._profile_cache[profile_key] = None
            return None

        try:
            import joblib as _jl
            _install_compat_shims()
            m = _jl.load(p_path)
            m = _unwrap_estimator(m)
            self._profile_cache[profile_key] = m
            logger.info("[PerProfileRegistry] %s modeli yüklendi: %s", profile_key, p_path)
            return m
        except Exception as exc:
            logger.warning("[PerProfileRegistry] %s yüklenemedi: %s — base kullanılacak.", profile_key, exc)
            self._profile_cache[profile_key] = None
            return None

    def _normalize_key(self, profile_name: Optional[str]) -> str:
        if not profile_name:
            return "SAFE_HARBOR"
        try:
            from app.core.config_profiles import normalize_profile
            return normalize_profile(profile_name)
        except Exception:
            return "SAFE_HARBOR"

    def score(self, row_dict: Dict[str, Any], profile_name: Optional[str] = None) -> float:
        pk = self._normalize_key(profile_name)
        p_model = self._load_profile_model(pk)

        if p_model is not None:
            # Per-profil model ile puan
            X_df = self._base._vectorize(row_dict)
            try:
                X_in = self._base._prepare_X_for_estimator(p_model, X_df)
                if hasattr(p_model, "predict_proba"):
                    prob = float(np.clip(p_model.predict_proba(X_in)[0, 1], 0.0, 1.0))
                elif hasattr(p_model, "decision_function"):
                    z = float(p_model.decision_function(X_in)[0])
                    prob = float(np.clip(1.0 / (1.0 + np.exp(-z)), 0.0, 1.0))
                else:
                    prob = float(np.clip(p_model.predict(X_in)[0], 0.0, 1.0))
                raw_score = float(100.0 * prob)
            except Exception as exc:
                logger.warning("[PerProfileRegistry] %s score hatası: %s — base'e düşüldü.", pk, exc)
                raw_score = self._base.score(row_dict)
        else:
            raw_score = self._base.score(row_dict)

        # Isotonic kalibrasyon uygula
        try:
            from app.features.scoring.ml.ml_calib import apply_calibration
            raw_score = float(apply_calibration(raw_score, pk))
        except Exception:
            pass

        return float(np.clip(raw_score, 0.0, 100.0))

    def score_with_explanation(
        self, row_dict: Dict[str, Any], top_n: int = 5
    ) -> Dict[str, Any]:
        return self._base.score_with_explanation(row_dict, top_n=top_n)

    def invalidate(self) -> None:
        self._profile_cache.clear()
        logger.info("[PerProfileRegistry] Model önbelleği temizlendi.")

    # Proxy: base scorer özelliklerine şeffaf erişim
    @property
    def feature_names(self):
        return self._base.feature_names

    @property
    def meta(self):
        return self._base.meta

    @property
    def joblib_path(self):
        return self._base.joblib_path


# ===== LLM Scorer + disk cache =====
def _cache_dir() -> str:
    base = os.path.join(os.path.expanduser("~"), ".pivotradar", "llm_cache")
    os.makedirs(base, exist_ok=True)
    return base

def _cache_path(sig: str) -> str:
    return os.path.join(_cache_dir(), f"{sig}.json")

def _make_sig(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

class LLMScorer:
    def __init__(self, gguf_file: str):
        gguf_path = gguf_file
        if gguf_path and not os.path.isabs(gguf_path):
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            gguf_path = os.path.join(root, "assets", "llm", gguf_file)
        self.gguf_path = gguf_path or LLM_MODEL
        if not os.path.exists(self.gguf_path):
            raise LLMError(f"GGUF bulunamadı: {self.gguf_path}")
        try:
            from llama_cpp import Llama  # type: ignore
            self.llm = Llama(model_path=self.gguf_path, n_ctx=int(LLM_CTX), logits_all=False, verbose=False)
        except Exception as e:
            raise LLMError(f"'llama-cpp-python' import edilemedi veya başlatılamadı: {e}") from e

    def score(self, summary_json: Dict[str, Any]) -> float:
        prompt = (
            "Sadece 0-100 arası TEK SAYI yaz. Yorum yok.\n"
            "Kısa vadeli kırılım ihtimali (yüksek=iyi). Risk dahil.\n"
            f"Özet: {json.dumps(summary_json, ensure_ascii=False)}\n"
            "YANIT:"
        )
        out = self.llm(prompt, max_tokens=8, temperature=float(LLM_TEMP), top_p=float(LLM_TOP_P), stop=["\n"])
        text = (out.get("response") or (out.get("choices") or [{}])[0].get("text") or "").strip()
        m = re.search(r"(\d{1,3})(?:\.\d+)?", text)
        if not m:
            raise LLMError(f"LLM sayı döndürmedi: '{text}'")
        val = float(m.group(1))
        return float(max(0.0, min(100.0, val)))

    # Disk cache’li versiyon (TTL=1 gün)
    def score_cached(self, summary_json: Dict[str, Any], extra_key: str | None = None, ttl_days: int = 1) -> float:
        payload = {"summary_json": summary_json, "extra": extra_key or ""}
        sig = _make_sig(payload)
        path = _cache_path(sig)
        now = time.time()
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    obj = json.load(f)
                if isinstance(obj, dict) and (now - float(obj.get("ts", 0))) <= ttl_days * 86400:
                    v = float(obj["score"])
                    return float(max(0.0, min(100.0, v)))
            except Exception:
                pass
        v = self.score(summary_json)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"ts": now, "score": float(v)}, f, ensure_ascii=False)
        except Exception:
            pass
        return v

# ===== Birleştirme =====
def blend_scores(rule: float, ml: float, llm: float | None = None, llm_enabled: bool = False) -> float:
    """
    YZDSH şu an SADECE Rule + ML karışımıdır.
    LLM skoru (llm) blend'e girmez; ayrı açıklama/özet için kullanılabilir.
    Not: Eski çağrılar (rule, ml, llm) şeklindeydi; llm_enabled varsayılanı False.
    w_rule/w_ml önce DB ml_config'den okunur; yoksa env / hardcoded default.
    """
    try:
        from app.features.scoring.ml.ml_calib import _get_ml_config
        cfg = _get_ml_config()
        w_rule = float(cfg.get("w_rule", W_RULE))
        w_ml   = float(cfg.get("w_ml", W_ML))
    except Exception:
        w_rule = float(W_RULE)
        w_ml   = float(W_ML)
    total = w_rule + w_ml

    if total <= 0:
        w_rule_norm = 0.5
        w_ml_norm = 0.5
    else:
        w_rule_norm = w_rule / total
        w_ml_norm = w_ml / total

    raw = w_rule_norm * float(rule) + w_ml_norm * float(ml)
    return float(max(0.0, min(100.0, raw)))