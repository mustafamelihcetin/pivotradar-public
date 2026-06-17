# backend/tests/unit/test_pipeline_helpers.py
"""
pipeline/_helpers.py için unit testler.
Pure fonksiyonlar — dış bağımlılık yok, mock gerekmez.
"""
import numpy as np
import pandas as pd
import pytest

from app.features.scanner.pipeline._helpers import (
    SimpleTA,
    ensure_float,
    fmt_float,
    env_bool,
    feat_nonzero_stats,
    parse_int_param,
    parse_float_param,
)


# ── SimpleTA ──────────────────────────────────────────────────────────────────

class TestSimpleTA:
    def _close(self, n=50, start=100.0, end=120.0):
        return pd.Series(np.linspace(start, end, n))

    def test_rsi_range(self):
        rsi = SimpleTA.rsi(self._close(), length=14)
        assert rsi.between(0, 100).all()

    def test_rsi_fillna_on_nan_input(self):
        s = pd.Series([np.nan] * 20 + list(range(30)))
        rsi = SimpleTA.rsi(s, length=14)
        assert not rsi.isna().any()

    def test_ema_length(self):
        s = self._close(100)
        ema = SimpleTA.ema(s, length=10)
        assert len(ema) == len(s)

    def test_atr_positive(self):
        n = 50
        h = pd.Series(np.linspace(105, 125, n))
        lv = pd.Series(np.linspace(95, 115, n))
        c = pd.Series(np.linspace(100, 120, n))
        atr = SimpleTA.atr(h, lv, c, length=14)
        assert (atr.dropna() > 0).all()

    def test_rsi_trending_up_above_50(self):
        rising = pd.Series(np.linspace(50, 200, 100))
        rsi = SimpleTA.rsi(rising, length=14)
        assert rsi.iloc[-1] > 50

    def test_rsi_trending_down_below_50(self):
        falling = pd.Series(np.linspace(200, 50, 100))
        rsi = SimpleTA.rsi(falling, length=14)
        assert rsi.iloc[-1] < 50


# ── ensure_float ──────────────────────────────────────────────────────────────

class TestEnsureFloat:
    def test_normal(self):
        assert ensure_float(3.14) == pytest.approx(3.14)

    def test_none_returns_default(self):
        assert ensure_float(None, default=99.0) == pytest.approx(99.0)

    def test_nan_returns_default(self):
        assert ensure_float(float("nan"), default=0.0) == pytest.approx(0.0)

    def test_inf_returns_default(self):
        assert ensure_float(float("inf"), default=0.0) == pytest.approx(0.0)

    def test_string_number(self):
        assert ensure_float("42.5") == pytest.approx(42.5)

    def test_bad_string_returns_default(self):
        assert ensure_float("abc", default=-1.0) == pytest.approx(-1.0)


# ── fmt_float ─────────────────────────────────────────────────────────────────

class TestFmtFloat:
    def test_normal(self):
        assert fmt_float(3.14159) == "3.1416"

    def test_none(self):
        assert fmt_float(None) == "None"

    def test_nan(self):
        assert fmt_float(float("nan")) == "nan"

    def test_inf(self):
        assert fmt_float(float("inf")) == "nan"


# ── env_bool ──────────────────────────────────────────────────────────────────

class TestEnvBool:
    def test_true_values(self, monkeypatch):
        for v in ("1", "true", "yes", "y", "on", "TRUE", "YES"):
            monkeypatch.setenv("TEST_FLAG", v)
            assert env_bool("TEST_FLAG") is True

    def test_false_values(self, monkeypatch):
        for v in ("0", "false", "no", "n", "off"):
            monkeypatch.setenv("TEST_FLAG", v)
            assert env_bool("TEST_FLAG") is False

    def test_missing_returns_default(self, monkeypatch):
        monkeypatch.delenv("TEST_FLAG", raising=False)
        assert env_bool("TEST_FLAG", default=True) is True
        assert env_bool("TEST_FLAG", default=False) is False


# ── feat_nonzero_stats ────────────────────────────────────────────────────────

class TestFeatNonzeroStats:
    def test_empty_dict(self):
        nz, total, items = feat_nonzero_stats({})
        assert nz == 0 and total == 0 and items == []

    def test_basic(self):
        feats = {"rsi": 65.0, "atr_pct": 0.0, "vol_ratio": 1.5}
        nz, total, items = feat_nonzero_stats(feats)
        assert nz == 2
        assert total == 3
        assert items[0][0] in ("rsi", "vol_ratio")

    def test_coverage_key_excluded(self):
        feats = {"_coverage": 0.9, "rsi": 55.0}
        _, total, _ = feat_nonzero_stats(feats)
        assert total == 1

    def test_sorted_by_abs_value_desc(self):
        feats = {"a": 1.0, "b": -10.0, "c": 3.0}
        _, _, items = feat_nonzero_stats(feats)
        assert items[0] == ("b", -10.0)
        assert items[1] == ("c", 3.0)

    def test_non_finite_excluded(self):
        feats = {"a": float("nan"), "b": float("inf"), "c": 5.0}
        nz, _, _ = feat_nonzero_stats(feats)
        assert nz == 1


# ── parse helpers ──────────────────────────────────────────────────────────────

class TestParseHelpers:
    def test_parse_int(self):
        assert parse_int_param({"x": "7"}, "x", 0) == 7

    def test_parse_int_missing_returns_default(self):
        assert parse_int_param({}, "x", 42) == 42

    def test_parse_float_comma_decimal(self):
        assert parse_float_param({"x": "3,14"}, "x", 0.0) == pytest.approx(3.14)

    def test_parse_float_missing(self):
        assert parse_float_param({}, "x", 9.9) == pytest.approx(9.9)
