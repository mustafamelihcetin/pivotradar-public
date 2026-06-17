# backend/app/features/scoring/ml/constants.py
"""
Single source of truth for ML pipeline constants.
All ML modules (training, ml_calib, evaluator) import from here.
"""
import hashlib
import json
from typing import Dict, List

# ── Feature Schema ────────────────────────────────────────────────────────────
# Bump this version whenever RETRAIN_FEATURES list changes.
# model meta.json stores this; MLScorer rejects models with mismatched version.
FEATURE_SCHEMA_VERSION: int = 10

RETRAIN_FEATURES: List[str] = [
    # V2 core features
    "rsi14_x", "atr_pct", "vol_ratio20", "ret_1d",
    "ema20_gap", "ema50_gap", "range_pct", "body_pct",
    "momentum", "breakout", "trend", "pattern_score",
    # V3 extended technical features
    "w52_position", "volume_zscore", "ret_3d", "ret_acceleration",
    "ema_alignment_score",
    # V3 macro features
    "bist100_trend_5d", "vix_regime", "usdtry_change_5d",
    # V5 derived regime feature
    "market_regime",
    # V7 relative strength vs BIST100 (5-day stock return minus index return)
    "rs_vs_bist100",
    # V8 pattern type ordinal encoding: -2=güçlü ayı, -1=ayı, 0=nötr, 1=boğa, 2=güçlü boğa
    "pattern_type_encoded",
    # V9: doğrudan teknik göstergeler (feature_builder hesaplar, raw_features JSON'dan okunur)
    "bb_width_pct",  # Bollinger Band genişlik % → squeeze / kırılım tespiti
    "macd_hist",     # MACD histogram → momentum ivmesi (hız değişimi)
    "adx14",         # ADX 14 → trend gücü (RSI'yı tamamlar)
    "stoch_k",       # Stochastic K → overbought/oversold bölgesi
    "squeeze_kc",    # BB / Keltner Channel oranı → patlama öncesi sıkışma
    # V9b: profil bağlamı — model hangi profil için çalıştığını bilir
    "profile_encoded",  # -2=agresif → 0=nötr → +2=konservatif
    # V9c: formasyon yaşı — eski formasyon = düşük sinyal gücü
    "pattern_formed_bars_ago",  # 0=taze, 20+=eskiyor, 30+=neredeyse geçersiz
    # V10: DB kolonları — formasyon ve trend kalitesi sinyalleri
    "pattern_is_stale",         # 1=formasyon eskidi (stale), 0=taze — QRS'e etkisi yok ama sinyal filtresi
    "trend_duration_days",      # trende kaç gün devam ediyor — kısa trend kırılımlar farklı dinamik
    "sector_rel_strength_5d",   # sektörün endekse göre 5 günlük relatif gücü — rotasyon sinyali
]

# V8 feature seti: V9/V10-specific raw_features bağımlı özellikler çıkarıldı.
# V9 verisi (raw_features dolu kayıt) yetersizken fallback olarak kullanılır.
RETRAIN_FEATURES_V8: List[str] = [
    f for f in RETRAIN_FEATURES
    if f not in ("bb_width_pct", "macd_hist", "adx14", "stoch_k", "squeeze_kc",
                 "pattern_formed_bars_ago")
]

# Profil → sayısal encoding (eğitim + çıkarım için tek kaynak)
PROFILE_ENCODING: dict = {
    "Güvenli Liman":     2.0,   # en konservatif — yüksek kalite eşiği
    "Trend Avcısı":      1.0,   # güçlü trend + momentum
    "Değer Kaşifi":      1.0,   # temel değer odaklı
    "Dönüş Uzmanı":      0.0,   # reversal / nötr
    "Kırılım Dedektörü": 0.0,   # breakout / nötr
    "Anlık Fırsatçı":   -1.0,   # kısa vadeli, orta agresif
    "Agresif Atak":     -2.0,   # en agresif — düşük eşik
}

# Deterministic 8-char hash of the sorted feature list.
# Stored in model bundles at training time; checked at load time to detect drift.
FEATURES_HASH: str = hashlib.md5(
    json.dumps(sorted(RETRAIN_FEATURES)).encode()
).hexdigest()[:8]

