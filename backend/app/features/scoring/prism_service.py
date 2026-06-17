# backend/app/features/scoring/prism_service.py
from __future__ import annotations
import math
import numpy as np
from typing import Dict, Any, Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.shared.ohlcv import MarketDataBundle

from app.features.scoring.yzdsh_rules import rules_score
from app.features.scoring.ml.ml_calib import apply_calibration, get_calibrated_tuning, get_ml_reliability
from app.features.scoring.models import ReasonCode, PrismVerdict, ScoreBreakdown, RiskContext
from app.core.config_profiles import (
    PROFILE_ML_BLEND, PROFILE_TARGET_MULT, PROFILE_ML_THRESHOLD,
    PROFILE_DURATION_DAYS, normalize_profile, OUTLIER_PRICE_THRESHOLD
)
from app.features.scoring.ml.constants import FORMATION_PRED_DAYS

# ── PRISM Config Cache ────────────────────────────────────────────────────────
import logging as _logging
import time as _time

_prism_logger = _logging.getLogger("PivotRadar.PRISM")

_PRISM_CFG_CACHE: Dict[str, Any] = {}
_PRISM_CFG_TS: float = 0.0
_PRISM_CFG_TTL: float = 60.0

_PRISM_CFG_DEFAULTS: Dict[str, Any] = {
    "raw_danger_threshold":    28.0,
    "rsi_heat_shield":         82.0,
    "atr_extreme_threshold":   10.0,
    # Y-1: Bull trap parametreleri güncellendi.
    # Eski: momentum > 2.0 AND vol_ratio < 0.7 → sürekli düşük hacimde de tetikleniyordu.
    # Yeni: momentum > 5.0 AND vol_ratio < 0.5 AND breakout > 0 → kırılımı teyitsiz hacimle satar.
    # Bull trap = yüksek momentum + kırılım sinyali + ama düşük hacim (teyit yok) → şüpheli.
    "bull_trap_momentum_min":   5.0,   # 2.0 → 5.0: çok geniş tetikleme önlendi
    "bull_trap_vol_max":        0.5,   # 0.7 → 0.5: daha belirgin hacim zayıflığı
}
_PRISM_CFG_REQUIRED = set(_PRISM_CFG_DEFAULTS.keys())


def _validate_prism_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    missing = _PRISM_CFG_REQUIRED - cfg.keys()
    if missing:
        _prism_logger.warning("PRISM config missing keys %s — using defaults", missing)
        cfg = {**_PRISM_CFG_DEFAULTS, **cfg}
    for k, v in cfg.items():
        if k in _PRISM_CFG_DEFAULTS and not isinstance(v, (int, float)):
            _prism_logger.warning("PRISM config key %r has non-numeric value %r — using default", k, v)
            cfg[k] = _PRISM_CFG_DEFAULTS[k]
    return cfg


def _get_prism_config() -> Dict[str, Any]:
    global _PRISM_CFG_CACHE, _PRISM_CFG_TS
    now = _time.time()
    if now - _PRISM_CFG_TS < _PRISM_CFG_TTL and _PRISM_CFG_CACHE:
        return _PRISM_CFG_CACHE
    try:
        from app.core.database import SessionLocal
        from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
        db = SessionLocal()
        try:
            cfg = get_system_setting(db, "prism_config", DEFAULT_SETTINGS["prism_config"])
        finally:
            db.close()
    except Exception:
        cfg = dict(_PRISM_CFG_DEFAULTS)
    cfg = _validate_prism_config(cfg)
    _PRISM_CFG_CACHE = cfg
    _PRISM_CFG_TS = now
    return cfg

