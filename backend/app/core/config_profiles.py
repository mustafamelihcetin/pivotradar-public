# backend/app/core/config_profiles.py
"""
PivotRadar Strateji Profil Yapılandırması

7 Standart Profil (UI Türkçe ↔ Backend İngilizce):
  SAFE_HARBOR    → "Güvenli Liman"    — Maksimum Sermaye Koruması
  AGGRESSIVE     → "Agresif Atak"     — Yüksek Risk, Keskin Momentum
  REVERSAL       → "Dönüş Uzmanı"     — Kısa Vadeli Dip ve Dönüşler
  TREND_HUNTER   → "Trend Avcısı"     — Güçlü Momentum Takibi
  VALUE_SCOUT    → "Değer Kaşifi"     — Ucuz ve Temel Gücü Yüksek
  SCALPER        → "Anlık Fırsatçı"   — Yüksek Frekanslı Hızlı Atak
  BREAKOUT       → "Kırılım Dedektörü"— Teknik Formasyon Kırılımları

Tüm Türkçe varyantlar (encoding, boşluk, eski isimler dahil) normalize_profile()
fonksiyonu ile İngilizce canonical key'e eşlenir. Backend'de hiçbir yerde
Türkçe karakter ile substring karşılaştırması yapılmaz.
"""
from __future__ import annotations

# ── Profil adı → canonical İngilizce key ─────────────────────────────────────
# Tüm Türkçe varyantlar ve eski profil adları buraya eklenir.
# normalize_profile() bu haritayı kullanır; match logic ASCII-upper üzerinden çalışır.
_PROFILE_ALIAS: dict[str, str] = {
    # ── Güvenli Liman (SAFE_HARBOR) ──────────────────────────────────────────
    "GUVENLI LIMAN":       "SAFE_HARBOR",
    "SAFE HARBOR":         "SAFE_HARBOR",
    "SAFE_HARBOR":         "SAFE_HARBOR",
    "SAFEHARBOR":          "SAFE_HARBOR",
    # eski isimler
    "KONSER":              "SAFE_HARBOR",
    "KONSERVATIF":         "SAFE_HARBOR",
    "CONSERVATIVE":        "SAFE_HARBOR",
    "DEFANSIF":            "SAFE_HARBOR",
    "DEFENSIVE":           "SAFE_HARBOR",

    # ── Agresif Atak (AGGRESSIVE) ─────────────────────────────────────────────
    "AGRESIF ATAK":        "AGGRESSIVE",
    "AGGRESSIVE":          "AGGRESSIVE",
    "AGRESIF":             "AGGRESSIVE",
    "AGGRESSIVE ATTACK":   "AGGRESSIVE",
    "MOMENTUM":            "AGGRESSIVE",  # Momentum = yüksek ivme = Agresif

    # ── Dönüş Uzmanı (REVERSAL) ───────────────────────────────────────────────
    "DONUS UZMANI":        "REVERSAL",
    "REVERSAL":            "REVERSAL",
    "SWING":               "REVERSAL",   # eski isim
    "SWING TRADER":        "REVERSAL",
    "MEAN-REVERT":         "REVERSAL",   # ortalamaya dönüş = dip/dönüş stratejisi
    "MEAN REVERT":         "REVERSAL",
    "MEANREVERT":          "REVERSAL",
    "ORTALAMA DONUS":      "REVERSAL",

    # ── Trend Avcısı (TREND_HUNTER) ──────────────────────────────────────────
    "TREND AVCISI":        "TREND_HUNTER",
    "TREND_HUNTER":        "TREND_HUNTER",
    "TREND HUNTER":        "TREND_HUNTER",
    "TREND":               "TREND_HUNTER",  # eski isim

    # ── Değer Kaşifi (VALUE_SCOUT) ────────────────────────────────────────────
    "DEGER KASIFI":        "VALUE_SCOUT",
    "VALUE_SCOUT":         "VALUE_SCOUT",
    "VALUE SCOUT":         "VALUE_SCOUT",
    "DEGER":               "VALUE_SCOUT",   # eski isim
    "VALUE":               "VALUE_SCOUT",

    # ── Anlık Fırsatçı (SCALPER) ──────────────────────────────────────────────
    "ANLIK FIRSATCI":      "SCALPER",
    "SCALPER":             "SCALPER",
    "INSTANT TRADER":      "SCALPER",
    "SCALP":               "SCALPER",

    # ── Kırılım Dedektörü (BREAKOUT) ──────────────────────────────────────────
    "KIRILIM DEDEKTORU":   "BREAKOUT",
    "BREAKOUT":            "BREAKOUT",
    "KIRILIM":             "BREAKOUT",   # eski isim
    "BREAKOUT DETECTOR":   "BREAKOUT",
}