# ScanScore ORM column → training feature name
SCAN_SCORE_FEATURE_MAP: Dict[str, str] = {
    "rsi14_x":           "rsi",
    "atr_pct":           "atr_percent",
    "vol_ratio20":       "volume_ratio",
    "ret_1d":            "change_pct",
    "ema20_gap":         "ema20_gap",
    "ema50_gap":         "ema50_gap",
    "range_pct":         "range_pct",
    "body_pct":          "body_pct",
    "momentum":          "momentum",
    "breakout":          "breakout",
    "trend":             "trend",
    "pattern_score":     "pattern_score",
    # V3 extended
    "w52_position":      "w52_position",
    "volume_zscore":     "volume_zscore",
    "ret_3d":            "ret_3d",
    "ret_acceleration":  "ret_acceleration",
    "ema_alignment_score": "ema_alignment_score",
    "bist100_trend_5d":  "bist100_trend_5d",
    "vix_regime":        "vix_regime",
    "usdtry_change_5d":  "usdtry_change_5d",
    "market_regime":        "market_regime",
    "rs_vs_bist100":        "rs_vs_bist100",
    "pattern_type_encoded": None,   # pattern_name'den türetilir; training.py özel işler
    # V9: raw_features JSON'dan okunur (None = training.py JSON fallback kullanır)
    "bb_width_pct":     None,
    "macd_hist":        None,
    "adx14":            None,
    "stoch_k":          None,
    "squeeze_kc":       None,
    # V9b: profile_name'den türetilir (training.py özel işler)
    "profile_encoded":          None,
    # V9c: raw_features JSON'dan veya ScanScore'dan okunur
    "pattern_formed_bars_ago":  None,
    # V10: doğrudan ScanScore kolonları
    "pattern_is_stale":         "pattern_is_stale",
    "trend_duration_days":      "trend_duration_days",
    "sector_rel_strength_5d":   "sector_rel_strength_5d",
}

# ── Soft-label weights ────────────────────────────────────────────────────────
# Used identically in training.py, ml_calib.py, and evaluator.py.
SOFT_WEIGHTS: Dict[str, float] = {
    "target_hit": 1.0,
    "near_miss":  0.8,
    "partial":    0.4,
    "miss":       0.0,
}

# ── Training quality thresholds ───────────────────────────────────────────────
# Y-2: AUC eşiği yükseltildi; log_loss uyumlu tutuldu.
# Random baseline: AUC=0.50, log_loss=0.693.
# BIST piyasası gürültülü; log_loss=0.65 AUC=0.60 dengeli eşikler.
# log_loss=0.60 çok sıkı → RMSE threshold 0.55 ile çelişir, modeller sık reddedilir.
MAX_VAL_LOG_LOSS: float = 0.70   # Y-3: 0.60→0.70; BIST gürültülü, şema uyumsuz eski model
                                  # AUC>0.54 ile 0.70 hâlâ rastgeleden iyi; eski 0.60 modelleri bloke eder.
MAX_CV_LOG_LOSS: float = 0.75    # Walk-forward CV eşiği (temporal CV doğası gereği daha gürültülü)
MIN_VAL_AUC: float = 0.54        # V10: 0.52→0.54; directional_hit labeling ile daha güvenilir AUC hedefi
MAX_ECE: float = 0.15            # V10: Kalibrasyon sapması üst sınırı; 0.20→0.15 — olasılık çıktısı güvenilirliği
MIN_RETRAIN_SAMPLES: int = 80    # minimum rows needed to trigger a retrain
VAL_RATIO: float = 0.20          # fraction of data held out for validation

# ── Calibration parameters ─────────────────────────────────────────────────────
CALIB_MIN_SAMPLES: int = 60      # minimum samples for reliable isotonic calibration
CALIB_WINDOW_DAYS: int = 150     # lookback window for calibration data
CALIB_HALF_LIFE_DAYS: int = 90   # D-6: 45 → 90 gün; agresif decay değerli rejim geçmişini atıyordu

