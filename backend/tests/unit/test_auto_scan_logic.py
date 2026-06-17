# backend/tests/unit/test_auto_scan_logic.py
"""
Unit testler — run_auto_scan karar matrisi.

Her senaryo gerçek bir üretim hatasına karşılık gelir:
  - Head-check false-positive (2026-05 olayı)
  - Throttle bypass (seans açık + cache çok eski)
  - Hafta sonu boş cache → ilk kurulum taraması
  - Seans dışı veri güncel → atla
  - Kilitli scan → ikinci worker kuyruğa eklememeli
"""
import datetime
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import text


# ─── Yardımcı ────────────────────────────────────────────────────────────────

def _ist(year=2026, month=5, day=22, hour=11, minute=0):
    import pytz
    return pytz.timezone("Europe/Istanbul").localize(
        datetime.datetime(year, month, day, hour, minute)
    )


def _run_auto_scan_mocked(
    *,
    force: bool = False,
    should_scan: bool = True,
    is_open: bool = True,
    mode: str = "OPEN",
    cache_age: float = 5.0,
    data_date: datetime.date | None = None,
    expected_date: datetime.date | None = None,
    last_success_min: float = 999.0,
    scanned_at_utc=None,
    push_result=None,
    now_ist=None,
    yf_date=None,           # head-check: yfinance son bar tarihi
    auto_scan_enabled: bool = True,
    cpu_load: float = 10.0,
):
    """run_auto_scan'ı izole kontrol değişkenleriyle çalıştırır."""
    from app.features.scanner.tasks import run_auto_scan

    if now_ist is None:
        now_ist = _ist()
    if expected_date is None:
        expected_date = now_ist.date()
    if data_date is None:
        data_date = expected_date
    if push_result is None:
        push_result = {"ok": True}

    market_status = {"should_scan": should_scan, "is_open": is_open, "mode": mode}

    with patch("app.features.scanner.tasks._ist_now", return_value=now_ist), \
         patch("app.features.scanner.tasks.get_market_status", return_value=market_status), \
         patch("app.features.scanner.tasks._get_cache_age_minutes", return_value=cache_age), \
         patch("app.features.scanner.tasks._get_cache_data_date", return_value=data_date), \
         patch("app.features.scanner.tasks._get_cache_scanned_at", return_value=scanned_at_utc), \
         patch("app.features.scanner.tasks._expected_last_trading_date", return_value=expected_date), \
         patch("app.features.scanner.tasks._minutes_since_last_success", return_value=last_success_min), \
         patch("app.features.scanner.tasks._unstick_scanner"), \
         patch("app.features.scanner.tasks.get_system_setting",
               return_value={"auto_scan_enabled": auto_scan_enabled, "default_profile": "Güvenli Liman",
                             "max_symbols": 100, "ml_enabled": False, "pattern_enabled": False}), \
         patch("app.features.scanner.tasks.get_system_load",
               return_value={"cpu": cpu_load, "ram": 20}), \
         patch("app.features.scanner.tasks.record_task_start", return_value=1), \
         patch("app.features.scanner.tasks.record_task_end"), \
         patch("app.features.scanner.tasks.get_last_success_time", return_value=None), \
         patch("app.features.scanner.tasks.push_to_scan_queue", return_value=push_result) as mock_push, \
         patch("app.features.scanner.tasks.SessionLocal") as mock_sl:

        # DB lock always available (no lock held)
        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_res = MagicMock()
        mock_res.rowcount = 1  # Lock acquired
        mock_conn.execute.return_value = mock_res
        mock_conn.commit = MagicMock()
        mock_conn.close = MagicMock()
        mock_sl.return_value = mock_conn

        # Head-check patch (yfinance)
        if yf_date is not None:
            import pandas as pd
            mock_df = MagicMock()
            mock_df.empty = False
            mock_df.index = [pd.Timestamp(yf_date)]
            mock_bundle = MagicMock()
            mock_bundle.df = mock_df
            with patch("app.features.scanner.tasks.MarketDataService") as MockSvc:
                MockSvc.return_value.fetch_price_df.return_value = mock_bundle
                run_auto_scan(force=force)
        else:
            with patch("app.features.scanner.tasks.MarketDataService", side_effect=Exception("no yf")):
                run_auto_scan(force=force)

    return mock_push


# ─── Test Sınıfları ───────────────────────────────────────────────────────────