# ASCII-normalize yardımcısı — Türkçe karakterleri Latin eşdeğeriyle değiştirir
def _ascii_upper(s: str) -> str:
    return (
        s.strip().upper()
        .replace("İ", "I").replace("I", "I")
        .replace("Ğ", "G").replace("Ş", "S")
        .replace("Ç", "C").replace("Ö", "O")
        .replace("Ü", "U")
    )


def normalize_profile(name: str) -> str:
    """
    Profil adını canonical İngilizce key'e normalize eder.
    Türkçe karakter ve boşluk sorunlarını otomatik çözer.
    Bilinmeyen profil → "SAFE_HARBOR" (en güvenli varsayılan).
    """
    if not name:
        return "SAFE_HARBOR"
    upper = _ascii_upper(name)
    # 1. Doğrudan tam eşleşme
    if upper in _PROFILE_ALIAS:
        return _PROFILE_ALIAS[upper]
    # 2. Substring eşleşme (yedek — eski/kısaltılmış isimler için)
    for alias, canonical in _PROFILE_ALIAS.items():
        if alias in upper or upper in alias:
            return canonical
    # 3. Fallback
    return "SAFE_HARBOR"


def profile_display_name(key: str) -> str:
    """İngilizce canonical key → Türkçe UI adı."""
    return _DISPLAY_NAMES.get(key, key)


# ── UI'da gösterilecek Türkçe isimler ────────────────────────────────────────
# Fiyat outlier eşiği — bu değerin üstündeki hisseler QRS=10'a kırpılır.
# Türk enflasyonu nedeniyle yıllık gözden geçirilmeli; 50K çok düşüktü.
OUTLIER_PRICE_THRESHOLD: float = 100_000.0

_DISPLAY_NAMES: dict[str, str] = {
    "SAFE_HARBOR":  "Güvenli Liman",
    "AGGRESSIVE":   "Agresif Atak",
    "REVERSAL":     "Dönüş Uzmanı",
    "TREND_HUNTER": "Trend Avcısı",
    "VALUE_SCOUT":  "Değer Kaşifi",
    "SCALPER":      "Anlık Fırsatçı",
    "BREAKOUT":     "Kırılım Dedektörü",
}

# ── Canonical profil listesi ──────────────────────────────────────────────────
ALL_PROFILES: list[str] = list(_DISPLAY_NAMES.keys())


# ── Profile → ML trust ratio ──────────────────────────────────────────────────
# O-1: Profil bazlı diferansiyel ML blend.
# Daha yüksek blend → ML sinyali daha fazla ağırlık taşır; teknik kural etkisi azalır.
# SCALPER/AGGRESSIVE: Momentum + hacim anlık; ML sinyali erken yakalayabilir → yüksek blend.
# VALUE_SCOUT/REVERSAL: Temel/teknik aşırısatım odaklı; ML güvenilirliği daha düşük → düşük blend.
# SAFE_HARBOR: En muhafazakâr; ML yanılırsa ruin riski yüksek → en düşük blend.
PROFILE_ML_BLEND: dict[str, float] = {
    "SAFE_HARBOR":  0.30,   # 0.40 → 0.30: sermaye koruma, ML hatasına karşı daha dirençli
    "AGGRESSIVE":   0.50,   # 0.40 → 0.50: momentum/hacim ML'de iyi temsil edilir
    "REVERSAL":     0.35,   # 0.40 → 0.35: teknik aşırısatım sinyali kural bazlı
    "TREND_HUNTER": 0.45,   # 0.40 → 0.45: trend sürekliliği ML tarafından iyi öğrenilir
    "VALUE_SCOUT":  0.30,   # 0.40 → 0.30: değer tespiti temel/kural bazlı
    "SCALPER":      0.35,   # 0.50 → 0.35: ML T+1 kapanış verisi, scalper anlık fiyat hareketi ister; düşük ML ağırlığı daha güvenli
    "BREAKOUT":     0.45,   # 0.40 → 0.45: kırılım teyidi ML'de hacimle korele
}

# ── Profile → ATR hedef çarpanı ───────────────────────────────────────────────
# Güvenli Liman: dar/elde edilebilir hedef; Agresif: geniş momentum hedefi.
PROFILE_TARGET_MULT: dict[str, float] = {
    "SAFE_HARBOR":  1.2,   # Temkinli — elde edilebilir, dar hedef
    "AGGRESSIVE":   2.0,   # Orta-geniş — 3.0 gerçekçi değildi, hit rate düşüyordu
    "REVERSAL":     1.5,   # Orta — kısa vadeli dönüş
    "TREND_HUNTER": 2.5,   # Geniş — trend devam hedefi
    "VALUE_SCOUT":  1.8,   # Orta — temel değer düzeltmesi (2.0→1.8: daha erişilebilir)
    "SCALPER":      1.0,   # Çok dar — hızlı çıkış
    "BREAKOUT":     1.8,   # Orta — 2.5 çok uzaktı, kırılım onayı için yeterli
}

