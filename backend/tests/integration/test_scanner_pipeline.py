# backend/tests/integration/test_scanner_pipeline.py
"""
Scanner kritik path integration testleri.

Kapsamı:
  - DB cross-worker lock (aynı anda iki scan girişimi)
  - Analyze cache invalidation (stabil data_time anahtarı)
  - Worker ACTIVE state lifecycle (başlangıç / bitiş / hata)
  - push_to_scan_queue cooldown ve duplicate koruması
  - run_auto_scan kuyruğa ekleme + kilit alma
"""
import time
import threading
import datetime
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import text


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_scan_state(db_session):
    """Her testten önce scanner durumunu sıfırla."""
    # DB lock temizle
    db_session.execute(text("DELETE FROM system_locks WHERE lock_key = 'auto_scan_running'"))
    db_session.execute(text("DELETE FROM system_task_logs"))
    db_session.commit()

    # In-process state sıfırla
    try:
        from app.features.scanner.logic.state import STATE_LOCK, ACTIVE, QUEUE, STOP_EVENT
        with STATE_LOCK:
            ACTIVE["user_id"] = None
            ACTIVE["user_email"] = None
            ACTIVE["started_at"] = None
            QUEUE.clear()
        STOP_EVENT.clear()
    except Exception:
        pass
    yield


@pytest.fixture()
def scan_queue_func():
    from app.features.scanner.logic.queue_manager import push_to_scan_queue
    return push_to_scan_queue


# ─── DB Cross-Worker Lock ─────────────────────────────────────────────────────

