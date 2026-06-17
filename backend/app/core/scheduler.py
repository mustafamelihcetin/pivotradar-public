# backend/app/core/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
import logging

try:
    from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
except ImportError:
    SQLAlchemyJobStore = None  # type: ignore

logger = logging.getLogger("PivotRadar.Scheduler")


def _on_job_error(event):
    """APScheduler job hatalarını Sentry'e ve log'a ilet."""
    exc = getattr(event, "exception", None)
    if exc is None:
        return
    logger.error(
        "Scheduled job '%s' raised an exception: %s",
        event.job_id, exc, exc_info=(type(exc), exc, exc.__traceback__)
    )
    try:
        import sentry_sdk
        if sentry_sdk.is_initialized():
            with sentry_sdk.new_scope() as scope:
                scope.set_tag("scheduler_job_id", event.job_id)
                sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def _build_scheduler() -> BackgroundScheduler:
    """
    SQLAlchemy jobstore kullanmayı dene — tüm worker'lar ortak DB üzerinden
    senkronize olur, böylece her 15 dakikada sadece BİR worker görevi tetikler.
    Paket yoksa veya DB bağlanamıyorsa in-memory fallback kullan.
    """
    import os
    try:
        if SQLAlchemyJobStore is not None:
            db_url = os.environ.get("DATABASE_URL", "postgresql://pivot_user:pivot_pass@db/pivotradar")
            if db_url:
                jobstores = {"default": SQLAlchemyJobStore(url=db_url, tablename="apscheduler_jobs")}
                sched = BackgroundScheduler(jobstores=jobstores)
                logger.info("Scheduler: SQLAlchemy jobstore aktif (çift-tetiklenme engellendi).")
                return sched
    except Exception as _e:
        logger.info(f"Scheduler: SQLAlchemy jobstore kurulamadı ({_e}), in-memory kullanılıyor.")
    return BackgroundScheduler()


class TaskScheduler:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TaskScheduler, cls).__new__(cls)
            cls._instance.scheduler = _build_scheduler()
            cls._instance.jobs = {}
        return cls._instance

    def start(self):
        if not self.scheduler.running:
            from apscheduler.events import EVENT_JOB_ERROR as _EVT_ERR
            self.scheduler.add_listener(_on_job_error, mask=_EVT_ERR)
            self.scheduler.start()
            logger.info("Scheduler started.")

    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Scheduler shut down.")

    def add_interval_job(self, func, job_id: str,
                          hours: int = 0, minutes: int = 0, run_now: bool = False):
        """Adds or updates an interval job. Supports hours and/or minutes.

        Uses remove+add instead of reschedule_job to ensure the function
        reference is refreshed — reschedule_job only updates timing and
        silently runs the old pickled function after a restart.
        """
        total_minutes = hours * 60 + minutes
        if total_minutes <= 0:
            self.remove_job(job_id)
            return

        trigger = IntervalTrigger(minutes=total_minutes)
        label = f"{total_minutes}m"
        import datetime as _dt
        # next_run_time=None APScheduler'da "paused" anlamına gelir — run_now=False ise
        # parametreyi hiç gönderme, trigger kendi fire time'ını hesaplasın.
        if run_now:
            self.scheduler.add_job(func, trigger, id=job_id, replace_existing=True,
                                   next_run_time=_dt.datetime.now(_dt.timezone.utc))
        else:
            self.scheduler.add_job(func, trigger, id=job_id, replace_existing=True)
        logger.info(f"Job {job_id} registered every {label}" +
                    (" (fires immediately)" if run_now else "") + ".")

    def add_cron_job(self, func, hour: int, job_id: str, minute: int = 0):
        """Adds or updates a daily cron job.

        Uses remove+add to refresh function reference (same reason as add_interval_job).
        """
        trigger = CronTrigger(hour=hour, minute=minute)
        self.scheduler.add_job(func, trigger, id=job_id, replace_existing=True)
        logger.info(f"Job {job_id} registered at {hour:02d}:{minute:02d} daily.")

    def remove_job(self, job_id: str):
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
            logger.info(f"Job {job_id} removed.")

    def get_jobs_info(self):
        """Returns metadata about registered jobs."""
        info = []
        for job in self.scheduler.get_jobs():
            info.append({
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })
        return info

scheduler_manager = TaskScheduler()
