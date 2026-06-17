# backend/tests/unit/test_config_profiles.py
"""Unit tests for profile normalization and display names."""
import pytest
from app.core.config_profiles import normalize_profile, profile_display_name, _ascii_upper


class TestAsciiUpper:
    def test_turkish_chars(self):
        assert _ascii_upper("güvenli") == "GUVENLI"
        assert _ascii_upper("şirket") == "SIRKET"
        assert _ascii_upper("çözüm") == "COZUM"
        assert _ascii_upper("öğrenci") == "OGRENCI"

    def test_strips_whitespace(self):
        assert _ascii_upper("  hello  ") == "HELLO"


class TestNormalizeProfile:
    def test_safe_harbor_variants(self):
        assert normalize_profile("Güvenli Liman") == "SAFE_HARBOR"
        assert normalize_profile("SAFE_HARBOR")   == "SAFE_HARBOR"
        assert normalize_profile("Conservative")  == "SAFE_HARBOR"
        assert normalize_profile("Defansif")      == "SAFE_HARBOR"
        # Bilinmeyen isim de SAFE_HARBOR'a düşmeli
        assert normalize_profile("Dengeli")       == "SAFE_HARBOR"

    def test_aggressive_variants(self):
        assert normalize_profile("Agresif Atak") == "AGGRESSIVE"
        assert normalize_profile("aggressive") == "AGGRESSIVE"

    def test_reversal_variants(self):
        assert normalize_profile("REVERSAL") == "REVERSAL"
        assert normalize_profile("Swing") == "REVERSAL"

    def test_trend_hunter_variants(self):
        assert normalize_profile("Trend Avcısı") == "TREND_HUNTER"
        assert normalize_profile("TREND_HUNTER") == "TREND_HUNTER"

    def test_value_scout_variants(self):
        assert normalize_profile("Değer Kaşifi") == "VALUE_SCOUT"
        assert normalize_profile("value") == "VALUE_SCOUT"

    def test_scalper_variants(self):
        assert normalize_profile("SCALPER") == "SCALPER"
        assert normalize_profile("Anlık Fırsatçı") == "SCALPER"

    def test_breakout_variants(self):
        assert normalize_profile("BREAKOUT") == "BREAKOUT"
        assert normalize_profile("Kırılım") == "BREAKOUT"

    def test_empty_string_returns_safe_harbor(self):
        assert normalize_profile("") == "SAFE_HARBOR"

    def test_none_returns_safe_harbor(self):
        assert normalize_profile(None) == "SAFE_HARBOR"

    def test_unknown_profile_returns_safe_harbor(self):
        assert normalize_profile("XYZ_UNKNOWN_PROFILE_123") == "SAFE_HARBOR"


class TestProfileDisplayName:
    def test_known_profiles_return_turkish(self):
        result = profile_display_name("SAFE_HARBOR")
        assert "Liman" in result or "Güvenli" in result

    def test_unknown_key_returns_key_itself(self):
        result = profile_display_name("NONEXISTENT")
        assert result == "NONEXISTENT"
