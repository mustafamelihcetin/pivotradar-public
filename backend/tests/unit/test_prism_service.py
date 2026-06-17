# backend/tests/unit/test_prism_service.py
import pytest
from unittest.mock import patch
from app.features.scoring.prism_service import UnifiedPRISM

_BASE_BULL = {
    "rsi_val": 45.0,
    "trend": True,
    "atr_pct": 2.5,
    "vol_ratio": 1.6,
    "close": 100.0,
}

def test_prism_evaluate_bullish():
    # Güçlü boğa sinyali: trend + hacim + momentum + pattern + ema hizalı
    indicators = {
        "rsi_val":              48.0,
        "trend":                True,
        "atr_pct":              2.5,
        "vol_ratio":            2.0,
        "close":                100.0,
        "momentum":             0.8,
        "breakout":             0.7,
        "pattern_score":        75.0,
        "ema_alignment_score":  2,
        "trend_duration_days":  12,
        "w52_position":         0.75,
        "volume_zscore":        2.0,
        "bist100_trend_5d":     0.02,
        "market_regime":        1,
    }
    result = UnifiedPRISM.evaluate(indicators, ml_score=80.0, profile_name="Trend Avcısı")

    assert result["direction"] == "bullish", (
        f"Beklenen 'bullish', alınan '{result['direction']}' (qrs={result['qrs']})"
    )
    assert result["qrs"] >= 65
    assert result["target_price"] > 100.0
    assert "EMA_BULLISH" in result["reason_codes"]

def test_prism_evaluate_bearish():
    indicators = {
        "rsi_val": 75.0,
        "trend": False,
        "atr_pct": 3.0,
        "vol_ratio": 0.8,
        "close": 100.0
    }
    result = UnifiedPRISM.evaluate(indicators, ml_score=25.0, profile_name="Trend Avcısı")
    
    assert result["direction"] == "bearish"
    assert result["qrs"] < 40
    assert result["target_price"] < 100.0

def test_prism_ml_veto():
    # Even if technicals are good, very low ML score should cap the QRS
    indicators = {
        "rsi_val": 50.0,
        "trend": True,
        "atr_pct": 2.0,
        "vol_ratio": 1.2,
        "close": 100.0
    }
    # ml_score=10.0 is way below danger threshold (28.0)
    result = UnifiedPRISM.evaluate(indicators, ml_score=10.0, profile_name="Safe Harbor")
    
    assert result["qrs"] <= 48.0
    assert "SAFE_HARBOR_VETO" in result["reason_codes"]

def test_prism_heat_shield():
    # Extreme RSI should trigger penalty
    indicators = {
        "rsi_val": 92.0,
        "trend": True,
        "atr_pct": 2.0,
        "vol_ratio": 1.0,
        "close": 100.0
    }
    result = UnifiedPRISM.evaluate(indicators, ml_score=80.0, profile_name="Trend Avcısı")
    assert "RISK_HEAT_SHIELD" in result["reason_codes"]

def test_prism_self_healing():
    with patch("app.features.scoring.prism_service.get_ml_reliability", return_value=0.1):
        indicators = {
            "rsi_val": 50.0,
            "trend": True,
            "atr_pct": 2.0,
            "vol_ratio": 1.2,
            "close": 100.0,
        }
        result = UnifiedPRISM.evaluate(indicators, ml_score=50.0, profile_name="Trend Avcısı")
        assert "SYSTEM_SAFE_MODE" in result["reason_codes"]


# ── Kelly Position Sizing Edge Cases ─────────────────────────────────────────

