# backend/app/features/scoring/yzdsh_rules.py
"""
PRISM Strategic Rule Engine — Profil Bazlı Teknik Analiz Skoru

Her profil tamamen farklı bir yatırım mantığını yansıtır:
  SAFE_HARBOR    — Sermaye koruması; yüksek ATR/RSI'yi sert cezalandırır
  AGGRESSIVE     — Momentum patlaması; breakout + hacim + güçlü RSI ödüller
  REVERSAL       — Dip ve dönüş; oversold RSI + dönüş formasyonu arar
  TREND_HUNTER   — Trend takibi; güçlü EMA hizası + sürekli momentum
  VALUE_SCOUT    — Değer yatırımı; düşük RSI + istikrar + uzun vadeli potansiyel
  SCALPER        — Hızlı işlem; volatilite + hacim ani değişimi ödüller
  BREAKOUT       — Formasyon kırılımı; hacim teyitli teknik kırılım
"""
from __future__ import annotations
import numpy as np
from typing import Optional
from app.core.config_profiles import normalize_profile

# ── Rule thresholds (externalized from inline magic numbers) ──────────────────
_RSI_NEUTRAL_LOW:  float = 40.0   # RSI below this = oversold/bearish zone
_RSI_NEUTRAL_HIGH: float = 62.0   # RSI above this = overbought / SAFE_HARBOR penalty
_ATR_HIGH:         float = 5.0    # ATR % above this triggers volatility penalty
_ATR_EXTREME:      float = 10.0   # Extreme volatility — heavy penalty
_ATR_AGGRESSIVE:   float = 12.0   # Aggressive profile ATR ceiling
_VOL_RATIO_HIGH:   float = 2.5    # Volume spike threshold for bonus
_MOMENTUM_HIGH:    float = 5.0    # Momentum % above this = strong signal