# ── Stop-loss ATR katsayıları (profil başına) ────────────────────────────────
# Her profil farklı risk toleransı taşıdığından stop mesafesi de farklıdır.
# SCALPER: çok dar (hızlı çıkış), AGGRESSIVE: geniş (volatiliteye alan tanı).
_PROFILE_STOP_MULT: Dict[str, float] = {
    "SAFE_HARBOR":  0.8,
    "AGGRESSIVE":   1.5,
    "REVERSAL":     1.0,
    "TREND_HUNTER": 1.2,
    "VALUE_SCOUT":  1.0,
    "SCALPER":      0.5,
    "BREAKOUT":     1.2,
}

# Profil başına minimum kabul edilebilir R:R oranı.
# Bu eşiğin altında sinyal kalitesizdir → direction neutral'e düşürülür.
_MIN_RR: Dict[str, float] = {
    "SAFE_HARBOR":  1.2,   # target_mult=1.2, stop_mult=0.8 → max R:R ≈ 1.5; keep headroom
    "AGGRESSIVE":   1.5,
    "REVERSAL":     1.5,
    "TREND_HUNTER": 1.5,
    "VALUE_SCOUT":  1.5,   # target_mult=2.0, stop_mult=1.0 → max R:R = 2.0
    "SCALPER":      1.2,
    "BREAKOUT":     1.5,
}