# ── Feature hard bounds ────────────────────────────────────────────────────────
# Aykırı değerleri (ör. TERA: volume_ratio=16.9M) her seviyede keser.
# Üç savunma katmanı: (1) scanner hesaplama, (2) DB kayıt, (3) ML eğitim.
# Tuple: (min, max) — numpy clip ile uygulanır. NaN korunur (HistGBT halleder).
FEATURE_BOUNDS: dict = {
    "rsi14_x":               (0.0,   100.0),
    "atr_pct":               (0.1,    25.0),
    "vol_ratio20":           (0.0,    20.0),   # 20x ortalama hacim üstü fiziksel olarak imkânsız
    "ret_1d":               (-30.0,   30.0),
    "ema20_gap":            (-50.0,   50.0),
    "ema50_gap":            (-80.0,   80.0),
    "range_pct":             (0.0,    25.0),
    "body_pct":             (-1.0,     1.0),
    "momentum":             (-1.0,     1.0),
    "breakout":              (0.0,     1.0),
    "trend":                 (0.0,     1.0),
    "pattern_score":         (0.0,   100.0),
    "w52_position":          (0.0,     1.0),
    "volume_zscore":        (-5.0,    10.0),
    "ret_3d":               (-50.0,   50.0),
    "ret_acceleration":     (-10.0,   10.0),
    "ema_alignment_score":  (-3.0,     3.0),
    "bist100_trend_5d":     (-20.0,   20.0),
    "vix_regime":            (0.0,     4.0),
    "usdtry_change_5d":     (-20.0,   20.0),
    "market_regime":         (0.0,     2.0),
    "rs_vs_bist100":        (-30.0,   30.0),
    "pattern_type_encoded": (-2.0,     2.0),
    "profile_encoded":      (-2.0,     2.0),
    "bb_width_pct":          (0.0,    30.0),
    "macd_hist":            (-10.0,   10.0),
    "adx14":                 (0.0,   100.0),
    "stoch_k":               (0.0,   100.0),
    "squeeze_kc":            (0.0,     5.0),
    "pattern_formed_bars_ago": (0.0, 100.0),
    # V10
    "pattern_is_stale":      (0.0,     1.0),
    "trend_duration_days":   (0.0,   365.0),
    "sector_rel_strength_5d": (-30.0, 30.0),
}

# DB kolonundan feature adına çeviri (bounds uygularken kullanılır)
_DB_COL_TO_FEATURE: dict = {
    "volume_ratio":  "vol_ratio20",
    "atr_percent":   "atr_pct",
    "rsi":           "rsi14_x",
    "change_pct":    "ret_1d",
}

# ── Formation-specific prediction windows ────────────────────────────────────
# (min_days, max_days) — user_scorer ve evaluator'da ATR-bazlı flat formül yerine kullanılır.
# Ortalama = (min+max)/2 başlangıç noktası; ATR ile ince ayar yapılır.
FORMATION_PRED_DAYS: Dict[str, tuple] = {
    "Bayrak":           (5,  12),   # hızlı devam hareketi
    "Flama":            (5,  12),   # bayrak benzeri — kısa
    "Destek Hattı":     (5,  15),
    "Direnç Hattı":     (5,  15),
    "Daralan Üçgen":    (8,  22),
    "Yükselen Üçgen":   (6,  18),
    "Alçalan Üçgen":    (6,  18),
    "Genişleyen Üçgen": (10, 28),
    "Range/Kutu":       (8,  22),
    "Çift Dip":         (10, 28),
    "Çift Tepe":        (10, 28),
    "Üçlü Dip":         (15, 35),
    "Üçlü Tepe":        (15, 35),
    "Baş Omuz":         (15, 32),
    "Ters Baş Omuz":    (15, 32),
    "Yükselen Kanal":   (10, 26),
    "Alçalan Kanal":    (10, 26),
    "Yükselen Takoz":   (10, 24),
    "Alçalan Takoz":    (10, 24),
    "Kupa Sap":         (20, 42),   # en uzun formasyon
}

# ── Formation-specific ATR multipliers (target price fallback) ────────────────
# Hedef fiyat NULL iken kullanılır: entry ± (ATR * mult)
# Reversal formasyonları daha büyük hedef; devam formasyonları daha küçük/hızlı.
FORMATION_ATR_MULT: Dict[str, float] = {
    "Bayrak":           1.5,
    "Flama":            1.5,
    "Destek Hattı":     1.2,
    "Direnç Hattı":     1.2,
    "Daralan Üçgen":    2.0,
    "Yükselen Üçgen":   1.8,
    "Alçalan Üçgen":    1.8,
    "Genişleyen Üçgen": 2.2,
    "Range/Kutu":       1.8,
    "Çift Dip":         2.5,
    "Çift Tepe":        2.5,
    "Üçlü Dip":         2.8,
    "Üçlü Tepe":        2.8,
    "Baş Omuz":         2.5,
    "Ters Baş Omuz":    2.5,
    "Yükselen Kanal":   2.0,
    "Alçalan Kanal":    2.0,
    "Yükselen Takoz":   1.8,
    "Alçalan Takoz":    1.8,
    "Kupa Sap":         3.0,   # en büyük hedef — hacim + olgunluk gerektirir
    "_default":         2.0,
}
