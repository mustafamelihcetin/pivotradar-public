# tests/smoke_check.py
from __future__ import annotations
import sys, json, warnings
import pandas as pd
from pathlib import Path

# (Opsiyonel) GÃ¼rÃ¼ltÃ¼lÃ¼ uyarÄ±larÄ± sustur
warnings.filterwarnings("ignore", message="X does not have valid feature names")
warnings.filterwarnings("ignore", module="joblib.externals.loky")

# --- Proje kÃ¶kÃ¼nÃ¼ sys.path'e ekle ---
THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Core importlar
from app.core.ai_settings import ML_MODEL_PATH
from app.features.scoring.ml.ai_score import MLScorer, FeatureError
from app.core.settings import Settings
from app.features.market_data.data.yf_client import fetch_ohlc
from app.core.analysis_engine import _indicators, _row_dict_for_ml  # mevcut fonksiyonlarÄ± kullan


def _norm_col(c) -> str:
    if isinstance(c, tuple):
        return "_".join(str(x) for x in c if x is not None).strip().lower()
    return str(c).strip().lower()


def _norm_cols(df: pd.DataFrame):
    """ df.columns â†’ normalize ad set'i ve normâ†’orijinal map dÃ¶ndÃ¼rÃ¼r. """
    norm_map = {}
    for c in df.columns:
        n = _norm_col(c)
        norm_map[n] = c
    return set(norm_map.keys()), norm_map


def main():
    print("=== PivotRadar Smoke ===")
    print(f"Project root: {ROOT}")
    print(f"ML_MODEL_PATH: {ML_MODEL_PATH}")

    # 1) ML modeli
    ml = MLScorer(ML_MODEL_PATH)
    feat = [str(f).strip().lower() for f in getattr(ml, "feature_names", [])]
    print(f"ML feature sayÄ±sÄ±: {len(feat)}")
    print("Ä°lk 50 feature:", feat[:50])

    symbols = ["THYAO.IS", "ASELS.IS", "AKBNK.IS"]
    params = Settings()

    problems = []
    for sym in symbols:
        print(f"\n--- {sym} ---")
        df = fetch_ohlc(sym, period_days=max(240, params.show_past_days + 60))
        if df.empty or len(df) < 60:
            print("YETERLÄ° VERÄ° YOK")
            continue

        out = _indicators(df, params, ml_feature_names=feat if feat else None)

        # DEBUG 1: KolonlarÄ± ham haliyle yaz
        print("Kolonlar(ilk 40):", list(out.columns[:40]))

        # DEBUG 2: Normalize kolonu oluÅŸtur
        cols_lower_set, cols_norm_map = _norm_cols(out)
        print("Normalize Ã¶rnek(ilk 40):", list(sorted(cols_lower_set))[:40])

        # DEBUG 3: Kritik feature var mÄ±?
        for key in ["open", "high", "low", "close", "volume", "ema5", "ema20", "ema50", "ema200",
                    "ema5_ema20_diff_pct", "rsi14", "macd_line", "stoch_k", "adx14", "mfi14", "obv",
                    "atr_pct", "bb_width_pct", "vol_ratio20"]:
            print(f"has[{key}]:", key in cols_lower_set)

        missing_cols = [f for f in feat if f not in cols_lower_set]
        print(f"Toplam kolon: {len(out.columns)}, Eksik kolon (metaâ€™ya gÃ¶re): {len(missing_cols)}")
        if missing_cols:
            print("Eksik kolon Ã¶rnekleri:", missing_cols[:20])

        last = out.iloc[-1]
        nan_at_last = []
        for f in feat:
            if f in cols_lower_set:
                orig = cols_norm_map[f]
                try:
                    val = last[orig]
                    is_nan = pd.isna(val)
                except Exception:
                    is_nan = False
                if is_nan:
                    nan_at_last.append(f)
        print(f"Son satÄ±r NaN olan feature sayÄ±sÄ±: {len(nan_at_last)}")
        if nan_at_last:
            print("NaN Ã¶rnekleri:", nan_at_last[:20])

        row_dict = _row_dict_for_ml(last, required=feat if feat else None)
        missing_in_rowdict = [f for f in feat if f not in row_dict]
        print(f"row_dictâ€™te eksik key sayÄ±sÄ±: {len(missing_in_rowdict)}")
        if missing_in_rowdict:
            print("row_dict eksik Ã¶rnekleri:", missing_in_rowdict[:20])

        try:
            X = ml._vectorize(row_dict)  # sadece smoke
            print("VektÃ¶r ÅŸekli:", getattr(X, "shape", None))
            y = ml.score(row_dict)
            print("ML skor:", y)
        except FeatureError as e:
            print("FeatureError:", e)
            problems.append((sym, "FeatureError", str(e)))
        except Exception as e:
            print("Genel hata:", repr(e))
            problems.append((sym, "Exception", repr(e)))

    print("\n=== Ã–zet ===")
    if not problems:
        print("BaÅŸarÄ±lÄ±: ML vektÃ¶rleme/score Ã§alÄ±ÅŸtÄ±.")
    else:
        for sym, typ, msg in problems:
            print(f"[{sym}] {typ}: {msg}")

if __name__ == "__main__":
    main()
