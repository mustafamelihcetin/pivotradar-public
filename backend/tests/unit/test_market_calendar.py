# backend/tests/unit/test_market_calendar.py
"""Unit tests for market_calendar — trading day logic and BIST status."""
import datetime
import pytest

from app.core.market_calendar import (
    is_trading_day,
    add_trading_days,
    count_trading_days,
    get_market_status,
    BIST_HOLIDAYS_2026,
    HALF_DAYS_2026,
)


class TestIsTradingDay:
    def test_regular_weekday(self):
        assert is_trading_day(datetime.date(2026, 4, 6)) is True  # Monday

    def test_saturday_is_not_trading(self):
        assert is_trading_day(datetime.date(2026, 4, 4)) is False

    def test_sunday_is_not_trading(self):
        assert is_trading_day(datetime.date(2026, 4, 5)) is False

    def test_full_holiday_not_trading(self):
        # April 23 is a full holiday
        assert is_trading_day(datetime.date(2026, 4, 23)) is False

    def test_half_day_is_trading(self):
        # Half days are still trading days
        for d in HALF_DAYS_2026:
            assert is_trading_day(d) is True, f"{d} should be trading (half day)"

    def test_labor_day(self):
        assert is_trading_day(datetime.date(2026, 5, 1)) is False

    def test_new_year(self):
        assert is_trading_day(datetime.date(2026, 1, 1)) is False


class TestAddTradingDays:
    def test_zero_days(self):
        d = datetime.date(2026, 4, 6)
        assert add_trading_days(d, 0) == d

    def test_one_day_skips_weekend(self):
        # Friday → skip Saturday, Sunday → Monday
        friday = datetime.date(2026, 4, 10)
        result = add_trading_days(friday, 1)
        assert result == datetime.date(2026, 4, 13)

    def test_five_days_equals_one_week(self):
        monday = datetime.date(2026, 4, 6)
        result = add_trading_days(monday, 5)
        assert result == datetime.date(2026, 4, 13)

    def test_skips_holiday(self):
        # April 22 (Wed) + 1 trading day should skip April 23 (holiday)
        before_holiday = datetime.date(2026, 4, 22)
        result = add_trading_days(before_holiday, 1)
        assert result == datetime.date(2026, 4, 24)


class TestCountTradingDays:
    def test_same_date_is_zero(self):
        d = datetime.date(2026, 4, 6)
        assert count_trading_days(d, d) == 0

    def test_start_after_end_is_zero(self):
        assert count_trading_days(datetime.date(2026, 4, 10), datetime.date(2026, 4, 6)) == 0

    def test_week_has_five_trading_days(self):
        monday = datetime.date(2026, 4, 6)
        next_monday = datetime.date(2026, 4, 13)
        assert count_trading_days(monday, next_monday) == 5

    def test_holiday_excluded(self):
        # April 22 to April 25 = Wed, Thu (skipping holiday Apr 23)
        start = datetime.date(2026, 4, 22)
        end = datetime.date(2026, 4, 25)
        # Apr 22 = trading, Apr 23 = holiday, Apr 24 = trading → 2
        assert count_trading_days(start, end) == 2


class TestGetMarketStatus:
    def _dt(self, hour, minute, date=None):
        d = date or datetime.date(2026, 4, 6)  # a regular Monday
        return datetime.datetime(d.year, d.month, d.day, hour, minute)

    def test_before_open_is_closed(self):
        result = get_market_status(self._dt(8, 0))
        assert result["status"] == "CLOSED"

    def test_pre_market(self):
        result = get_market_status(self._dt(9, 45))
        assert result["status"] == "PRE-MARKET"

    def test_open_session(self):
        result = get_market_status(self._dt(11, 0))
        assert result["status"] == "OPEN"

    def test_closing_session(self):
        result = get_market_status(self._dt(18, 5))
        assert result["status"] == "CLOSING"

    def test_after_close(self):
        result = get_market_status(self._dt(19, 0))
        assert result["status"] == "CLOSED"

    def test_weekend_is_closed(self):
        saturday = datetime.date(2026, 4, 4)
        result = get_market_status(self._dt(11, 0, date=saturday))
        assert result["status"] == "CLOSED"

    def test_half_day_open(self):
        half_day = list(HALF_DAYS_2026)[0]
        result = get_market_status(self._dt(11, 0, date=half_day))
        assert result["status"] == "OPEN"

    def test_half_day_closed_after_1pm(self):
        half_day = list(HALF_DAYS_2026)[0]
        result = get_market_status(self._dt(14, 0, date=half_day))
        assert result["status"] == "CLOSED"

    def test_no_arg_uses_current_time(self):
        # Should not raise
        result = get_market_status()
        assert result["status"] in ("OPEN", "CLOSED", "PRE-MARKET", "CLOSING")