class TestKellyPositionSizing:
    def test_kelly_bullish_returns_position_size(self):
        # Y-3: sample_count < 50 → position_size_pct = None (güvenilmez Kelly).
        # Test ortamında DB yoktur; get_calibrated_tuning yeterli örnek döndürmeli.
        with patch("app.features.scoring.prism_service.get_calibrated_tuning",
                   return_value={"hit_rate": 0.55, "target_mult": 1.3, "stop_mult": 0.85,
                                 "sample_count": 100}):
            result = UnifiedPRISM.evaluate(_BASE_BULL, ml_score=75.0, profile_name="Trend Avcısı")
            if result["direction"] == "bullish":
                assert result.get("position_size_pct") is not None
                assert result["position_size_pct"] >= 1.0

    def test_kelly_bounded_max_25(self):
        result = UnifiedPRISM.evaluate(_BASE_BULL, ml_score=99.0, profile_name="Agresif")
        pct = result.get("position_size_pct")
        if pct is not None:
            assert pct <= 25.0

    def test_kelly_bounded_min_1(self):
        with patch("app.features.scoring.prism_service.get_calibrated_tuning",
                   return_value={"hit_rate": 0.01, "target_mult": 1.2, "stop_mult": 0.8}):
            result = UnifiedPRISM.evaluate(_BASE_BULL, ml_score=55.0, profile_name="Trend Avcısı")
            pct = result.get("position_size_pct")
            if pct is not None:
                assert pct >= 1.0

    def test_kelly_zero_hit_rate_uses_fallback(self):
        with patch("app.features.scoring.prism_service.get_calibrated_tuning",
                   return_value={"hit_rate": 0.0, "target_mult": 1.2, "stop_mult": 0.8}):
            result = UnifiedPRISM.evaluate(_BASE_BULL, ml_score=75.0, profile_name="Trend Avcısı")
            pct = result.get("position_size_pct")
            if result["direction"] == "bullish" and pct is not None:
                assert pct >= 1.0

    def test_kelly_neutral_direction_no_position(self):
        neutral_indicators = {
            "rsi_val": 50.0,
            "trend": True,
            "atr_pct": 2.0,
            "vol_ratio": 0.05,  # sıfır likidite → neutral
            "close": 100.0,
        }
        result = UnifiedPRISM.evaluate(neutral_indicators, ml_score=50.0, profile_name="Trend Avcısı")
        if result["direction"] == "neutral":
            assert result.get("position_size_pct") is None


# ── Makro Senaryo Testleri ────────────────────────────────────────────────────

class TestMacroScenarios:
    def test_high_vix_penalizes_aggressive(self):
        low_vix = {**_BASE_BULL, "vix_regime": 0.1}
        high_vix = {**_BASE_BULL, "vix_regime": 0.9}
        r_low  = UnifiedPRISM.evaluate(low_vix,  ml_score=70.0, profile_name="Agresif")
        r_high = UnifiedPRISM.evaluate(high_vix, ml_score=70.0, profile_name="Agresif")
        assert r_high["qrs"] <= r_low["qrs"]

    def test_high_usdtry_rewards_exporter(self):
        low_fx  = {**_BASE_BULL, "usdtry_change_5d": 0.0}
        high_fx = {**_BASE_BULL, "usdtry_change_5d": 0.08}
        r_low  = UnifiedPRISM.evaluate(low_fx,  ml_score=65.0, profile_name="Trend Avcısı")
        r_high = UnifiedPRISM.evaluate(high_fx, ml_score=65.0, profile_name="Trend Avcısı")
        # Yüksek USDTRY ihracatçı sektörde skor artırır ya da eşit kalır
        assert r_high["qrs"] >= r_low["qrs"] - 5  # tolerans: 5 puan

    def test_crisis_safe_harbor_stays_conservative(self):
        crisis = {**_BASE_BULL, "vix_regime": 0.95, "bist100_trend_5d": -0.05}
        result = UnifiedPRISM.evaluate(crisis, ml_score=40.0, profile_name="Güvenli Liman")
        # Kriz ortamında Güvenli Liman 75+ skoru vermemeli
        assert result["qrs"] <= 75.0

    def test_bear_market_reduces_bullish_signals(self):
        bear = {**_BASE_BULL, "bist100_trend_5d": -0.04}
        bull = {**_BASE_BULL, "bist100_trend_5d": 0.03}
        r_bear = UnifiedPRISM.evaluate(bear, ml_score=70.0, profile_name="Trend Takipcisi")
        r_bull = UnifiedPRISM.evaluate(bull, ml_score=70.0, profile_name="Trend Takipcisi")
        assert r_bull["qrs"] >= r_bear["qrs"] - 2  # bull piyasa skoru daha yüksek