# ── Profile → ML güven eşiği ──────────────────────────────────────────────────
# ML skoru bu değerin altına düşerse PRISM risk veto mekanizmaları devreye girer.
PROFILE_ML_THRESHOLD: dict[str, float] = {
    "SAFE_HARBOR":  68.0,  # En katı — ML belirsizse geçme
    "AGGRESSIVE":   30.0,  # Esnek — momentum sinyali yeterli
    "REVERSAL":     40.0,  # Orta — dönüş sinyali teknik ağırlıklı
    "TREND_HUNTER": 52.0,  # Güçlü trend gerektirir
    "VALUE_SCOUT":  38.0,  # Değer tespiti temel ağırlıklı
    "SCALPER":      35.0,  # Hız odaklı — gevşek eşik
    "BREAKOUT":     55.0,  # Kırılım teyidi — makul güven
}

# ── Profile → Formasyon boost çarpanı ────────────────────────────────────────
# Tespit edilen teknik formasyonun katkı çarpanı.
PROFILE_PATTERN_BOOST: dict[str, float] = {
    "SAFE_HARBOR":  0.7,   # Formasyon tek başına güven vermez
    "AGGRESSIVE":   2.0,   # Kırılım coşkusunu yakalar
    "REVERSAL":     1.8,   # Dönüş formasyonları kritik
    "TREND_HUNTER": 1.4,   # Trend onayı için kullanışlı
    "VALUE_SCOUT":  1.2,   # Destekleyici ama birincil değil
    "SCALPER":      1.6,   # Hızlı kırılım sinyali
    "BREAKOUT":     2.5,   # Kırılım dedektörü için temel sinyal
}

# ── Profil bazlı kısa vade (predicted_days) sınırları ────────────────────────
# engine.py'da hedef mesafesinden hesaplanan süreyi bu aralıkla kırpar.
PROFILE_DURATION_DAYS: dict[str, tuple[int, int]] = {
    "SAFE_HARBOR":  (5,  30),  # Güvenli — kısa-orta (eski: 10-45, fazla geniş)
    "AGGRESSIVE":   (2,  15),  # Momentum — hızlı hareket
    "REVERSAL":     (2,  10),  # Dönüş — kısa
    "TREND_HUNTER": (5,  30),  # Trend devam
    "VALUE_SCOUT":  (10, 45),  # Değer — zaman alır
    "SCALPER":      (1,   4),  # Anlık
    "BREAKOUT":     (3,  15),  # Kırılım sonrası
}

# ── Profil bazlı backtest giriş/çıkış QRS eşikleri ──────────────────────────
# entry: bu QRS üstünde pozisyon aç
# exit_qrs: bu QRS altında pozisyonu kapat
# exit_ema: True → EMA death cross da çıkış sinyali verir
PROFILE_BACKTEST_THRESHOLDS: dict[str, dict] = {
    "SAFE_HARBOR":  {"entry": 68, "exit_qrs": 45, "exit_ema": True},   # katı giriş, erken çıkış
    "AGGRESSIVE":   {"entry": 60, "exit_qrs": 25, "exit_ema": False},  # gevşek giriş, geç çıkış
    "REVERSAL":     {"entry": 62, "exit_qrs": 30, "exit_ema": True},   # dönüş sinyali, kısa tutma
    "TREND_HUNTER": {"entry": 65, "exit_qrs": 30, "exit_ema": True},   # trend takip
    "VALUE_SCOUT":  {"entry": 63, "exit_qrs": 32, "exit_ema": False},  # değer, sabırlı çıkış
    "SCALPER":      {"entry": 60, "exit_qrs": 38, "exit_ema": False},  # hızlı giriş/çıkış
    "BREAKOUT":     {"entry": 65, "exit_qrs": 28, "exit_ema": True},   # kırılım, momentum son
}

# Per-profile max target distance (%) used by charts/engine.py to cap drawn targets
PROFILE_MAX_TARGET_PCT: dict[str, float] = {
    "SAFE_HARBOR":  10.0,
    "AGGRESSIVE":   20.0,
    "REVERSAL":     15.0,
    "TREND_HUNTER": 15.0,
    "VALUE_SCOUT":  12.0,
    "SCALPER":       5.0,
    "BREAKOUT":     18.0,
}