class UnifiedPRISM:
    """
    Unified Decision Engine for PivotRadar.
    V12 - Stop-Loss + R:R Filter + Composite Confidence Score.

    METHODOLOGY (Glass Box):
    1. Technical Baseline: Rules-based score (0-100) from indicators (RSI, EMA, ATR).
    2. AI Blending: Shrinkage-based blending of ML scores with technicals.
       - ml_trust: Reliability of ML based on profile and score range.
       - neutral_prior: Shrinks ML scores towards 50 to avoid over-confidence.
    3. Iron Fist Veto: Hard caps applied if ML or technicals indicate extreme danger.
    4. Risk Audit: Dynamic penalties for RSI exhaustion, Bull Traps, and High Volatility.
    5. Liquidity Guard: Final filter for volume and extreme price outliers.
    6. Stop-Loss & R:R: ATR-based stop, risk/reward filter (new in V12).
    7. Composite Confidence: rule conviction + ML trust + macro magnitude.
    """

    @staticmethod
    def evaluate(
        indicators: Dict[str, Any],
        ml_score: Optional[float],
        profile_name: str,
        symbol: str = "TICKER",
        df: Optional[Any] = None,
        bundle: Optional["MarketDataBundle"] = None
    ) -> Dict[str, Any]:
        """
        Computes a consistent verdict for a stock.
        """
        pn = normalize_profile(profile_name)

        # Log unknown profiles to help diagnose misconfiguration
        if pn == "SAFE_HARBOR" and profile_name and profile_name.strip().upper() not in ("SAFE_HARBOR", "GÜVENLİ LİMAN", "GUVENLI LIMAN"):
            import logging as _log
            _log.getLogger(__name__).debug(
                "normalize_profile: '%s' unknown → fallback SAFE_HARBOR", profile_name
            )

        ml_blend      = PROFILE_ML_BLEND.get(pn, 0.40)

        # F-3: Rejim-farkındalıklı ML blend.
        # market_regime: 1=bull, 0=sideways, -1=bear (global sinyal motorundan gelir)
        # Bear rejimde ML daha belirsiz → blend %10 azalt (kural motoru daha ağır)
        # Bull rejimde ML güvenilir    → blend %10 artır (ML sinyali öne çıkar)
        _regime = int(indicators.get("market_regime") or 0)
        if _regime == 1:
            ml_blend = min(0.60, ml_blend + 0.10)  # bull: ML ağırlığını artır
        elif _regime == -1:
            ml_blend = max(0.20, ml_blend - 0.10)  # bear: kural motoruna güven

        target_mult_base = PROFILE_TARGET_MULT.get(pn, 2.0)

        def _safe_float(v, default: float) -> float:
            try:
                f = float(v)
                return default if (math.isnan(f) or math.isinf(f)) else f
            except (TypeError, ValueError):
                return default

        rsi_val = indicators.get("rsi_val")
        if rsi_val is None and indicators.get("rsi"):
            r_list = indicators["rsi"]
            rsi_val = r_list[-1] if isinstance(r_list, list) and r_list else None

        rsi       = _safe_float(rsi_val, 50.0)
        trend     = bool(indicators.get("trend", False))
        atr_pct   = _safe_float(indicators.get("atr_pct"), 2.0)
        vol_ratio = _safe_float(indicators.get("vol_ratio"), 1.0)
        close_price = _safe_float(indicators.get("close"), 0.0)
        
        # Event-driven profillerde ML blend baskılama.
        # ML modeli tarihsel "güçlü trend = iyi" örüntüsünü öğrendi.
        # Dönüş/kırılım/scalp profilleri için o profilin core koşulu yoksa
        # ML sinyali yanıltıcı olur ve trending hisseleri yanlış zirveye taşır.
        _ind_breakout = float(indicators.get("breakout", 0.0))
        _ind_pat_score = float(indicators.get("pattern_score", 0.0))
        if pn == "REVERSAL" and rsi > 50:
            ml_blend = min(ml_blend, 0.15)
        elif pn == "BREAKOUT" and _ind_breakout < 0.15 and _ind_pat_score < 15:
            ml_blend = min(ml_blend, 0.15)
        elif pn == "SCALPER" and vol_ratio < 1.4:
            ml_blend = min(ml_blend, 0.15)

        tuning = get_calibrated_tuning(profile_name)
        target_mult = target_mult_base * tuning.get("target_mult_adjustment", 1.0)

        # 1. Technical Baseline
        raw_rules = rules_score(
            rsi=rsi,
            ema_fast_over_slow=trend,
            atr_pct=atr_pct,
            vol_ratio=vol_ratio,
            profile_name=profile_name,
            breakout=indicators.get("breakout", 0.0),
            momentum=indicators.get("momentum", 0.0),
            pattern_score=indicators.get("pattern_score", 0.0),
            pattern_name=indicators.get("pattern_name"),
            pattern_formed_bars_ago=int(indicators.get("pattern_formed_bars_ago") or 0),
            pattern_is_stale=bool(indicators.get("pattern_is_stale") or False),
            close_price=close_price,
            # Extended macro + technical signals (neutral defaults for old callers)
            vix_regime=int(indicators.get("vix_regime") or 0),
            usdtry_change_5d=float(indicators.get("usdtry_change_5d") or 0.0),
            bist100_trend_5d=float(indicators.get("bist100_trend_5d") or 0.0),
            sector_rel_strength_5d=float(indicators.get("sector_rel_strength_5d") or 0.0),
            w52_position=float(indicators.get("w52_position") or 0.5),
            dist_from_52w_high=float(indicators.get("dist_from_52w_high") or 0.0),
            volume_zscore=float(indicators.get("volume_zscore") or 0.0),
            consecutive_down_days=int(indicators.get("consecutive_down_days") or 0),
            ema_alignment_score=int(indicators.get("ema_alignment_score") or 0),
            trend_duration_days=int(indicators.get("trend_duration_days") or 0),
            close_position=float(indicators.get("close_position") or 0.5),
            ret_acceleration=float(indicators.get("ret_acceleration") or 0.0),
        )

        pcfg = _get_prism_config()
        _raw_danger_thr   = float(pcfg.get("raw_danger_threshold",     28.0))
        _rsi_heat         = float(pcfg.get("rsi_heat_shield",          82.0))
        _atr_extreme      = float(pcfg.get("atr_extreme_threshold",    10.0))
        _bt_mom_min       = float(pcfg.get("bull_trap_momentum_min",    2.0))
        _bt_vol_max       = float(pcfg.get("bull_trap_vol_max",         0.7))
        _zero_liq_thr     = float(pcfg.get("zero_liquidity_threshold",  0.05))

        signals = []
        reason_codes: List[ReasonCode] = []
        is_divergent = False
        
        factors = {
            "technical_base": round(raw_rules, 2),
            "ml_impact": 0.0,
            "risk_penalty": 0.0,
            "system_override": 0.0
        }

        # Signal collection
        if rsi < 30: 
            signals.append({"key": "oversold_confirmed", "val": rsi})
            reason_codes.append(ReasonCode.OVERSOLD)
        elif rsi > 70: 
            signals.append({"key": "overbought_exhaustion", "val": rsi})
            reason_codes.append(ReasonCode.OVERBOUGHT)

        if trend: reason_codes.append(ReasonCode.EMA_BULLISH)
        else: reason_codes.append(ReasonCode.EMA_BEARISH)

        if vol_ratio > 1.5: 
            signals.append({"key": "volume_pulse", "val": vol_ratio})
            reason_codes.append(ReasonCode.VOL_PULSE)

        # 2. AI Blending & Shrinkage
        # ml_score None veya Exception → rules-only fallback (ml_blend=0 gibi davranır)
        qrs = raw_rules
        if ml_score is not None:
            try:
                ml_score = float(ml_score)
                if not (0.0 <= ml_score <= 100.0):
                    raise ValueError(f"ML score out of range: {ml_score}")
            except (TypeError, ValueError):
                ml_score = None  # corrupt/invalid ML output → rules-only
        if ml_score is not None:
            ml_trust = get_ml_reliability(profile_name, ml_score)
            raw_ml = float(ml_score)
            is_raw_danger = (raw_ml < _raw_danger_thr)

            # Shrinkage towards neutral (50).
            # Floor at 0.5: en düşük trust'ta bile sinyalin yarısı korunur.
            # ml_trust=0.2 → %80 baskılama yerine %50 → gerçek sinyal kaybolmaz.
            neutral_prior = 50.0
            _effective_trust = max(ml_trust, 0.5)
            adjusted_ml = neutral_prior + (raw_ml - neutral_prior) * _effective_trust

            # ML Blend
            blended_qrs = (ml_blend * adjusted_ml) + ((1 - ml_blend) * raw_rules)
            factors["ml_impact"] = round(blended_qrs - raw_rules, 2)
            qrs = blended_qrs

            # Veto logic
            pre_veto_qrs = qrs
            if is_raw_danger or adjusted_ml < 35.0:
                if pn == "SAFE_HARBOR":
                    # 48: ML güvensiz olduğunda hâlâ "neutral" bölgede bırakır;
                    # 40 çok katıydı — geçerli sinyaller neutral'e düşüyordu.
                    qrs = min(qrs, 48.0)
                    reason_codes.append(ReasonCode.SAFE_HARBOR_VETO)
                    is_divergent = True
                elif pn in ("VALUE_SCOUT", "TREND_HUNTER"):
                    qrs = min(qrs, 50.0)
                    reason_codes.append(ReasonCode.SAFE_HARBOR_VETO)
                    is_divergent = True
                else:
                    qrs = min(qrs, 55.0)
                    reason_codes.append(ReasonCode.ML_VETO)
                    is_divergent = True
            
            # Bearish Caps
            if adjusted_ml < 50.0:
                if pn == "SAFE_HARBOR" and qrs > 55.0:
                    qrs = 55.0
                    reason_codes.append(ReasonCode.SAFE_HARBOR_CAP)
                elif pn == "VALUE_SCOUT" and qrs > 68.0:
                    qrs = 68.0
                    reason_codes.append(ReasonCode.VALUE_SCOUT_CAP)
            
            factors["system_override"] += round(qrs - pre_veto_qrs, 2)
                
            if ml_trust < 0.3:
                reason_codes.append(ReasonCode.STALE_DATA_SHRINKAGE)

        # 3. Risk Audit
        risk_pre = qrs
        if rsi >= _rsi_heat:
            heat_penalty = (rsi - (_rsi_heat - 2.0)) * 1.5
            if vol_ratio > 1.5: heat_penalty *= 0.5
            qrs -= heat_penalty
            reason_codes.append(ReasonCode.RISK_HEAT_SHIELD)

        mom_val = indicators.get("momentum", 0)
        # Y-1: Gerçek bull trap = YÜKSEK momentum + YÜKSEK hacim + overbought RSI.
        # Durum: fiyat coşkuyla yükseldi, kalabalık girdi, ama artık dönüş yakın.
        # vol_ratio > 1.5 (hacim zirve) + mom > 5 (güçlü momentum) + RSI > 72 (aşırı alım)
        # Eski kod: vol_ratio < 0.5 → düşük hacimli kırılım cezalandırıyordu (yanlış).
        if mom_val > _bt_mom_min and vol_ratio > 1.5 and rsi > 72:
            qrs -= 12.0
            reason_codes.append(ReasonCode.RISK_BULL_TRAP)

        if atr_pct > _atr_extreme:
            vol_penalty = (atr_pct - _atr_extreme) * 5.0
            qrs -= vol_penalty
            reason_codes.append(ReasonCode.RISK_EXTREME_VOLATILITY)
        
        factors["risk_penalty"] = round(qrs - risk_pre, 2)

        # 4. Liquidity & Safe Mode
        liquidity_pre = qrs
        if vol_ratio <= _zero_liq_thr:
            qrs = min(qrs, 15.0)
            reason_codes.append(ReasonCode.VETO_ZERO_LIQUIDITY)
        
        # Outlier catch-all (backup for universe filter)
        if close_price > OUTLIER_PRICE_THRESHOLD:
            qrs = min(qrs, 10.0)
            reason_codes.append(ReasonCode.VETO_INSTITUTIONAL_OUTLIER)
        
        factors["risk_penalty"] += round(qrs - liquidity_pre, 2)

        # Self-Heal / Safe Mode
        # 24.6 / 38.1 / 50.0 are degenerate model outputs that indicate a broken or
        # uninitialized model (seed model defaults or calibration collapse).
        # These are filtered from training in training.py and treated as untrusted here.
        _DEGENERATE_ML_SCORES = {24.6, 38.1, 50.0}
        is_brain_dead = ml_score is not None and any(abs(ml_score - d) < 0.01 for d in _DEGENERATE_ML_SCORES)
        ml_trust_val = ml_trust if ml_score is not None else 1.0
        if ml_trust_val < 0.15 or is_brain_dead:
            pre_heal = qrs
            qrs = raw_rules * 0.90
            reason_codes.append(ReasonCode.SYSTEM_SAFE_MODE)
            factors["system_override"] += round(qrs - pre_heal, 2)

        # Dividend window & split filter
        if symbol:
            try:
                from app.features.market_data.data.yf_client import get_upcoming_dividend, has_recent_split
                _sym_yf = symbol if symbol.endswith(".IS") else f"{symbol}.IS"
                if get_upcoming_dividend(_sym_yf, window_days=2):
                    # O-3+Y-1 analiz düzeltmesi: BIST ortalama temettü yield %2-4.
                    # -15 aşırı; temettü arbitrajı penceresi aslında ALIM fırsatı olabilir.
                    # 2 günlük pencere (ex-date - 1 gün) daha hassas. Ceza -7 puan.
                    reason_codes.append(ReasonCode.DIVIDEND_WINDOW)  # O-5: enum
                    qrs = max(0.0, qrs - 7.0)
                    # direction ve target_price KORUNUYOR — ex-date öncesi pozisyon bilgilendirici
                if has_recent_split(_sym_yf, lookback_days=30):
                    reason_codes.append(ReasonCode.RECENT_SPLIT)  # O-5: enum kullan
                    qrs = max(0.0, qrs - 10.0)
            except Exception:
                pass

        # Profile-specific relevance caps.
        # Profilin core koşulunu taşımayan hisse bu profil listesinde üst sıralara
        # çıkmamalı. Cap değerleri QRS>70 filtresi altında kalacak şekilde ayarlandı:
        # trending bir hisse REVERSAL listesinde 62 puanla görünür ama TOP'a çıkmaz.
        _trend_dur = int(indicators.get("trend_duration_days") or 0)
        if pn == "REVERSAL" and rsi > 52:
            # Trende devam eden hisse dönüş sinyali değil
            qrs = min(qrs, 62.0)
            if ReasonCode.PROFILE_CONDITION_WEAK not in reason_codes:
                reason_codes.append(ReasonCode.PROFILE_CONDITION_WEAK)
        elif pn == "BREAKOUT" and _ind_breakout < 0.15 and _ind_pat_score < 15:
            # Kırılım veya formasyon yoksa kırılım dedektörü için anlamsız
            qrs = min(qrs, 58.0)
            if ReasonCode.PROFILE_CONDITION_WEAK not in reason_codes:
                reason_codes.append(ReasonCode.PROFILE_CONDITION_WEAK)
        elif pn == "SCALPER" and vol_ratio < 1.4:
            # Hacim spike yoksa anlık fırsatçı için uygun değil
            qrs = min(qrs, 55.0)
            if ReasonCode.PROFILE_CONDITION_WEAK not in reason_codes:
                reason_codes.append(ReasonCode.PROFILE_CONDITION_WEAK)
        elif pn == "VALUE_SCOUT" and rsi > 68:
            # RSI yüksekse değer fırsatı değil, trend hissesi (eşik 62→68)
            qrs = min(qrs, 65.0)
            if ReasonCode.PROFILE_CONDITION_WEAK not in reason_codes:
                reason_codes.append(ReasonCode.PROFILE_CONDITION_WEAK)
        elif pn == "TREND_HUNTER" and (not trend or _trend_dur < 3):
            # Trend yok ya da çok yeni — trend takipçisi için erken veya hatalı
            qrs = min(qrs, 55.0)
            if ReasonCode.PROFILE_CONDITION_WEAK not in reason_codes:
                reason_codes.append(ReasonCode.PROFILE_CONDITION_WEAK)

        # Final Rounding
        qrs = round(float(max(0.0, min(100.0, qrs))), 2)

        # 5. Projections
        direction = "neutral"
        if qrs >= 65: direction = "bullish"
        elif qrs <= 35: direction = "bearish"

        # Force neutral if high danger
        if (ReasonCode.SYSTEM_SAFE_MODE in reason_codes or ReasonCode.ML_VETO in reason_codes) and direction == "bullish":
            direction = "neutral"

        atr_abs = close_price * (atr_pct / 100.0) if close_price else (close_price * 0.02)
        dur_min, dur_max = PROFILE_DURATION_DAYS.get(pn, (5, 45))
        raw_duration = max(5, int(10.0 / max(atr_pct, 0.5)))
        # V10: formasyon tipine göre pencere — ATR bazlı flat formülden daha doğru
        _pname = (indicators.get("pattern_name") or "").strip()
        if _pname in FORMATION_PRED_DAYS:
            _f_min, _f_max = FORMATION_PRED_DAYS[_pname]
            # Profil sınırlarıyla kesişim: her iki kısıtı da tatmin et
            raw_duration = (_f_min + _f_max) // 2
            dur_min = max(dur_min, _f_min)
            dur_max = min(dur_max, _f_max) if dur_max > _f_min else _f_max
        duration_days = max(dur_min, min(dur_max, raw_duration))

        target_price = None
        stop_price = None
        risk_reward = None

        if direction in ("bullish", "bearish") and close_price > 0:
            stop_mult = _PROFILE_STOP_MULT.get(pn, 1.0)
            min_rr    = _MIN_RR.get(pn, 1.5)

            if direction == "bullish":
                target_price = round(close_price + (atr_abs * target_mult), 2)
                stop_price   = round(close_price - (atr_abs * stop_mult), 2)
                upside   = target_price - close_price
                downside = close_price - stop_price
                if downside > 0:
                    risk_reward = round(upside / downside, 2)
            else:  # bearish
                target_price = round(close_price - (atr_abs * target_mult), 2)
                stop_price   = round(close_price + (atr_abs * stop_mult), 2)
                downside = close_price - target_price
                upside   = stop_price  - close_price
                if upside > 0:
                    risk_reward = round(downside / upside, 2)

            # R:R filtresi: yetersiz ödül/risk oranı → neutral yönlendirme
            # O-4: target/stop fiyatları korunuyor (UX için bilgilendirici); direction=neutral.
            # Önceden target_price=None yapılıyordu → kullanıcı neden neutral göremiyordu.
            if risk_reward is not None and risk_reward < min_rr:
                direction = "neutral"
                reason_codes.append(ReasonCode.POOR_RISK_REWARD)
                # target_price ve stop_price bilgi amaçlı bırakılıyor (silinmiyor)
        
        # 6. Archetyping
        _breakout = indicators.get("breakout", 0)
        _momentum = indicators.get("momentum", 0)
        if direction == "bullish":
            if qrs > 80:
                archetype = "ALPHA_LEADER"
            elif pn == "REVERSAL" and rsi < 35:
                archetype = "REVERSAL_SETUP"
            elif pn == "BREAKOUT" and _breakout > 0.5:
                archetype = "BREAKOUT_SIGNAL"
            elif pn == "TREND_HUNTER" and _momentum > 5:
                archetype = "TREND_CONTINUATION"
            elif pn == "SCALPER" and vol_ratio > 2.0:
                archetype = "VOLUME_SPIKE"
            elif pn == "VALUE_SCOUT" and rsi < 35:
                archetype = "DEEP_VALUE"
            elif pn == "AGGRESSIVE" and _momentum > 8:
                archetype = "MOMENTUM_SURGE"
            elif pn == "SAFE_HARBOR":
                archetype = "DEFENSIVE_SIGNAL"
            else:
                archetype = "BULLISH_SETUP"
        elif direction == "bearish":
            if qrs < 25:
                archetype = "PANIC_DISTRIBUTION"
            else:
                archetype = "BEARISH_SIGNAL"
        else:
            archetype = "CONSOLIDATION"

        # 7. Quality Metadata
        _label_map = {
            "SAFE_HARBOR":  ("Güvenli Bölge",  "Güçlü Korumalı Sinyal",  "Güçlü Teknik Görünüm",  "Düşük Güven / Bekle"),
            "AGGRESSIVE":   ("Nötr / Bekle",   "Momentum Sinyali",        "Güçlü Momentum Sinyali", "Düşük ML / Dikkat"),
            "TREND_HUNTER": ("Trend Yok",      "Trend Devam Sinyali",     "Güçlü Trend Sinyali",    "Düşük Güven"),
            "REVERSAL":     ("Düşük Momentum", "Dönüş Sinyali",           "Güçlü Dönüş Sinyali",    "Düşük Güven"),
            "VALUE_SCOUT":  ("Nötr",           "Değer Momentum Sinyali",  "Güçlü Değer Sinyali",    "Düşük Güven"),
            "SCALPER":      ("Nötr / Bekle",   "Kısa Vadeli Sinyal",      "Güçlü Kısa Vadeli Sinyal","Düşük Güven"),
            "BREAKOUT":     ("Kırılım Yok",    "Kırılım Sinyali",         "Güçlü Kırılım Sinyali",  "Düşük Güven"),
        }
        _lbl = _label_map.get(pn, ("Nötr", "Pozitif Momentum Sinyali", "Güçlü Teknik Sinyal", "Düşük ML Güveni"))
        if is_divergent: label = _lbl[3]
        elif qrs >= 75: label = _lbl[2]
        elif qrs >= 60: label = _lbl[1]
        else: label = _lbl[0]

        # 8. Explanation Contract [FAZ 5]
        breakdown = ScoreBreakdown(
            technical=factors["technical_base"],
            ml_impact=factors["ml_impact"],
            risk_penalty=factors["risk_penalty"] + factors["system_override"],
            final_score=qrs
        )
        
        ml_trust_val = ml_trust if ml_score is not None else 0.8

        # Bileşik güven skoru: QRS + kural + ML + makro.
        # QRS conviction en büyük ağırlık: yüksek/düşük QRS zaten güçlü/zayıf sinyal demek.
        # confidence_score QRS'e kilitli → kullanıcıya çelişkili sinyal gönderilmez.
        _qrs_conviction    = abs(qrs - 50.0) / 50.0                 # 0-1 (QRS 50'den ne kadar uzak)
        _rule_conviction   = abs(raw_rules - 50.0) / 50.0           # 0-1
        _ml_conviction     = ml_trust_val                            # 0-1
        _macro_adj_abs     = abs(indicators.get("usdtry_change_5d") or 0.0)
        _macro_magnitude   = min(1.0, _macro_adj_abs / 10.0)        # 0-1 (10% = max)
        _composite         = (
            0.35 * _qrs_conviction +
            0.25 * _rule_conviction +
            0.25 * _ml_conviction +
            0.15 * _macro_magnitude
        ) * 100.0
        if bundle and bundle.is_stale:
            _composite *= 0.6
        confidence_score = round(max(5.0, min(100.0, _composite)), 1)
            
        context = RiskContext(
            is_divergent=is_divergent,
            safety_valves=reason_codes,
            data_quality=bundle.quality_flag if bundle else "NORMAL",
            provenance=bundle.source if bundle else "unknown"
        )

        # Half-Kelly position sizing using profile win_rate from ml_performance_stats.
        # Kelly criterion: f = (win_rate * rr - (1 - win_rate)) / rr
        # Half-Kelly (50% of full Kelly) reduces variance for real portfolios.
        # Bounded to [1%, 25%] to prevent extremes.
        # Y-3: sample_count < 50 ise win_rate güvenilmez → position_size_pct = None.
        position_size_pct: Optional[float] = None
        _kelly_sample_count = tuning.get("sample_count") or 0
        if direction in ("bullish", "bearish") and risk_reward and risk_reward > 0:
            if _kelly_sample_count < 50:
                # Yeterli örnek yok — Kelly kriteri güvenilmez; position size önerilmez.
                position_size_pct = None
            else:
                _kelly_win_rate = tuning.get("hit_rate") or 0.0
                if _kelly_win_rate < 0.05:
                    pass  # hit_rate < %5: istatistiksel güven yok, position_size_pct = None kalır
                else:
                    _full_kelly = (_kelly_win_rate * risk_reward - (1.0 - _kelly_win_rate)) / risk_reward
                    _half_kelly = _full_kelly * 0.5
                    if _half_kelly > 0:
                        position_size_pct = round(max(1.0, min(25.0, _half_kelly * 100.0)), 1)

        verdict = PrismVerdict(
            qrs=qrs,
            direction=direction,
            target_price=target_price,
            stop_price=stop_price,
            risk_reward=risk_reward,
            position_size_pct=position_size_pct,
            predicted_days=duration_days,
            quality_label=label,
            confidence_score=confidence_score,
            score_breakdown=breakdown,
            risk_context=context,
            reason_codes=reason_codes,
            signals=signals,
            archetype=archetype,
            data_source=bundle.source if bundle else "unknown",
            is_divergent=is_divergent
        )

        return verdict.model_dump()
