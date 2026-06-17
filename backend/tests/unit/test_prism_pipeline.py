# tests/unit/test_prism_pipeline.py
"""Unit tests for the UnifiedPRISM scoring pipeline."""
import pytest
from app.features.scoring.prism_service import UnifiedPRISM


BASE_INDICATORS = {
    "rsi_val": 45.0,
    "trend": True,
    "atr_pct": 2.0,
    "vol_ratio": 1.2,
    "close": 100.0,
    "breakout": 0.5,
    "momentum": 0.3,
    "pattern_score": 0.0,
}


def _evaluate(indicators=None, ml_score=None, profile="Trend Avcısı"):
    ind = {**BASE_INDICATORS, **(indicators or {})}
    return UnifiedPRISM.evaluate(ind, ml_score, profile)


def _reason_values(result):
    """Extract string values from ReasonCode enums in reason_codes."""
    return [rc.value if hasattr(rc, 'value') else str(rc) for rc in result["reason_codes"]]


class TestPRISMBasicOutput:
    def test_returns_dict_with_required_keys(self):
        result = _evaluate()
        assert "qrs" in result
        assert "reason_codes" in result
        assert "signals" in result
        assert "target_price" in result

    def test_qrs_score_in_range(self):
        result = _evaluate()
        assert 0 <= result["qrs"] <= 100

    def test_reason_codes_are_strings(self):
        result = _evaluate()
        for rc in _reason_values(result):
            assert isinstance(rc, str)

    def test_ema_bullish_reason_when_trend_true(self):
        result = _evaluate({"trend": True})
        assert "EMA_BULLISH" in _reason_values(result)

    def test_ema_bearish_reason_when_trend_false(self):
        result = _evaluate({"trend": False})
        assert "EMA_BEARISH" in _reason_values(result)

    def test_oversold_reason_when_rsi_below_30(self):
        result = _evaluate({"rsi_val": 25.0})
        assert "OVERSOLD" in _reason_values(result)

    def test_overbought_reason_when_rsi_above_70(self):
        result = _evaluate({"rsi_val": 75.0})
        assert "OVERBOUGHT" in _reason_values(result)

    def test_vol_pulse_reason_when_vol_ratio_high(self):
        result = _evaluate({"vol_ratio": 2.0})
        assert "VOL_PULSE" in _reason_values(result)


class TestPRISMMLBlending:
    def test_ml_score_influences_qrs(self):
        result_no_ml = _evaluate()
        result_with_ml = _evaluate(ml_score=80.0)
        assert result_no_ml["qrs"] != result_with_ml["qrs"]

    def test_low_ml_score_caps_qrs_safe_harbor(self):
        result = _evaluate(ml_score=10.0, profile="Güvenli Liman")
        assert result["qrs"] <= 48.0

    def test_high_ml_score_boosts_qrs(self):
        result_low = _evaluate(ml_score=20.0)
        result_high = _evaluate(ml_score=90.0)
        assert result_high["qrs"] > result_low["qrs"]


class TestPRISMProfiles:
    @pytest.mark.parametrize("profile", [
        "Güvenli Liman", "Agresif", "Reversal Avcısı",
        "Trend Takipçisi", "Trend Avcısı", "Scalper", "Kırılım Avcısı"
    ])
    def test_all_profiles_return_valid_result(self, profile):
        result = _evaluate(profile=profile)
        assert 0 <= result["qrs"] <= 100

    def test_safe_harbor_more_conservative_than_aggressive(self):
        base = {**BASE_INDICATORS, "rsi_val": 65.0, "trend": True}
        safe = UnifiedPRISM.evaluate(base, 60.0, "Güvenli Liman")
        agg = UnifiedPRISM.evaluate(base, 60.0, "Agresif")
        assert safe["qrs"] <= agg["qrs"] + 20


class TestPRISMVetos:
    def test_risk_heat_shield_caps_overbought(self):
        result = _evaluate({"rsi_val": 88.0}, ml_score=70.0)
        assert "RISK_HEAT_SHIELD" in _reason_values(result)

    def test_extreme_volatility_veto_on_high_atr(self):
        result = _evaluate({"atr_pct": 15.0}, ml_score=50.0)
        assert "RISK_EXTREME_VOLATILITY" in _reason_values(result)

    def test_low_ml_triggers_ml_veto_on_aggressive_profile(self):
        result = _evaluate(ml_score=20.0, profile="Agresif")
        reasons = _reason_values(result)
        assert any(r in reasons for r in ("ML_VETO", "SAFE_HARBOR_VETO"))

    def test_low_ml_caps_safe_harbor_at_48(self):
        result = _evaluate(ml_score=15.0, profile="Güvenli Liman")
        assert result["qrs"] <= 48.0

    def test_bull_trap_detected_on_low_vol(self):
        result = _evaluate({"momentum": 10.0, "vol_ratio": 0.5}, ml_score=60.0)
        reasons = _reason_values(result)
        assert "RISK_BULL_TRAP" in reasons or result["qrs"] < 80.0

    def test_direction_field_present(self):
        result = _evaluate()
        assert "direction" in result
        assert result["direction"] in ("bullish", "bearish", "neutral")

    def test_target_price_above_close_when_bullish(self):
        result = _evaluate({"trend": True, "close": 100.0})
        if result["direction"] == "bullish":
            assert result["target_price"] >= 100.0

    def test_confidence_score_in_range(self):
        result = _evaluate(ml_score=70.0)
        assert 0 <= result["confidence_score"] <= 100


class TestPRISMEdgeCases:
    def test_zero_close_price_no_crash(self):
        result = _evaluate({"close": 0.0})
        assert "qrs" in result

    def test_negative_atr_handled(self):
        result = _evaluate({"atr_pct": -1.0})
        assert 0 <= result["qrs"] <= 100

    def test_all_zeros_no_crash(self):
        result = UnifiedPRISM.evaluate(
            {"rsi_val": 0, "trend": False, "atr_pct": 0, "vol_ratio": 0,
             "close": 0, "breakout": 0, "momentum": 0, "pattern_score": 0},
            None, "Trend Avcısı"
        )
        assert "qrs" in result