def _apply_macro_adjustments(
    s: float,
    pn: str,
    vix_regime: int = 0,
    usdtry_change_5d: float = 0.0,
    bist100_trend_5d: float = 0.0,
    sector_rel_strength_5d: float = 0.0,
    w52_position: float = 0.5,
    dist_from_52w_high: float = 0.0,
    volume_zscore: float = 0.0,
    consecutive_down_days: int = 0,
    ema_alignment_score: int = 0,
    trend_duration_days: int = 0,
    close_position: float = 0.5,
    ret_acceleration: float = 0.0,
) -> float:
    """
    Profile-specific adjustments using extended technical + macro signals.
    Applied after the base score is computed. Max impact: ±20 points.
    """
    adj = 0.0

    # ── Macro: VIX fear regime ────────────────────────────────────────────────
    # BIST-VIX korelasyonu ~0.35-0.45 — global piyasalardan kısmen decoupled.
    # -12 cezası bu korelasyon için fazla; -6'ya indirildi.
    # REVERSAL: yüksek VIX = BIST'te contrarian fırsat → küçük pozitif.
    if vix_regime >= 2:
        if pn in ("AGGRESSIVE", "BREAKOUT", "TREND_HUNTER", "SCALPER"):
            adj -= 6.0   # 12 → 6: BIST-VIX korelasyonu ölçülü
        elif pn == "REVERSAL":
            adj += 2.0   # yüksek korku = dönüş fırsatı (contrarian)
        elif pn == "VALUE_SCOUT":
            adj -= 2.0   # az etkilenir — değer yatırımcısı uzun vadeli
        else:
            adj -= 4.0   # SAFE_HARBOR: temkinli ama -7 fazlaydı
    elif vix_regime == 1:
        if pn in ("AGGRESSIVE", "BREAKOUT"):
            adj -= 3.0   # hafif uyarı

    # ── Macro: USD/TRY değişimi ───────────────────────────────────────────────
    # BIST gerçeği: TRY devalüasyonu sırasında hisseler NOMINAL olarak yükselir.
    # İhracatçı/dövizli (SASA, EREGL, THYAO): güçlü kazanç.
    # Domestic/ithalatçı: nominal artış ama reel kayıp → etkiler nötür → küçük pozitif.
    # Önceki VALUE_SCOUT -8 HATAYDI: domestic hisseler nominal olarak artar.
    if usdtry_change_5d > 5.0:
        if pn in ("AGGRESSIVE", "TREND_HUNTER", "BREAKOUT"):
            adj += 6.0   # ihracatçı momentum (önceki: +3)
        elif pn == "VALUE_SCOUT":
            adj += 2.0   # önceki: -8 (hatalıydı) — nominal artış etkisi
        elif pn == "SAFE_HARBOR":
            adj -= 3.0   # sermaye koruma: devalüasyon belirsizliği
        # Çok hızlı devalüasyon → sistematik kriz riski tüm profiller için
        if usdtry_change_5d > 10.0:
            adj -= 5.0
    elif usdtry_change_5d < -3.0:
        # TRY güçleniyor: domestic için pozitif
        if pn == "VALUE_SCOUT":
            adj += 4.0
        elif pn == "SAFE_HARBOR":
            adj += 3.0

    # ── Macro: BIST100 trend ──────────────────────────────────────────────────
    if bist100_trend_5d > 3.0:
        if pn in ("AGGRESSIVE", "TREND_HUNTER", "BREAKOUT"):
            adj += 5.0   # rising tide
    elif bist100_trend_5d < -3.0:
        if pn in ("AGGRESSIVE", "BREAKOUT"):
            adj -= 8.0

    # ── Sector relative strength ──────────────────────────────────────────────
    if sector_rel_strength_5d > 3.0:
        adj += 4.0   # sector outperforming — profile-agnostic bonus
    elif sector_rel_strength_5d < -3.0:
        adj -= 4.0

    # ── Technical: 52-week position ──────────────────────────────────────────
    if pn == "VALUE_SCOUT":
        if dist_from_52w_high > 30.0:
            adj += 8.0   # deeply below 52w high = value opportunity
        elif dist_from_52w_high > 20.0:
            adj += 4.0
    elif pn == "TREND_HUNTER":
        if w52_position > 0.75:
            adj += 5.0   # near 52w high in trend = strength
        elif w52_position < 0.3:
            adj -= 5.0   # weak price history
    elif pn == "AGGRESSIVE":
        if w52_position > 0.85:
            adj += 6.0   # breakout territory

    # ── Technical: EMA alignment ─────────────────────────────────────────────
    if pn in ("TREND_HUNTER", "SAFE_HARBOR"):
        if ema_alignment_score == 3:
            adj += 7.0   # fully aligned: close > ema5 > ema20 > ema50
        elif ema_alignment_score == 2:
            adj += 3.0
        elif ema_alignment_score == 0:
            adj -= 5.0

    # ── Technical: Trend duration ─────────────────────────────────────────────
    if pn == "TREND_HUNTER":
        if trend_duration_days >= 15:
            adj += 6.0   # sustained trend
        elif trend_duration_days >= 7:
            adj += 3.0

    # ── Technical: Volume z-score ─────────────────────────────────────────────
    if pn in ("BREAKOUT", "SCALPER", "AGGRESSIVE"):
        if volume_zscore > 2.5:
            adj += 8.0   # extreme volume spike
        elif volume_zscore > 1.5:
            adj += 4.0

    # ── Technical: Consecutive down days ─────────────────────────────────────
    if pn == "REVERSAL":
        if consecutive_down_days >= 7:
            adj += 9.0   # deeply oversold = reversal setup
        elif consecutive_down_days >= 4:
            adj += 5.0
    elif pn in ("AGGRESSIVE", "TREND_HUNTER"):
        if consecutive_down_days >= 5:
            adj -= 8.0   # momentum stocks losing streak = no go

    # ── Technical: Close position (intraday) ─────────────────────────────────
    if pn == "SCALPER":
        if close_position > 0.80:
            adj += 6.0   # closed near high = bullish pressure
        elif close_position < 0.20:
            adj -= 6.0   # closed near low = bearish

    # ── Technical: Return acceleration ───────────────────────────────────────
    if pn in ("AGGRESSIVE", "MOMENTUM", "TREND_HUNTER"):
        if ret_acceleration > 2.0:
            adj += 4.0   # momentum picking up
        elif ret_acceleration < -2.0:
            adj -= 4.0

    return max(-20.0, min(20.0, adj))


