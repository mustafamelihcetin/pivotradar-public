# tests/unit/test_indicator_helpers.py
"""Unit tests for shared indicator helper primitives."""
import math
import numpy as np
import pandas as pd
import pytest

from app.shared.indicators._helpers import _num, _col, _last, _as_float, _safe_div, _pct


class TestNum:
    def test_numeric_series_unchanged(self):
        s = pd.Series([1.0, 2.0, 3.0])
        result = _num(s)
        assert list(result) == [1.0, 2.0, 3.0]

    def test_string_series_coerced(self):
        s = pd.Series(["1.5", "2.5", "bad"])
        result = _num(s)
        assert result.iloc[0] == 1.5
        assert math.isnan(result.iloc[2])

    def test_none_returns_empty(self):
        result = _num(None)
        assert len(result) == 0


class TestCol:
    def test_column_found_by_exact_name(self):
        df = pd.DataFrame({"close": [10.0, 20.0]})
        result = _col(df, "close")
        assert list(result) == [10.0, 20.0]

    def test_column_found_case_insensitive(self):
        df = pd.DataFrame({"Close": [10.0, 20.0]})
        result = _col(df, "close")
        assert list(result) == [10.0, 20.0]

    def test_none_df_returns_empty(self):
        result = _col(None, "close")
        assert len(result) == 0

    def test_missing_column_returns_empty(self):
        df = pd.DataFrame({"open": [1.0]})
        result = _col(df, "close")
        assert len(result) == 0

    def test_empty_df_returns_empty(self):
        df = pd.DataFrame()
        result = _col(df, "close")
        assert len(result) == 0

    def test_series_input_matching_name(self):
        s = pd.Series([5.0, 6.0], name="close")
        result = _col(s, "close")
        assert list(result) == [5.0, 6.0]


class TestLast:
    def test_returns_last_value(self):
        s = pd.Series([1.0, 2.0, 3.0])
        assert _last(s) == 3.0

    def test_none_returns_default(self):
        assert math.isnan(_last(None))

    def test_empty_returns_default(self):
        assert _last(pd.Series(dtype=float), default=0.0) == 0.0


class TestAsFloat:
    def test_converts_int(self):
        assert _as_float(5) == 5.0

    def test_converts_string(self):
        assert _as_float("3.14") == pytest.approx(3.14)

    def test_nan_returns_zero(self):
        assert _as_float(float("nan")) == 0.0

    def test_inf_returns_zero(self):
        assert _as_float(float("inf")) == 0.0

    def test_bad_string_returns_zero(self):
        assert _as_float("bad") == 0.0


class TestSafeDiv:
    def test_basic_division(self):
        assert _safe_div(10.0, 2.0) == pytest.approx(5.0)

    def test_zero_denominator_returns_default(self):
        result = _safe_div(10.0, 0.0, default=0.0)
        assert result == 0.0

    def test_inf_denominator_returns_default(self):
        result = _safe_div(10.0, float("inf"), default=-1.0)
        assert result == -1.0


class TestPct:
    def test_basic_percent_change(self):
        assert _pct(110.0, 100.0) == pytest.approx(10.0)

    def test_zero_base_returns_nan(self):
        assert math.isnan(_pct(5.0, 0.0))

    def test_inf_input_returns_nan(self):
        assert math.isnan(_pct(float("inf"), 100.0))


class TestAdminUtils:
    def test_get_system_load_returns_dict(self):
        from app.features.admin.utils import get_system_load
        result = get_system_load()
        assert "cpu" in result
        assert "ram" in result
        assert isinstance(result["cpu"], float)
        assert isinstance(result["ram"], float)

    def test_is_trading_hours_during_hours(self):
        from app.features.admin.utils import is_trading_hours
        from datetime import datetime
        dt = datetime(2024, 1, 15, 12, 0, 0)  # Monday 12:00
        result = is_trading_hours(dt)
        assert isinstance(result, bool)

    def test_is_trading_hours_outside_hours(self):
        from app.features.admin.utils import is_trading_hours
        from datetime import datetime
        dt = datetime(2024, 1, 15, 20, 0, 0)  # Monday 20:00 — after market
        assert is_trading_hours(dt) is False


class TestMarketCalendar:
    def test_half_day_before_open_returns_closed(self):
        from datetime import datetime
        import app.core.market_calendar as mc
        # 2026-03-19 is a half day; 08:00 = 480 min < 580
        dt = datetime(2026, 3, 19, 8, 0, 0)
        result = mc.get_market_status(dt)
        assert result["status"] == "CLOSED"

    def test_half_day_pre_market_window(self):
        from datetime import datetime
        import app.core.market_calendar as mc
        # 2026-03-19 09:41 = 581 min (580-600 range)
        dt = datetime(2026, 3, 19, 9, 41, 0)
        result = mc.get_market_status(dt)
        assert result["status"] == "PRE-MARKET"


class TestQueueManager:
    def test_load_cooldowns_no_crash(self):
        from app.features.scanner.logic.queue_manager import load_cooldowns
        load_cooldowns()  # Should not raise even if file doesn't exist

    def test_push_to_scan_queue_cooldown(self):
        from app.features.scanner.logic import queue_manager as qm
        import time
        # Set a recent scan for user 9999
        qm.USER_LAST_SCAN[9999] = time.time()
        result = qm.push_to_scan_queue(9999, "test@x.com", {}, cooldown=60)
        assert result["ok"] is False
        assert "bekleyin" in result["detail"]

    def test_push_to_scan_queue_capacity(self):
        from app.features.scanner.logic import queue_manager as qm
        from app.features.scanner.logic.state import QUEUE
        QUEUE.clear()
        qm.USER_LAST_SCAN.pop(8888, None)
        result = qm.push_to_scan_queue(8888, "a@b.com", {}, max_queue=0, cooldown=0)
        assert result["ok"] is False
        assert "yoğun" in result["detail"]
