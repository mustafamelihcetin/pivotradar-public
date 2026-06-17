# tests/unit/test_rules_score.py
"""Unit tests for the rule-based scoring function covering all strategy profiles."""
import pytest
from app.features.scoring.yzdsh_rules import rules_score


BASE = dict(
    rsi=45.0,
    ema_fast_over_slow=True,
    atr_pct=2.0,
    vol_ratio=1.5,
    profile_name="Trend Avcısı",
    breakout=0.5,
    momentum=3.0,
    pattern_name=None,
    pattern_score=0.0,
    close_price=100.0,
)


def _score(**overrides):
    args = {**BASE, **overrides}
    return rules_score(**args)


class TestRulesScoreOutput:
    def test_returns_float(self):
        assert isinstance(_score(), float)

    def test_score_in_range(self):
        s = _score()
        assert 0 <= s <= 100

    @pytest.mark.parametrize("profile", [
        "Guvenli Liman", "Agresif", "Reversal Avcisi",
        "Trend Takipcisi", "Trend Avcısı", "Scalper", "Kirilim Avcisi"
    ])
    def test_all_profiles_bounded(self, profile):
        s = _score(profile_name=profile)
        assert 0 <= s <= 100


class TestSafeHarborLogic:
    def test_trend_with_low_atr_boosts_score(self):
        s_good = _score(profile_name="Guvenli Liman", ema_fast_over_slow=True, atr_pct=2.0)
        s_bad = _score(profile_name="Guvenli Liman", ema_fast_over_slow=False, atr_pct=2.0)
        assert s_good > s_bad

    def test_overbought_penalized(self):
        s_ok = _score(profile_name="Guvenli Liman", rsi=50.0)
        s_hot = _score(profile_name="Guvenli Liman", rsi=85.0)
        assert s_hot < s_ok

    def test_high_atr_penalized(self):
        s_low = _score(profile_name="Guvenli Liman", atr_pct=2.0)
        s_high = _score(profile_name="Guvenli Liman", atr_pct=8.0)
        assert s_high < s_low

    def test_oversold_penalized(self):
        s_mid = _score(profile_name="Guvenli Liman", rsi=50.0)
        s_low = _score(profile_name="Guvenli Liman", rsi=22.0)
        assert s_low < s_mid


class TestAggressiveLogic:
    def test_high_momentum_rewarded(self):
        s_low = _score(profile_name="Agresif", momentum=2.0)
        s_high = _score(profile_name="Agresif", momentum=20.0)
        assert s_high >= s_low

    def test_breakout_rewarded(self):
        s_none = _score(profile_name="Agresif", breakout=0.0)
        s_break = _score(profile_name="Agresif", breakout=0.9)
        assert s_break > s_none


class TestReversalLogic:
    def test_oversold_rewarded(self):
        s_mid = _score(profile_name="Reversal Avcisi", rsi=50.0, ema_fast_over_slow=False)
        s_low = _score(profile_name="Reversal Avcisi", rsi=22.0, ema_fast_over_slow=False)
        assert s_low > s_mid

    def test_bearish_ema_adds_reversal_points(self):
        s_bear = _score(profile_name="Reversal Avcisi", ema_fast_over_slow=False, rsi=25.0)
        assert s_bear >= 0


class TestTrendFollowerLogic:
    def test_bullish_trend_rewarded(self):
        s_yes = _score(profile_name="Trend Takipcisi", ema_fast_over_slow=True)
        s_no = _score(profile_name="Trend Takipcisi", ema_fast_over_slow=False)
        assert s_yes > s_no


class TestScalperLogic:
    def test_high_vol_ratio_rewarded(self):
        s_low = _score(profile_name="Scalper", vol_ratio=1.0)
        s_high = _score(profile_name="Scalper", vol_ratio=3.0)
        assert s_high >= s_low


class TestBreakoutLogic:
    def test_high_breakout_score_rewarded(self):
        s_none = _score(profile_name="Kirilim Avcisi", breakout=0.0)
        s_high = _score(profile_name="Kirilim Avcisi", breakout=0.95)
        assert s_high > s_none

    def test_volume_confirmation_rewarded(self):
        s_low = _score(profile_name="Kirilim Avcisi", vol_ratio=0.8)
        s_high = _score(profile_name="Kirilim Avcisi", vol_ratio=2.5)
        assert s_high >= s_low


class TestMacroScenarios:
    def test_high_vix_penalizes_aggressive(self):
        s_calm  = _score(profile_name="Agresif", vix_regime=0)
        s_panic = _score(profile_name="Agresif", vix_regime=2)
        assert s_panic <= s_calm

    def test_high_vix_penalizes_breakout(self):
        s_low  = _score(profile_name="Kirilim Avcisi", vix_regime=0)
        s_high = _score(profile_name="Kirilim Avcisi", vix_regime=2)
        assert s_high <= s_low

    def test_high_usdtry_rewards_trend_hunter(self):
        s_low = _score(profile_name="Trend Takipcisi", usdtry_change_5d=0.0)
        s_high = _score(profile_name="Trend Takipcisi", usdtry_change_5d=6.0)
        assert s_high >= s_low

    def test_crisis_vix_penalizes_all_aggressive_profiles(self):
        for profile in ("Agresif", "Kirilim Avcisi", "Trend Takipcisi", "Scalper"):
            s_normal = _score(profile_name=profile, vix_regime=0)
            s_crisis = _score(profile_name=profile, vix_regime=2)
            assert s_crisis <= s_normal, f"{profile}: VIX kriz ceza uygulanmadı"

    def test_safe_harbor_vix_penalty_smaller_than_aggressive(self):
        diff_aggressive = (
            _score(profile_name="Agresif",      vix_regime=0) -
            _score(profile_name="Agresif",      vix_regime=2)
        )
        diff_safe = (
            _score(profile_name="Guvenli Liman", vix_regime=0) -
            _score(profile_name="Guvenli Liman", vix_regime=2)
        )
        assert diff_aggressive >= diff_safe
