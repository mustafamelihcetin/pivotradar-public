# backend/tests/unit/test_scoring_snapshot.py
"""
Golden tests — UnifiedPRISM davranışını kilitler.
Kalibrasyon veya kural değişirse bu testler ilk uyarıyı verir.

Gerçek dönüş anahtarları (prism_service.py evaluate() çıktısından):
  qrs, direction, target_price, predicted_days,
  quality_label, is_divergent, reasons (list), veto_reasons (str|None),
  signals, archetype, tuning_meta
"""
import pytest
from app.features.scoring.prism_service import UnifiedPRISM


# ── Sabit test vektörleri ────────────────────────────────────────────────────
BULL_INDICATORS = {
    "rsi_val":       58.3,
    "trend":         True,
    "atr_pct":       2.1,
    "vol_ratio":     1.8,
    "breakout":      0.6,
    "momentum":      1.2,
    "pattern_name":  "Yükselen Üçgen",
    "pattern_score": 72.0,
    "close":         45.5,
    "volume":        5_000_000,
}

BEAR_INDICATORS = {
    "rsi_val":       72.0,
    "trend":         False,
    "atr_pct":       3.5,
    "vol_ratio":     0.5,
    "breakout":      0.0,
    "momentum":      0.3,
    "pattern_name":  None,
    "pattern_score": 0.0,
    "close":         120.0,
    "volume":        1_000_000,
}

WEAK_INDICATORS = {
    "rsi_val":       50.0,
    "trend":         False,
    "atr_pct":       2.0,
    "vol_ratio":     1.0,
    "breakout":      0.0,
    "momentum":      0.0,
    "pattern_name":  None,
    "pattern_score": 0.0,
    "close":         20.0,
    "volume":        500_000,
}


class TestPrismOutputKeys:
    """Çıktı sözlüğü beklenen anahtarları içermeli."""

    def test_required_keys_present(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=70.0, profile_name="Güvenli Liman")
        required_keys = (
            "qrs", "direction", "target_price", "predicted_days",
            "quality_label", "confidence_score", "score_breakdown", 
            "risk_context", "reason_codes", "signals", "archetype", "data_source"
        )
        for key in required_keys:
            assert key in result, f"Çıktıda '{key}' eksik"
        
        # Structure checks
        assert "technical" in result["score_breakdown"]
        assert "provenance" in result["risk_context"]

    def test_direction_values(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=70.0, profile_name="Trend Avcısı")
        assert result["direction"] in ("bullish", "bearish", "neutral")

    def test_reason_codes_is_list(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=70.0, profile_name="Güvenli Liman")
        assert isinstance(result["reason_codes"], list)

    def test_score_breakdown_is_dict(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=70.0, profile_name="Güvenli Liman")
        assert isinstance(result["score_breakdown"], dict)
        assert "technical" in result["score_breakdown"]


class TestPrismScoreRange:
    """Tüm profillerde qrs 0-100 arasında olmalı."""

    @pytest.mark.parametrize("profile", [
        "Güvenli Liman", "Agresif Atak", "Dönüş Uzmanı",
        "Trend Avcısı", "Değer Kaşifi", "Kırılım Dedektörü",
    ])
    def test_score_in_range_bull(self, profile):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=74.0, profile_name=profile)
        assert 0 <= result["qrs"] <= 100, f"{profile}: qrs={result['qrs']} aralık dışı"

    @pytest.mark.parametrize("profile", ["Güvenli Liman", "Agresif Atak", "Trend Avcısı"])
    def test_score_in_range_bear(self, profile):
        result = UnifiedPRISM.evaluate(BEAR_INDICATORS, ml_score=32.0, profile_name=profile)
        assert 0 <= result["qrs"] <= 100, f"{profile}: qrs={result['qrs']} aralık dışı"


class TestPrismDirectionLogic:
    def test_zero_ml_score_caps_qrs_in_safe_harbor(self):
        """ML=0 + Güvenli Liman → veto → qrs ≤ 48."""
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=0.0, profile_name="Güvenli Liman")
        assert result["qrs"] <= 48, f"Güvenli Liman veto çalışmadı: qrs={result['qrs']}"

    def test_dangerous_ml_veto_in_safe_harbor(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=15.0, profile_name="Güvenli Liman")
        assert result["qrs"] <= 48, f"Tehlikeli ML veto çalışmadı: qrs={result['qrs']}"

    def test_no_ml_returns_valid_score(self):
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=None, profile_name="Trend Avcısı")
        assert isinstance(result["qrs"], float)
        assert 0 <= result["qrs"] <= 100

    def test_zero_volume_gets_veto(self):
        no_vol = {**BULL_INDICATORS, "vol_ratio": 0.0}
        result = UnifiedPRISM.evaluate(no_vol, ml_score=80.0, profile_name="Trend Avcısı")
        assert result["qrs"] <= 15, f"Sıfır hacim veto çalışmadı: qrs={result['qrs']}"
        assert "VETO_ZERO_LIQUIDITY" in result["reason_codes"]

    def test_institutional_outlier_veto(self):
        high_price = {**BULL_INDICATORS, "close": 600_000}
        result = UnifiedPRISM.evaluate(high_price, ml_score=80.0, profile_name="Trend Avcısı")
        assert result["qrs"] <= 10, f"Kurumsal outlier veto çalışmadı: qrs={result['qrs']}"
        assert "VETO_INSTITUTIONAL_OUTLIER" in result["reason_codes"]

    def test_target_price_none_when_neutral(self):
        result = UnifiedPRISM.evaluate(WEAK_INDICATORS, ml_score=20.0, profile_name="Güvenli Liman")
        if result["direction"] == "neutral":
            assert result["target_price"] is None, \
                f"Nötr yönde hedef fiyat olmamalı: {result['target_price']}"

    def test_strong_bull_direction_without_ml(self):
        """Tüm teknikaller bullish + ML yok → direction neutral veya bullish (bearish olmaz)."""
        result = UnifiedPRISM.evaluate(BULL_INDICATORS, ml_score=None, profile_name="Trend Avcısı")
        assert result["direction"] in ("bullish", "neutral"), \
            f"Beklenmeyen yön: {result['direction']}"