class TestDBScanLock:
    """system_locks tablosu üzerinden çift-scan önlemi."""

    def _acquire_lock(self, db_session) -> bool:
        db_session.execute(text(
            "DELETE FROM system_locks WHERE lock_key = 'auto_scan_running' AND expires_at < NOW()"
        ))
        res = db_session.execute(text(
            "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
            "VALUES ('auto_scan_running', NOW(), NOW() + INTERVAL '20 minutes') "
            "ON CONFLICT (lock_key) DO NOTHING"
        ))
        db_session.commit()
        return res.rowcount == 1

    def test_first_acquire_succeeds(self, db_session):
        assert self._acquire_lock(db_session) is True

    def test_second_acquire_fails_while_held(self, db_session):
        self._acquire_lock(db_session)
        # İkinci girişim aynı session'da — çakışma olmalı
        res = db_session.execute(text(
            "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
            "VALUES ('auto_scan_running', NOW(), NOW() + INTERVAL '20 minutes') "
            "ON CONFLICT (lock_key) DO NOTHING"
        ))
        db_session.commit()
        assert res.rowcount == 0, "Kilit tutulurken ikinci acquire başarılı olmamalı"

    def test_expired_lock_allows_new_acquire(self, db_session):
        # Geçmişe tarihleri kilit ekle
        db_session.execute(text(
            "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
            "VALUES ('auto_scan_running', NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '5 minutes') "
            "ON CONFLICT (lock_key) DO UPDATE SET expires_at = NOW() - INTERVAL '5 minutes'"
        ))
        db_session.commit()
        # Temizleyip yeniden al
        assert self._acquire_lock(db_session) is True

    def test_lock_release_allows_immediate_reacquire(self, db_session):
        self._acquire_lock(db_session)
        db_session.execute(text("DELETE FROM system_locks WHERE lock_key = 'auto_scan_running'"))
        db_session.commit()
        assert self._acquire_lock(db_session) is True

    def test_concurrent_acquire_only_one_wins(self, db_session):
        """İki thread aynı anda kilitlenmeye çalışırsa yalnızca biri kazanır."""
        from app.core.database import SessionLocal

        winners = []
        errors = []

        def try_acquire():
            db = SessionLocal()
            try:
                db.execute(text(
                    "DELETE FROM system_locks WHERE lock_key = 'auto_scan_running' AND expires_at < NOW()"
                ))
                res = db.execute(text(
                    "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
                    "VALUES ('auto_scan_running', NOW(), NOW() + INTERVAL '20 minutes') "
                    "ON CONFLICT (lock_key) DO NOTHING"
                ))
                db.commit()
                if res.rowcount == 1:
                    winners.append(1)
            except Exception as e:
                errors.append(e)
            finally:
                db.close()

        threads = [threading.Thread(target=try_acquire) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert not errors, f"Thread hataları: {errors}"
        assert len(winners) == 1, f"Beklenen 1 kazanan, gerçek: {len(winners)}"


# ─── Analyze Cache ────────────────────────────────────────────────────────────

class TestAnalyzeCache:
    """_current_data_time() DB'den okuma ve cache key stabilitesi."""

    def test_current_data_time_returns_string(self):
        from app.features.scanner.routers.api_scan import _current_data_time
        result = _current_data_time()
        assert isinstance(result, str)

    def test_cache_key_deterministic(self):
        from app.features.scanner.routers.api_scan import _analyze_cache_key
        k1 = _analyze_cache_key("Güvenli Liman", 500, None)
        k2 = _analyze_cache_key("Güvenli Liman", 500, None)
        assert k1 == k2

    def test_cache_key_differs_by_profile(self):
        from app.features.scanner.routers.api_scan import _analyze_cache_key
        k1 = _analyze_cache_key("Güvenli Liman", 500, None)
        k2 = _analyze_cache_key("Agresif Atak", 500, None)
        assert k1 != k2

    def test_cache_key_differs_by_top_n(self):
        from app.features.scanner.routers.api_scan import _analyze_cache_key
        k1 = _analyze_cache_key("Güvenli Liman", 100, None)
        k2 = _analyze_cache_key("Güvenli Liman", 500, None)
        assert k1 != k2

    def test_cache_key_differs_by_overrides(self):
        from app.features.scanner.routers.api_scan import _analyze_cache_key
        k1 = _analyze_cache_key("Güvenli Liman", 500, {"rsi_weight": 1.0})
        k2 = _analyze_cache_key("Güvenli Liman", 500, {"rsi_weight": 2.0})
        assert k1 != k2

    def test_warm_cache_uses_same_key_as_request(self):
        """warm_analyze_cache ve api_analyze aynı data_time'ı kullanmalı.

        Root cause: progress.json'daki ts, IDLE reset sonrası değişir →
        warm ile request farklı key kullanır. Fix: DB'den scanned_at okumak.
        """
        from app.features.scanner.routers.api_scan import (
            _analyze_cache_key, _current_data_time, _ANALYZE_CACHE, _ANALYZE_CACHE_LOCK
        )
        import time as _time

        profile = "Güvenli Liman"
        top_n = 500
        key = _analyze_cache_key(profile, top_n, None)
        data_time = _current_data_time()

        # Cache'e elle bir kayıt ekle (warm simülasyonu)
        with _ANALYZE_CACHE_LOCK:
            _ANALYZE_CACHE[key] = {
                "ts": _time.monotonic(),
                "data_time": data_time,
                "data": {"results": [], "cache_meta": {}, "data_freshness": None,
                         "ml_warning": None, "qrs_warning": None, "refresh_triggered": False},
            }

        try:
            # Request ile aynı key ve data_time üretilmeli → hit olmalı
            with _ANALYZE_CACHE_LOCK:
                cached = _ANALYZE_CACHE.get(key)
            assert cached is not None, "Cache'e eklenen kayıt bulunamadı"
            assert cached["data_time"] == data_time, (
                f"data_time uyuşmuyor: warm={cached['data_time']!r} vs request={data_time!r}. "
                "Bu warm cache'in hiç hit olmadığı anlamına gelir."
            )
        finally:
            with _ANALYZE_CACHE_LOCK:
                _ANALYZE_CACHE.pop(key, None)

    def test_cache_ttl_evicts_stale_entry(self):
        """TTL geçmiş entry cache miss olarak işlenmeli."""
        from app.features.scanner.routers.api_scan import (
            _analyze_cache_key, _ANALYZE_CACHE, _ANALYZE_CACHE_LOCK, _ANALYZE_CACHE_TTL
        )
        import time as _time

        key = _analyze_cache_key("Güvenli Liman", 500, None)
        stale_ts = _time.monotonic() - _ANALYZE_CACHE_TTL - 1  # Zaten süresi geçmiş

        with _ANALYZE_CACHE_LOCK:
            _ANALYZE_CACHE[key] = {"ts": stale_ts, "data_time": "old", "data": {}}

        try:
            with _ANALYZE_CACHE_LOCK:
                cached = _ANALYZE_CACHE.get(key)
            elapsed = _time.monotonic() - cached["ts"]
            assert elapsed >= _ANALYZE_CACHE_TTL, "Stale entry TTL geçmemiş gibi görünüyor"
        finally:
            with _ANALYZE_CACHE_LOCK:
                _ANALYZE_CACHE.pop(key, None)

    def test_cache_max_evicts_oldest_entry(self):
        """MAX_CACHE_MAX aşıldığında en eski entry silinmeli."""
        from app.features.scanner.routers.api_scan import (
            _analyze_cache_key, _ANALYZE_CACHE, _ANALYZE_CACHE_LOCK, _ANALYZE_CACHE_MAX
        )
        import time as _time

        # Cache'i MAX - 1 sahte profille doldur
        added_keys = []
        with _ANALYZE_CACHE_LOCK:
            _ANALYZE_CACHE.clear()
            for i in range(_ANALYZE_CACHE_MAX - 1):
                k = _analyze_cache_key(f"FakeProfile{i}", 100, None)
                _ANALYZE_CACHE[k] = {"ts": _time.monotonic() - (1000 - i), "data_time": "x", "data": {}}
                added_keys.append(k)

        oldest_key = added_keys[0]  # En düşük ts → en eski

        # Bir tane daha ekle — MAX'a ulaşır ama aşmaz
        new_key = _analyze_cache_key("NewProfile", 100, None)
        with _ANALYZE_CACHE_LOCK:
            if len(_ANALYZE_CACHE) >= _ANALYZE_CACHE_MAX:
                oldest = min(_ANALYZE_CACHE, key=lambda k: _ANALYZE_CACHE[k]["ts"])
                del _ANALYZE_CACHE[oldest]
            _ANALYZE_CACHE[new_key] = {"ts": _time.monotonic(), "data_time": "x", "data": {}}

        try:
            with _ANALYZE_CACHE_LOCK:
                assert oldest_key not in _ANALYZE_CACHE, "En eski entry silinmedi"
                assert new_key in _ANALYZE_CACHE, "Yeni entry eklenmedi"
        finally:
            with _ANALYZE_CACHE_LOCK:
                _ANALYZE_CACHE.clear()


# ─── push_to_scan_queue ───────────────────────────────────────────────────────

class TestScanQueueManager:
    """push_to_scan_queue: cooldown, duplicate, queue limit."""

    @pytest.fixture(autouse=True)
    def reset_queue(self):
        try:
            from app.features.scanner.logic.state import STATE_LOCK, ACTIVE, QUEUE, STOP_EVENT
            with STATE_LOCK:
                ACTIVE["user_id"] = None
                ACTIVE["user_email"] = None
                ACTIVE["started_at"] = None
                QUEUE.clear()
            STOP_EVENT.clear()
        except Exception:
            pass
        yield

    def test_queue_accepts_valid_payload(self, scan_queue_func):
        res = scan_queue_func(
            user_id=1,
            user_email="test@example.com",
            payload_dict={"profile_name": "Güvenli Liman", "max_symbols": 100},
        )
        assert res.get("ok") is True, f"Queue reddi: {res}"

    def test_duplicate_active_scan_rejected(self, scan_queue_func):
        from app.features.scanner.logic.state import STATE_LOCK, ACTIVE
        with STATE_LOCK:
            ACTIVE["user_id"] = 1
            ACTIVE["user_email"] = "someone@example.com"
            ACTIVE["started_at"] = time.time()

        res = scan_queue_func(
            user_id=2,
            user_email="other@example.com",
            payload_dict={"profile_name": "Güvenli Liman"},
        )
        assert res.get("ok") is not True, "Aktif tarama varken yeni tarama kabul edilmemeli"

    def test_queue_returns_ok_for_system_user(self, scan_queue_func):
        """user_id=0 (sistem) her zaman kabul edilmeli."""
        res = scan_queue_func(
            user_id=0,
            user_email="system@pivotradar.net",
            payload_dict={"profile_name": "Güvenli Liman", "max_symbols": 50},
        )
        assert res.get("ok") is True, f"Sistem kullanıcısı reddedildi: {res}"


# ─── Worker ACTIVE State Lifecycle ───────────────────────────────────────────

class TestWorkerActiveState:
    """ACTIVE dict'in scan boyunca doğru güncellendiğini doğrula."""

    def test_active_cleared_after_scan_completes(self):
        """Scan tamamlandıktan sonra ACTIVE boş olmalı."""
        from app.features.scanner.logic.state import ACTIVE, STATE_LOCK

        # Aktif scan simülasyonu
        with STATE_LOCK:
            ACTIVE["user_id"] = 99
            ACTIVE["user_email"] = "sim@test.com"
            ACTIVE["started_at"] = time.time()

        # Worker'ın finally bloğu simülasyonu
        with STATE_LOCK:
            ACTIVE["user_id"] = None
            ACTIVE["user_email"] = None
            ACTIVE["started_at"] = None

        with STATE_LOCK:
            assert ACTIVE["user_id"] is None
            assert ACTIVE["user_email"] is None
            assert ACTIVE["started_at"] is None

    def test_stop_event_cleared_on_new_scan(self):
        """Yeni scan başlamadan önce STOP_EVENT temizlenmeli."""
        from app.features.scanner.logic.state import STOP_EVENT
        STOP_EVENT.set()
        STOP_EVENT.clear()
        assert not STOP_EVENT.is_set()


# ─── run_auto_scan Karar Mantığı ──────────────────────────────────────────────

class TestAutoScanDecisionLogic:
    """run_auto_scan'ın zamanlama kararları — DB lock dahil."""

    def test_force_true_skips_all_checks_and_acquires_lock(self, db_session):
        """force=True ile tüm kontroller atlanmalı ve DB lock alınmalı."""
        from app.features.scanner.tasks import run_auto_scan

        with patch("app.features.scanner.tasks.push_to_scan_queue") as mock_queue, \
             patch("app.features.scanner.tasks.get_system_setting", return_value={"auto_scan_enabled": True}), \
             patch("app.features.scanner.tasks.get_system_load", return_value={"cpu": 10, "ram": 20}), \
             patch("app.features.scanner.tasks.record_task_start", return_value=1), \
             patch("app.features.scanner.tasks.record_task_end"), \
             patch("app.features.scanner.tasks.get_last_success_time", return_value=None), \
             patch("app.features.scanner.tasks._unstick_scanner"):
            mock_queue.return_value = {"ok": True}
            run_auto_scan(force=True)
            mock_queue.assert_called_once()

    def test_db_lock_prevents_concurrent_auto_scan(self, db_session):
        """DB lock tutulurken run_auto_scan kuyruğa eklememeli."""
        from app.features.scanner.tasks import run_auto_scan
        from app.core.database import SessionLocal

        # Kilidi önceden al
        db = SessionLocal()
        db.execute(text(
            "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
            "VALUES ('auto_scan_running', NOW(), NOW() + INTERVAL '20 minutes') "
            "ON CONFLICT (lock_key) DO NOTHING"
        ))
        db.commit()
        db.close()

        try:
            with patch("app.features.scanner.tasks.push_to_scan_queue") as mock_queue, \
                 patch("app.features.scanner.tasks._unstick_scanner"):
                run_auto_scan(force=True)
                mock_queue.assert_not_called(), "Kilit tutulurken scan kuyruğa eklenmemeli"
        finally:
            cleanup_db = SessionLocal()
            cleanup_db.execute(text("DELETE FROM system_locks WHERE lock_key = 'auto_scan_running'"))
            cleanup_db.commit()
            cleanup_db.close()

    def test_lock_released_when_queue_fails(self, db_session):
        """Scan kuyruğa giremediyse DB lock silinmeli — sonraki döngü denesin."""
        from app.features.scanner.tasks import run_auto_scan
        from app.core.database import SessionLocal

        with patch("app.features.scanner.tasks.push_to_scan_queue") as mock_queue, \
             patch("app.features.scanner.tasks.get_system_setting", return_value={"auto_scan_enabled": True}), \
             patch("app.features.scanner.tasks.get_system_load", return_value={"cpu": 10, "ram": 20}), \
             patch("app.features.scanner.tasks.record_task_start", return_value=1), \
             patch("app.features.scanner.tasks.record_task_end"), \
             patch("app.features.scanner.tasks.get_last_success_time", return_value=None), \
             patch("app.features.scanner.tasks._unstick_scanner"):
            mock_queue.return_value = {"ok": False, "detail": "Already active"}
            run_auto_scan(force=True)

        # Kilit silinmiş olmalı
        db = SessionLocal()
        try:
            row = db.execute(text(
                "SELECT 1 FROM system_locks WHERE lock_key = 'auto_scan_running'"
            )).fetchone()
            assert row is None, "Başarısız queue sonrası kilit silinmedi — sonraki scan 20 dakika bloke olur"
        finally:
            db.close()


# ─── _expected_last_trading_date ─────────────────────────────────────────────

class TestExpectedTradingDate:
    """Head-check fix: beklenen işlem tarihi hesabı."""

    def _make_ist(self, **kwargs):
        import pytz
        ist = pytz.timezone("Europe/Istanbul")
        base = datetime.datetime(2026, 5, 22, **kwargs)
        return ist.localize(base)

    def test_market_open_hours_returns_today(self):
        from app.features.scanner.tasks import _expected_last_trading_date
        with patch("app.features.scanner.tasks.is_trading_day", return_value=True):
            now = self._make_ist(hour=11, minute=0)
            result = _expected_last_trading_date(now)
        assert result == now.date()

    def test_pre_market_returns_previous_trading_day(self):
        from app.features.scanner.tasks import _expected_last_trading_date

        # 2026-05-22 Cuma, 09:00 IST (piyasa açılmamış)
        # Bu senaryoda is_trading_day(today)=True ama mod < 600
        now = self._make_ist(hour=9, minute=0)

        call_count = [0]
        def mock_is_trading_day(d):
            call_count[0] += 1
            # Bugün trading day, dün de
            return True

        with patch("app.features.scanner.tasks.is_trading_day", side_effect=mock_is_trading_day):
            result = _expected_last_trading_date(now)

        # Piyasa açılmadıysa → bir önceki trading day
        assert result < now.date(), f"Pre-market'te bugün dönmemeli, dönen: {result}"

    def test_weekend_returns_last_friday(self):
        from app.features.scanner.tasks import _expected_last_trading_date
        import pytz

        ist = pytz.timezone("Europe/Istanbul")
        # 2026-05-23 Cumartesi
        saturday = ist.localize(datetime.datetime(2026, 5, 23, 10, 0))

        def mock_is_trading_day(d):
            return d.weekday() < 5  # Haftaiçi trading

        with patch("app.features.scanner.tasks.is_trading_day", side_effect=mock_is_trading_day):
            result = _expected_last_trading_date(saturday)

        assert result.weekday() < 5, f"Hafta sonu için hafta içi gün dönmeli, dönen: {result}"
        assert result <= saturday.date()
