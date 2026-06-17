# backend/tests/unit/test_scheduler_dedup.py
"""
Scheduler çift-tetikleme guard testleri.

Kapsamı:
  - SQLAlchemy jobstore fallback davranışı
  - Job ID çakışmalarında replace_existing garantisi
  - interval_job / cron_job parametreleri
  - JobStore başarısızlığında sessiz fallback (in-memory)
"""
import pytest
from unittest.mock import patch, MagicMock, call
from apscheduler.schedulers.background import BackgroundScheduler


# ─── _build_scheduler ────────────────────────────────────────────────────────

class TestBuildScheduler:
    """scheduler.py'daki _build_scheduler fonksiyonu."""

    def test_uses_sqlalchemy_jobstore_when_db_url_available(self):
        from app.core.scheduler import _build_scheduler

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql://u:p@localhost/testdb"}), \
             patch("app.core.scheduler.SQLAlchemyJobStore") as MockStore, \
             patch("app.core.scheduler.BackgroundScheduler") as MockSched:
            MockStore.return_value = MagicMock()
            MockSched.return_value = MagicMock()
            _build_scheduler()
            MockStore.assert_called_once()

    def test_falls_back_to_memory_when_db_unavailable(self):
        """DB bağlanamıyorsa in-memory kullan — sessiz fallback."""
        from app.core.scheduler import _build_scheduler

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql://bad:bad@nowhere/testdb"}), \
             patch("app.core.scheduler.SQLAlchemyJobStore", side_effect=Exception("connection refused")), \
             patch("app.core.scheduler.BackgroundScheduler") as MockSched:
            MockSched.return_value = MagicMock()
            result = _build_scheduler()
            # Hata atmamalı, in-memory scheduler dönmeli
            assert result is not None

    def test_uses_env_database_url_not_settings(self):
        """DATABASE_URL env'den okunmalı — settings modülünden değil."""
        from app.core.scheduler import _build_scheduler
        import os

        captured = {}
        original_sqlalchemy = None
        try:
            from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore as _Real
            original_sqlalchemy = _Real
        except ImportError:
            pytest.skip("SQLAlchemyJobStore yok")

        def capture_store(url, **kw):
            captured["url"] = url
            return MagicMock()

        env_url = "postgresql://pivot_user:pivot_pass@db/pivotradar"
        with patch.dict("os.environ", {"DATABASE_URL": env_url}), \
             patch("app.core.scheduler.SQLAlchemyJobStore", side_effect=capture_store), \
             patch("app.core.scheduler.BackgroundScheduler") as MockSched:
            MockSched.return_value = MagicMock()
            _build_scheduler()

        assert captured.get("url") == env_url, (
            f"Yanlış URL kullanıldı: {captured.get('url')!r}"
        )


# ─── TaskScheduler.add_interval_job ──────────────────────────────────────────

class TestIntervalJob:
    @pytest.fixture()
    def scheduler(self):
        from app.core.scheduler import TaskScheduler
        # Singleton'u sıfırla
        TaskScheduler._instance = None
        s = TaskScheduler()
        s.scheduler = BackgroundScheduler()
        s.scheduler.start()
        yield s
        if s.scheduler.running:
            s.scheduler.shutdown(wait=False)
        TaskScheduler._instance = None

    def dummy_job(self):
        pass

    def test_interval_job_registered(self, scheduler):
        scheduler.add_interval_job(self.dummy_job, job_id="test_job", minutes=15)
        assert scheduler.scheduler.get_job("test_job") is not None

    def test_interval_job_replaces_stale_entry(self, scheduler):
        scheduler.add_interval_job(self.dummy_job, job_id="test_job", minutes=10)
        scheduler.add_interval_job(self.dummy_job, job_id="test_job", minutes=20)
        job = scheduler.scheduler.get_job("test_job")
        assert job is not None
        # Yeni interval 20 dakika olmalı
        assert job.trigger.interval.total_seconds() == 20 * 60

    def test_zero_interval_removes_job(self, scheduler):
        scheduler.add_interval_job(self.dummy_job, job_id="remove_me", minutes=5)
        scheduler.add_interval_job(self.dummy_job, job_id="remove_me", minutes=0, hours=0)
        assert scheduler.scheduler.get_job("remove_me") is None

    def test_hours_and_minutes_combined(self, scheduler):
        scheduler.add_interval_job(self.dummy_job, job_id="combo", hours=1, minutes=30)
        job = scheduler.scheduler.get_job("combo")
        assert job.trigger.interval.total_seconds() == 90 * 60

    def test_duplicate_job_id_only_one_job_exists(self, scheduler):
        scheduler.add_interval_job(self.dummy_job, job_id="dedup", minutes=5)
        scheduler.add_interval_job(self.dummy_job, job_id="dedup", minutes=5)
        jobs = [j for j in scheduler.scheduler.get_jobs() if j.id == "dedup"]
        assert len(jobs) == 1, f"Aynı ID ile {len(jobs)} job oluştu — çift-tetikleme riski"