def rules_score(
    rsi: float,
    ema_fast_over_slow: bool,
    atr_pct: float,
    vol_ratio: float,
    profile_name: str = "SAFE_HARBOR",
    breakout: float = 0.0,
    momentum: float = 0.0,
    pattern_name: Optional[str] = None,
    pattern_score: float = 0.0,
    pattern_formed_bars_ago: int = 0,
    pattern_is_stale: bool = False,
    close_price: float = 0.0,
    # Extended signals (optional — neutral defaults for backward compat)
    vix_regime: int = 0,
    usdtry_change_5d: float = 0.0,
    bist100_trend_5d: float = 0.0,
    sector_rel_strength_5d: float = 0.0,
    w52_position: float = 0.5,
    dist_from_52w_high: float = 0.0,
    volume_zscore: float = 0.0,
    consecutive_down_days: int = 0,
    ema_alignment_score: int = 0,
    trend_duration_days: int = 0,
    close_position: float = 0.5,
    ret_acceleration: float = 0.0,
) -> float:
    """
    Returns 0-100 rule-based score for a stock given the active strategy profile.
    This score is combined 60% weight with the ML score in UnifiedPRISM.
    """
    pn = normalize_profile(profile_name)   # canonical English key
    p_name_upper = (pattern_name or "").upper()

    # ── Formasyon yaşı ağırlığı ───────────────────────────────────────────────
    # Eski formasyonlar daha az güvenilir: 2 aylık Baş-Omuz dünkü kadar değil.
    # pattern_score zaten engine'de age_mult ile düşürülmüştür; burada is_stale
    # flag'ine göre ek düzeltme yapılır (kategorik — yaş aralıklarına göre).
    _pat_age_mult = (
        1.0  if pattern_formed_bars_ago <= 5  else
        0.80 if pattern_formed_bars_ago <= 15 else
        0.50 if pattern_formed_bars_ago <= 30 else
        0.15   # 30+ iş günü ≈ 6 hafta+ : neredeyse geçersiz
    )
    # Etkili pattern skoru (engine'deki düşürmeye ek olarak scoring'de de uygula)
    effective_pattern_score = pattern_score * _pat_age_mult

    # ── Formasyon yön sınıflandırması ────────────────────────────────────────
    # Uzun pozisyon odaklı sistemde bearish formasyonlar HİÇBİR profilde bonus
    # almamalı; aksine penaltı uygulanmalı.
    _BEARISH_PATTERNS = (
        "ÇIFT TEPE", "ÜÇLÜ TEPE", "BAŞ OMUZ",
        "ALÇALAN ÜÇGEN", "DÜŞEN TAKOZ", "ALÇALAN KANAL",
    )
    _BULLISH_PATTERNS = (
        "TERS BAŞ", "ÇIFT DIP", "ÜÇLÜ DIP",
        "KUPA", "CUP", "BAYRAK", "FLAG", "FLAMA", "PENNANT",
        "YÜKSELEN ÜÇGEN", "YÜKSELEN KANAL",
    )
    is_bearish_pat = any(b in p_name_upper for b in _BEARISH_PATTERNS)
    is_bullish_pat = any(b in p_name_upper for b in _BULLISH_PATTERNS)

    # ─────────────────────────────────────────────────────────────────────────
    # SAFE_HARBOR — Güvenli Liman
    # Mantık: Sermaye koruma öncelikli. Sinyalin her boyutu doğrulanmış olmalı.
    # RSI: orta bölge (35-60) ideal. Yüksek ATR = tehlike. Trend teyidi zorunlu.
    # ─────────────────────────────────────────────────────────────────────────
    if pn == "SAFE_HARBOR":
        s = 30.0   # Düşük başlangıç — yüksek sinyal barikatı
        # Trend teyidi + düşük volatilite çekirdek koşul
        if ema_fast_over_slow and atr_pct < 3.0:
            s += 30.0   # Kale Sinerjisi
        elif ema_fast_over_slow:
            s += 12.0
        # RSI: 40-62 ideal bölge
        if _RSI_NEUTRAL_LOW <= rsi <= _RSI_NEUTRAL_HIGH:
            s += 18.0
        elif rsi > 80:
            s -= 25.0   # Aşırı overbought = tehlike
        elif rsi > 65:
            s -= 12.0   # Yüksek RSI = dikkat
        elif rsi < 30:
            s -= 20.0   # Oversold = panik satışı
        elif rsi < 38:
            s -= 8.0    # Zayıf bölge
        # Momentum istikrarlı olmalı, aşırı değil
        if 2.0 < momentum <= 10.0:
            s += 10.0
        elif momentum > 15.0:
            s -= 20.0   # Şişmiş trend
        elif momentum < -5.0:
            s -= 15.0
        # ATR cezası
        if atr_pct > _ATR_HIGH:
            s -= (atr_pct - _ATR_HIGH) * 3.0
        # Hacim normal olmalı (spikten kaçın)
        if vol_ratio > _VOL_RATIO_HIGH:
            s -= 10.0   # Anormal hacim = manipülasyon riski
        elif vol_ratio > 1.2:
            s += 5.0
        # Pattern: konservatif için sınırlı bonus; bearish formasyon = risk işareti
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 12.0   # Tepe formasyonu güvenli limanda tehlike
            else:
                s += min(8.0, effective_pattern_score * 0.08)
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # AGGRESSIVE — Agresif Atak
    # Mantık: Keskin momentum + hacimli kırılım. Yüksek risk tolere edilir.
    # RSI 60-80 güçlü bölge, breakout + hacim kombinasyonu roket sinyali.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "AGGRESSIVE":
        # Base 40: tipik boğa günü (RSI+trend+momentum) → ~82, gerçek kırılım → 95+
        s = 40.0
        # Hacimli Breakout: Rocket Synergy
        if breakout > 0.5 and vol_ratio > 1.8:
            s += 38.0
        elif breakout > 0.5:
            s += 22.0
        elif vol_ratio > 2.0:
            s += 15.0
        # RSI güçlü bölge
        if 60 <= rsi <= 82:
            s += 20.0
        elif rsi > 82:
            s += 8.0    # Aşırı ama momentum devam edebilir
        elif rsi < 35:
            s -= 20.0   # Düşüş trendi içinde agresif olma
        # Trend
        if ema_fast_over_slow:
            s += 12.0
        else:
            s -= 12.0
        # Momentum pozitif ve güçlü
        if momentum > 8.0:
            s += 15.0
        elif momentum > 3.0:
            s += 8.0
        elif momentum < -5.0:
            s -= 15.0
        # Hacim teyidi (breakout yoksa da ödüllendir)
        if vol_ratio > 1.5 and breakout <= 0.5:
            s += 5.0
        # ATR: yüksek tolere edilir
        if atr_pct > _ATR_AGGRESSIVE:
            s -= (atr_pct - _ATR_AGGRESSIVE) * 2.5
        # Pattern — bearish formasyonlar agresif long ile çelişir
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 10.0   # Tepe formasyonu = yaklaşan baskı
            else:
                aggressive_patterns = [
                    "ÜÇGEN", "UCGEN", "KANAL",
                    "DIRENÇ", "DIRENC", "KIRILIM",
                    "BAYRAK", "FLAG", "FLAMA", "PENNANT",
                    "KUPA", "CUP",
                ]
                if any(x in p_name_upper for x in aggressive_patterns):
                    s += 30.0 * (effective_pattern_score / 100.0)
                else:
                    s += 18.0 * (effective_pattern_score / 100.0)
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # REVERSAL — Dönüş Uzmanı
    # Mantık: Kısa vadeli dip ve dönüş. Oversold RSI + dönüş formasyonu.
    # Trend YÖN DEĞİŞTİRMEK ÜZERE — EMA uyumsuzluğu bir sorun değil.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "REVERSAL":
        s = 42.0
        # Core: Oversold RSI = Dönüş Fırsatı
        if rsi < 25:
            s += 40.0   # Derin dip — güçlü dönüş potansiyeli
        elif rsi < 30:
            s += 30.0
        elif rsi < 38:
            s += 18.0
        elif rsi > 72:
            s -= 20.0   # Overbought = dönüş ama aşağı yönlü (bearish profil değiliz)
        # Dönüş formasyonları — yalnızca YUKARI dönüş formasyonları bonus alır
        # Baş Omuz/Çift Tepe = aşağı dönüş, long pozisyonda olumsuz
        bullish_reversal_patterns = [
            "DOJI", "HAMMER", "MORNING STAR", "ENGULF", "PINBAR",
            "DESTEK", "DIP", "TABANL", "DUBLE",
            "TERS BAŞ",
            "ÇIFT DIP", "ÜÇLÜ DIP",
            "KUPA", "CUP",
        ]
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 15.0   # Tepe formasyonu = dönüş fırsatı kaçmış
            elif any(x in p_name_upper for x in bullish_reversal_patterns):
                s += 35.0 * (effective_pattern_score / 100.0)   # Kuvvetli yukarı dönüş
            else:
                s += 15.0 * (effective_pattern_score / 100.0)
        # EMA: dönüş ucunda kısa vadeli çapraz daha değerli
        if ema_fast_over_slow:
            s += 8.0    # Hafif bonus — dönüş onayı başlamış
        else:
            s += 3.0    # Henüz çapraz yok ama dip olabilir
        # Momentum: negatiften sıfıra döniyor olmalı
        if -5.0 < momentum <= 0:
            s += 12.0   # Satış baskısı azalıyor
        elif momentum > 0 and momentum < 5.0:
            s += 8.0    # Erken dönüş işareti
        elif momentum < -15.0:
            s -= 15.0   # Serbest düşüş
        # Hacim: dip noktasında hacim artışı dönüşü teyit eder
        if vol_ratio > 1.3:
            s += 10.0
        # ATR: orta seviye OK
        if atr_pct > 10.0:
            s -= (atr_pct - 10.0) * 3.0
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # TREND_HUNTER — Trend Avcısı
    # Mantık: Güçlü momentum takibi. EMA hizası + RSI orta bölge + pozitif momentum.
    # Zayıf trend = giriş değil. Güçlü trend = erken giriş veya devam.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "TREND_HUNTER":
        # Base 38: tipik trend hissesi ~72, güçlü ivme+hacim+kırılım → 95+
        s = 38.0
        # EMA trend hizası temel koşul
        if ema_fast_over_slow:
            s += 15.0
        else:
            s -= 18.0   # Trend yoksa çok düşük skor
        # RSI: 48-72 güçlü trend bölgesi
        if 48 <= rsi <= 72:
            s += 15.0
        elif rsi > 72:
            s += 4.0    # Güçlü ama aşırı uzanmış
        elif rsi < _RSI_NEUTRAL_LOW:
            s -= 15.0   # Trend güçsüz
        # Momentum — trend gücünü ölçer
        if momentum > 10.0:
            s += 22.0   # Güçlü ivme
        elif momentum > _MOMENTUM_HIGH:
            s += 14.0
        elif momentum > 0:
            s += 6.0
        elif momentum < -3.0:
            s -= 20.0   # Trend kırılıyor
        # Hacim teyidi
        if vol_ratio > 1.4:
            s += 12.0
        elif vol_ratio < 0.6:
            s -= 8.0    # Zayıf hacim — trend sağlıklı değil
        # Breakout: trend devamı için güçlü sinyal
        if breakout > 0.5:
            s += 18.0
        # ATR: şişmiş trend dikkat
        if atr_pct > 8.0:
            s -= (atr_pct - 8.0) * 3.0
        # Pattern — düşüş formasyonları trend devamıyla çelişir
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 12.0   # Trend kırılıyor sinyali
            else:
                trend_patterns = [
                    "KANAL", "BAYRAK", "FLAG", "FLAMA", "PENNANT",
                    "DEVAM", "TREND", "BULL",
                    "YÜKSELEN KANAL", "YÜKSELEN ÜÇGEN",
                ]
                if any(x in p_name_upper for x in trend_patterns):
                    s += 20.0 * (effective_pattern_score / 100.0)
                else:
                    s += 12.0 * (effective_pattern_score / 100.0)
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # VALUE_SCOUT — Değer Kaşifi
    # Mantık: Aşırı satılmış ama temel güçlü hisseler. Düşük RSI + istikrar.
    # Sabır gerektirir. Yüksek RSI = pahalı = çekici değil.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "VALUE_SCOUT":
        s = 38.0
        # Düşük RSI = değer fırsatı
        if rsi < 28:
            s += 35.0   # Derin değer bölgesi
        elif rsi < 35:
            s += 22.0
        elif rsi < 42:
            s += 10.0
        elif rsi < 55:
            s += 5.0    # Hafif aşırısatılmış — değer fırsatı başlangıcı
        elif rsi > 75:
            s -= 40.0   # Değer yatırımcısı için pahalı
        elif rsi > 60:
            s -= 20.0   # Artık ucuz değil
        # Düşük volatilite = temelli istikrar
        if atr_pct < 3.0:
            s += 18.0
        elif atr_pct < _ATR_HIGH:
            s += 8.0
        elif atr_pct > 8.0:
            s -= (atr_pct - 8.0) * 4.0
        # Trend: ileride dönecek bekleniyor, şu an yatay/aşağı OK
        if ema_fast_over_slow:
            s += 10.0
        # Momentum: sıfıra yakın (bekleme aşaması)
        if -3.0 <= momentum <= 3.0:
            s += 8.0    # Konsolidasyon
        elif momentum > _MOMENTUM_HIGH:
            s += 5.0
        elif momentum < -10.0:
            s -= 15.0
        # Hacim normal
        if 0.8 <= vol_ratio <= 1.5:
            s += 5.0
        # Pattern: dip formasyonu — bearish formasyon değer tuzağı sinyali
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 8.0    # Tepe formasyonu değer alımını geçersiz kılar
            else:
                value_patterns = [
                    "DESTEK", "DIP", "TABAN",
                    "TERS BAŞ", "ÇIFT DIP", "ÜÇLÜ DIP",
                    "KUPA", "CUP",
                    "DOUBLE", "W PATTERN",
                ]
                if any(x in p_name_upper for x in value_patterns):
                    s += 22.0 * (effective_pattern_score / 100.0)
                else:
                    s += 10.0 * (effective_pattern_score / 100.0)
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # SCALPER — Anlık Fırsatçı
    # Mantık: Kısa süreli ani hareketler. ATR + hacim ani değişimi, hız odaklı.
    # RSI orta bölge ideal; aşırı uçlar tehlikeli.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "SCALPER":
        # Base 32: ani hacim + kırılım olmadan düşük baz; gerçek spike'ta 90+
        s = 32.0
        # Hacim patlaması temel sinyal — olağandışı hacim olmadan scalp fırsatı yok
        if vol_ratio > _VOL_RATIO_HIGH:
            s += 30.0
        elif vol_ratio > 1.8:
            s += 18.0
        elif vol_ratio > 1.3:
            s += 8.0
        elif vol_ratio < 0.7:
            s -= 15.0
        # RSI: 40-65 ideal, uçlar tehlikeli
        if 40 <= rsi <= 65:
            s += 10.0   # 15→10: RSI alone not enough for scalper
        elif rsi > 80:
            s -= 20.0
        elif rsi < 25:
            s -= 15.0
        # Breakout: ani kırılım = scalp giriş noktası
        if breakout > 0.5:
            s += 25.0
        # Momentum: sadece pozitif ani hareket ödüllenir (sistem bullish yön üretir,
        # negatif momentum bonusu yanlış yönde scalp sinyali doğuruyordu)
        if momentum > _MOMENTUM_HIGH:
            s += 12.0
        elif momentum > 2.0:
            s += 6.0
        elif momentum < -_MOMENTUM_HIGH:
            s -= 10.0
        # ATR: aşırı uçlar cezalandırılır, normal aralık bonus vermez
        if atr_pct > _ATR_AGGRESSIVE:
            s -= (atr_pct - 12.0) * 2.0
        elif atr_pct < 1.0:
            s -= 8.0    # Çok düşük ATR = hareket yok
        # Trend: scalper için ikincil
        if ema_fast_over_slow:
            s += 5.0    # 8→5: trend ikincil sinyal
        # Pattern — scalper yönden bağımsız değil, bearish sinyal daha az ödüllenir
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s += 5.0 * (effective_pattern_score / 100.0)   # Minimal — yön olumsuz
            else:
                s += 15.0 * (effective_pattern_score / 100.0)
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # BREAKOUT — Kırılım Dedektörü
    # Mantık: Teknik formasyon kırılımı. Hacim teyitli kırılım + pattern = güçlü sinyal.
    # ─────────────────────────────────────────────────────────────────────────
    elif pn == "BREAKOUT":
        s = 36.0   # 48→36: kırılım olmadan baz çok düşük olmalı
        # Kırılım sinyali temel koşul
        if breakout > 0.5:
            s += 30.0
            if vol_ratio > 1.5:
                s += 15.0   # Hacim teyitli kırılım — en güçlü sinyal
            elif vol_ratio > 1.2:
                s += 8.0
        else:
            s -= 10.0   # Kırılım yoksa bu profil için düşük skor
        # Formasyon tespiti kritik — bearish = aşağı kırılım, yukarı kırılım değil
        if effective_pattern_score > 0:
            if is_bearish_pat:
                s -= 15.0   # Aşağı kırılım sinyali, bu profil yukarı kırılım arar
            else:
                breakout_patterns = [
                    "ÜÇGEN", "UCGEN", "KANAL",
                    "DIRENÇ", "DIRENC", "KIRILIM",
                    "BAYRAK", "FLAG", "FLAMA", "PENNANT",
                    "KUPA", "CUP", "HANDLE",
                    "TAKOZ", "WEDGE",
                    "YÜKSELEN ÜÇGEN", "ALÇALAN ÜÇGEN",
                    "KUTU", "RANGE",
                ]
                if any(x in p_name_upper for x in breakout_patterns):
                    s += 38.0 * (effective_pattern_score / 100.0)
                else:
                    s += 20.0 * (effective_pattern_score / 100.0)
        # RSI: kırılım bölgesinde 50-75 ideal
        if 50 <= rsi <= 75:
            s += 12.0
        elif rsi > 80:
            s -= 10.0   # Kırılım çok geç kalınmış
        elif rsi < 35:
            s -= 8.0
        # Trend teyidi
        if ema_fast_over_slow:
            s += 12.0
        # Momentum kırılımı desteklemeli
        if momentum > _MOMENTUM_HIGH:
            s += 10.0
        elif momentum > 0:
            s += 4.0
        elif momentum < -5.0:
            s -= 12.0
        # ATR — kırılım sonrası hareket için gerekli
        if atr_pct > 10.0:
            s -= (atr_pct - 10.0) * 2.5
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # Bilinmeyen profil → SAFE_HARBOR mantığıyla güvenli skor
    # ─────────────────────────────────────────────────────────────────────────
    else:
        s = 40.0
        if ema_fast_over_slow:
            s += 10.0
        if 40 <= rsi <= 60:
            s += 10.0
        elif rsi > 75:
            s -= 15.0
        s += _apply_macro_adjustments(
            s=s, pn=pn, vix_regime=vix_regime, usdtry_change_5d=usdtry_change_5d,
            bist100_trend_5d=bist100_trend_5d, sector_rel_strength_5d=sector_rel_strength_5d,
            w52_position=w52_position, dist_from_52w_high=dist_from_52w_high,
            volume_zscore=volume_zscore, consecutive_down_days=consecutive_down_days,
            ema_alignment_score=ema_alignment_score, trend_duration_days=trend_duration_days,
            close_position=close_position, ret_acceleration=ret_acceleration,
        )
        return round(float(max(0.0, min(100.0, s))), 2)
