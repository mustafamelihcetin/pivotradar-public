# backend/app/features/scanner/utils.py
import datetime
import pytz

from app.core.market_calendar import is_trading_day, HALF_DAYS_2026

_IST = pytz.timezone("Europe/Istanbul")


def get_market_status() -> dict:
    """
    BIST piyasa durumunu ve tarama yapılıp yapılmaması gerektiğini döner.
    BIST resmi tatil takvimini (market_calendar.py) kullanır.

    Scan penceresi: 09:50 - 18:30 TRT (hafta içi, tatil olmayan günler)
    - PRE_MARKET_PREP  : 09:50 - 10:00  → should_scan=True, is_open=False
    - MARKET_OPEN      : 10:00 - 18:15  → should_scan=True, is_open=True
    - POST_MARKET      : 18:15 - 18:30  → should_scan=True, is_open=False
    - NIGHT_REST       : 18:30 - 09:50  → should_scan=False
    - WEEKEND_REST     : Cumartesi/Pazar → should_scan=False
    - HOLIDAY_REST     : BIST resmi tatil → should_scan=False
    """
    now = datetime.datetime.now(_IST)
    today = now.date()

    # Hafta sonu veya BIST resmi tatil (yarım günler dahil değil — o günler açık)
    if not is_trading_day(today):
        mode = "WEEKEND_REST" if today.weekday() >= 5 else "HOLIDAY_REST"
        return {"is_open": False, "should_scan": False, "mode": mode}

    current_time = now.time()
    market_open    = datetime.time(10,  0)
    market_close   = datetime.time(18, 15)
    post_close_end = datetime.time(18, 30)
    prep_time      = datetime.time( 9, 50)

    # Yarım gün: seans 13:00'da biter
    if today in HALF_DAYS_2026:
        half_close = datetime.time(13, 0)
        if current_time < prep_time:
            return {"is_open": False, "should_scan": False, "mode": "NIGHT_REST"}
        if prep_time <= current_time < market_open:
            return {"is_open": False, "should_scan": True, "mode": "PRE_MARKET_PREP"}
        if market_open <= current_time < half_close:
            return {"is_open": True, "should_scan": True, "mode": "MARKET_OPEN"}
        return {"is_open": False, "should_scan": False, "mode": "NIGHT_REST"}

    if market_open <= current_time < market_close:
        return {"is_open": True,  "should_scan": True,  "mode": "MARKET_OPEN"}

    if market_close <= current_time < post_close_end:
        return {"is_open": False, "should_scan": True,  "mode": "POST_MARKET_FINALIZING"}

    if prep_time <= current_time < market_open:
        return {"is_open": False, "should_scan": True,  "mode": "PRE_MARKET_PREP"}

    return {"is_open": False, "should_scan": False, "mode": "NIGHT_REST"}