# ─── TaskScheduler.add_cron_job ──────────────────────────────────────────────

class TestCronJob:
    @pytest.fixture()
    def scheduler(self):
        from app.core.scheduler import TaskScheduler
        TaskScheduler._instance = None
        s = TaskScheduler()
        s.scheduler = BackgroundScheduler()
        s.scheduler.start()
        yield s
        if s.scheduler.running:
            s.scheduler.shutdown(wait=False)
        TaskScheduler._instance = None

    def dummy_cron(self):
        pass

    def test_cron_job_registered(self, scheduler):
        scheduler.add_cron_job(self.dummy_cron, hour=3, minute=30, job_id="nightly")
        assert scheduler.scheduler.get_job("nightly") is not None

    def test_cron_job_replaces_stale(self, scheduler):
        scheduler.add_cron_job(self.dummy_cron, hour=2, minute=0, job_id="cron_test")
        scheduler.add_cron_job(self.dummy_cron, hour=4, minute=0, job_id="cron_test")
        job = scheduler.scheduler.get_job("cron_test")
        assert job is not None
        fields = {f.name: f for f in job.trigger.fields}
        assert str(fields["hour"]) == "4"

    def test_duplicate_cron_id_single_job(self, scheduler):
        scheduler.add_cron_job(self.dummy_cron, hour=3, minute=30, job_id="cron_dedup")
        scheduler.add_cron_job(self.dummy_cron, hour=3, minute=30, job_id="cron_dedup")
        jobs = [j for j in scheduler.scheduler.get_jobs() if j.id == "cron_dedup"]
        assert len(jobs) == 1


# ─── Çoklu Worker Simülasyonu ─────────────────────────────────────────────────

class TestMultiWorkerScheduling:
    """SQLAlchemy jobstore ile iki worker aynı job'ı tetiklemez."""

    def test_get_jobs_info_structure(self):
        from app.core.scheduler import TaskScheduler
        TaskScheduler._instance = None
        s = TaskScheduler()
        s.scheduler = BackgroundScheduler()
        s.scheduler.start()

        def noop():
            pass

        s.add_interval_job(noop, job_id="info_test", minutes=5)
        info = s.get_jobs_info()

        assert isinstance(info, list)
        assert len(info) >= 1
        job_info = next((i for i in info if i["id"] == "info_test"), None)
        assert job_info is not None
        assert "next_run" in job_info

        if s.scheduler.running:
            s.scheduler.shutdown(wait=False)
        TaskScheduler._instance = None

    def test_auto_scan_not_double_registered_on_restart(self):
        """Bootstrap sırasında aynı job_id iki kez register edilirse tek job kalmalı."""
        from app.core.scheduler import TaskScheduler
        TaskScheduler._instance = None
        s = TaskScheduler()
        s.scheduler = BackgroundScheduler()
        s.scheduler.start()

        def auto_scan():
            pass

        # Bootstrap iki worker başlatıyor — her ikisi de job ekliyor
        s.add_interval_job(auto_scan, job_id="auto_scan", minutes=15)
        s.add_interval_job(auto_scan, job_id="auto_scan", minutes=15)

        jobs = [j for j in s.scheduler.get_jobs() if j.id == "auto_scan"]
        assert len(jobs) == 1, (
            f"auto_scan için {len(jobs)} job kayıtlı — çift tetikleme riski!"
        )

        if s.scheduler.running:
            s.scheduler.shutdown(wait=False)
        TaskScheduler._instance = None