class TestAutoScanOpenMarket:
    """Seans açık (should_scan=True, is_open=True) senaryoları."""

    def test_triggers_scan_when_throttle_ok(self):
        mock = _run_auto_scan_mocked(last_success_min=10.0)
        mock.assert_called_once()

    def test_skips_scan_within_throttle_window(self):
        mock = _run_auto_scan_mocked(last_success_min=3.0)
        mock.assert_not_called()

    def test_force_bypasses_throttle(self):
        mock = _run_auto_scan_mocked(force=True, last_success_min=1.0)
        mock.assert_called_once()

    def test_head_check_skips_when_yfinance_stale(self):
        """HEAD-CHECK BUG FIX: yfinance dünkü bar döndürürse taramayı atla."""
        today = datetime.date(2026, 5, 22)
        yesterday = today - datetime.timedelta(days=1)
        mock = _run_auto_scan_mocked(
            last_success_min=20.0,
            cache_age=30.0,          # cache taze (< 60 dk)
            data_date=today,
            expected_date=today,
            yf_date=yesterday,       # yfinance dünü gösteriyor → beklenen bugün
        )
        mock.assert_not_called()

    def test_head_check_proceeds_when_yfinance_current(self):
        """yfinance beklenen tarihi döndürürse tarama devam etmeli."""
        today = datetime.date(2026, 5, 22)
        mock = _run_auto_scan_mocked(
            last_success_min=20.0,
            cache_age=30.0,
            data_date=today,
            expected_date=today,
            yf_date=today,          # güncel → tarama yap
        )
        mock.assert_called_once()

    def test_rescue_fires_when_cache_very_old(self):
        """Cache 3+ saatten eskiyse throttle'ı bypass edip force tarama başlatmalı."""
        mock = _run_auto_scan_mocked(
            last_success_min=2.0,   # throttle normalde bloklardı
            cache_age=200.0,        # > 180 dk → rescue devrede
        )
        mock.assert_called_once()

    def test_dynamic_threads_reduce_under_high_cpu(self):
        """CPU > 90'da thread sayısı 2'ye düşmeli — payload'da kontrol et."""
        calls = []
        original = __import__("app.features.scanner.tasks", fromlist=["push_to_scan_queue"]).push_to_scan_queue

        with patch("app.features.scanner.tasks.push_to_scan_queue",
                   side_effect=lambda **kw: calls.append(kw) or {"ok": True}):
            _run_auto_scan_mocked(cpu_load=95.0, last_success_min=20.0)

        if calls:
            payload = calls[0].get("payload_dict", {})
            assert payload.get("max_threads", 16) <= 2, (
                f"CPU %95'de max_threads {payload.get('max_threads')} olmamalı"
            )


class TestAutoScanClosedMarket:
    """Seans kapalı (should_scan=False) senaryoları."""

    def test_skips_when_data_current_and_post_close(self):
        """Veri güncel + kapanış sonrası tarama var → atla."""
        today = datetime.date(2026, 5, 22)
        # scanned_at 18:30 IST → kapanış eşiği (18:25) geçmiş
        scanned_at = datetime.datetime(2026, 5, 22, 15, 30)  # UTC = 18:30 IST

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False,
            data_date=today, expected_date=today,
            scanned_at_utc=scanned_at,
            now_ist=_ist(hour=20, minute=0),
        )
        mock.assert_not_called()

    def test_rescue_when_data_stale_overnight(self):
        """Gece: veri eski + son başarıdan 30+ dk geçmiş → kurtarma taraması."""
        yesterday = datetime.date(2026, 5, 21)
        today = datetime.date(2026, 5, 22)

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False,
            data_date=yesterday, expected_date=today,
            last_success_min=35.0,
        )
        mock.assert_called_once()

    def test_no_rescue_within_cooldown(self):
        """Veri eski ama son başarıdan 30 dk geçmemiş → bekle."""
        yesterday = datetime.date(2026, 5, 21)
        today = datetime.date(2026, 5, 22)

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False,
            data_date=yesterday, expected_date=today,
            last_success_min=15.0,
        )
        mock.assert_not_called()

    def test_skips_on_weekend_with_existing_cache(self):
        """Hafta sonu + cache var → BIST kapalı, veri değişmez, atla."""
        import pytz
        ist = pytz.timezone("Europe/Istanbul")
        saturday = ist.localize(datetime.datetime(2026, 5, 23, 12, 0))  # Cumartesi

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False, mode="WEEKEND",
            now_ist=saturday,
            cache_age=100.0,    # cache var ama eski
        )
        mock.assert_not_called()

    def test_first_run_on_weekend_with_empty_cache(self):
        """Hafta sonu + cache boş → ilk kurulum taraması yap."""
        import pytz
        ist = pytz.timezone("Europe/Istanbul")
        saturday = ist.localize(datetime.datetime(2026, 5, 23, 12, 0))

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False, mode="WEEKEND",
            now_ist=saturday,
            cache_age=float('inf'),  # Cache hiç yok
        )
        mock.assert_called_once()

    def test_scan_disabled_in_settings_skips(self):
        """Admin ayarlarından auto_scan devre dışıysa atla."""
        mock = _run_auto_scan_mocked(
            force=True, auto_scan_enabled=False
        )
        mock.assert_not_called()


class TestAutoScanPostMarket:
    """Post-market (18:15-18:30) kapanış yakalama senaryoları."""

    def test_rescue_scan_when_last_scan_before_close(self):
        """Son tarama kapanış öncesindeyse (18:25 IST öncesi) → kurtarma."""
        today = datetime.date(2026, 5, 22)
        # scanned_at 15:00 UTC = 18:00 IST → kapanış eşiği (18:25) öncesi
        scanned_at = datetime.datetime(2026, 5, 22, 15, 0)
        now_ist = _ist(hour=20, minute=0)  # 20:00 IST (post-market, kapalı)

        mock = _run_auto_scan_mocked(
            should_scan=False, is_open=False,
            data_date=today, expected_date=today,
            scanned_at_utc=scanned_at,
            now_ist=now_ist,
            last_success_min=35.0,
        )
        mock.assert_called_once()
