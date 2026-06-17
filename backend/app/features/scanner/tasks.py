# backend/app/features/scanner/tasks.py
import logging
import time
import datetime
import json
import pytz
from app.core.database import SessionLocal
from app.features.admin.utils import get_system_setting, get_system_load
from app.features.scanner.router import push_to_scan_queue

logger = logging.getLogger("PivotRadar.Tasks")
from app.core.task_history import record_task_start, record_task_end, get_last_success_time
from app.core.time_utils import now_utc
from app.features.scanner.utils import get_market_status
from app.features.market_data.service import MarketDataService

_IST = pytz.timezone("Europe/Istanbul")


def _ist_now() -> datetime.datetime:
    return datetime.datetime.now(_IST)


def _get_cache_age_minutes() -> float:
    """Son SymbolDataCache kaydının kaç dakika önce oluşturulduğunu döner."""
    try:
        from app.features.scanner.models import SymbolDataCache
        db = SessionLocal()
        try:
            latest = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
            if not latest or not latest.scanned_at:
                return float('inf')
            age = (now_utc().replace(tzinfo=None) - latest.scanned_at.replace(tzinfo=None)).total_seconds() / 60
            return max(0, age)
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[AUTO-SCAN] Cache yaşı okunamadı: {e}")
        return float('inf')


def _get_cache_data_date() -> datetime.date | None:
    """Son SymbolDataCache kaydının data_date alanını döner."""
    try:
        from app.features.scanner.models import SymbolDataCache
        db = SessionLocal()
        try:
            latest = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
            if not latest or not latest.data_date:
                return None
            dd = latest.data_date
            if hasattr(dd, 'date') and callable(dd.date):
                return dd.date()
            if isinstance(dd, datetime.date):
                return dd
            if isinstance(dd, str):
                return datetime.date.fromisoformat(dd)
            return None
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[AUTO-SCAN] Cache data_date okunamadı: {e}")
        return None


def _get_cache_scanned_at() -> datetime.datetime | None:
    """Son SymbolDataCache kaydının scanned_at zamanını döner (UTC naive)."""
    try:
        from app.features.scanner.models import SymbolDataCache
        db = SessionLocal()
        try:
            latest = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
            if not latest or not latest.scanned_at:
                return None
            sa = latest.scanned_at
            # DB stores naive UTC; strip any tz info to ensure naive
            return sa.replace(tzinfo=None) if hasattr(sa, 'replace') else None
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[AUTO-SCAN] Cache scanned_at okunamadı: {e}")
        return None


def _expected_last_trading_date(now: datetime.datetime) -> datetime.date:
    """
    Verilen Istanbul zamanına göre beklenen son BIST işlem gününü hesaplar.
    Hafta sonları ve resmi BIST tatillerini dikkate alır.

    Mantık:
      - Piyasa şu an açıksa (09:50+) → bugün
      - Değilse → geri giderek en son işlem günü bul (maks 7 gün geriye)
    """
    from app.core.market_calendar import is_trading_day

    mod   = now.hour * 60 + now.minute
    today = now.date()

    # Seans penceresi başlamışsa (09:50+) ve bugün işlem günüyse → bugün beklenen
    if mod >= 590 and is_trading_day(today):
        return today

    # Geriye giderek en son işlem günü bul
    candidate = today
    for _ in range(10):
        candidate -= datetime.timedelta(days=1)
        if is_trading_day(candidate):
            return candidate

    return today - datetime.timedelta(days=1)  # fallback


def _minutes_since_last_success(task_name: str = "auto_scan") -> float:
    """Son başarılı taramadan bu yana geçen dakika sayısını döner."""
    last = get_last_success_time(task_name)
    if not last:
        return float('inf')
    return (now_utc().replace(tzinfo=None) - last.replace(tzinfo=None)).total_seconds() / 60


def _unstick_scanner(max_age_min: int = 35):
    """
    If the scan worker has been running for longer than max_age_min without
    completing, force-clear ACTIVE and reset progress.json to IDLE.

    This handles the case where a single symbol hangs indefinitely (e.g. a
    blocking network call that never calls progress_hook), causing the watchdog's
    STOP_EVENT to be ignored and all subsequent auto_scan calls to be blocked.
    """
    try:
        from app.features.scanner.logic.state import ACTIVE, STATE_LOCK, STOP_EVENT
        from app.core import settings as _s

        with STATE_LOCK:
            started_at = ACTIVE.get("started_at")
            if started_at is None:
                return
            elapsed_min = (time.time() - started_at) / 60
            if elapsed_min < max_age_min:
                return

            logger.warning(
                "[AUTO-SCAN] Tarama %d dakikadır yanıt vermiyor — durum sıfırlanıyor "
                "(user_id=%s, started_at=%.0f).",
                int(elapsed_min),
                ACTIVE.get("user_id"),
                started_at,
            )
            ACTIVE["user_id"] = None
            ACTIVE["user_email"] = None
            ACTIVE["started_at"] = None

        # Signal the stuck thread to give up if it ever checks stop event
        STOP_EVENT.set()

        try:
            _s.PROGRESS_FILE.write_text(
                json.dumps({"state": "IDLE", "percent": 0, "stage": "IDLE", "msg": "Zaman aşımı — otomatik sıfırlama."}),
                encoding="utf-8",
            )
        except Exception:
            pass

    except Exception as e:
        logger.debug("[AUTO-SCAN] Unstick kontrolü atlandı: %s", e)


def run_auto_scan(force: bool = False):
    """
    Periyodik tarama görevi — tüm senaryoları kapsar.

    Senaryo matrisi:
    ┌─────────────────────────────────┬──────────────────────────────────────────────────┐
    │ Durum                           │ Davranış                                         │
    ├─────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Seans açık (10:00–18:15)        │ Her 8 dk'da bir (throttle)                       │
    │ Pre-market  (09:50–10:00)       │ Seans öncesi hazırlık, 8 dk throttle             │
    │ Post-market (18:15–18:30)       │ Kapanış yakalama, 15 dk throttle                 │
    │ Hafta içi gece, veri güncel     │ Atla                                             │
    │ Hafta içi gece, veri eski       │ 30 dk cooldown ile bir kez kurtarma              │
    │ Pazartesi 00:00–09:49, veri eskiamber│ Son taramadan 30 dk geçmişse kurtarma taraması  │
    │ Cumartesi / Pazar, veri var     │ Atla (BIST kapalı, veri değişmez)                │
    │ Cumartesi / Pazar, veri yok     │ İlk kurulum için bir kez çalış                   │
    │ force=True                      │ Tüm kontrolleri atla, direkt çalıştır            │
    └─────────────────────────────────┴──────────────────────────────────────────────────┘
    """
    _unstick_scanner()

    now         = _ist_now()
    weekday     = now.weekday()
    mod         = now.hour * 60 + now.minute
    status      = get_market_status()
    should_scan = status["should_scan"]
    is_open     = status["is_open"]
    mode        = status["mode"]

    if not force:
        if not should_scan:
            cache_age = _get_cache_age_minutes()

            # ── Hafta sonu (Cmt/Pzr): BIST kapalı, veri değişmez ────────────────────
            if weekday in (5, 6):
                if cache_age < float('inf'):
                    logger.debug(f"💤 [AUTO-SCAN] {mode} (hafta sonu, veri mevcut) — atlanıyor.")
                    return
                # Cache hiç yok → ilk kurulum
                logger.info("🆕 [AUTO-SCAN] Hafta sonu ama cache boş → ilk kurulum taraması.")
                # fall through

            # ── Hafta içi kapalı saatler (gece + Pzt sabahı seans öncesi) ────────────
            else:
                if cache_age == float('inf'):
                    # Hiç cache yok → ilk kurulum
                    logger.info("🆕 [AUTO-SCAN] Cache boş → ilk kurulum taraması.")
                    # fall through
                else:
                    data_date = _get_cache_data_date()
                    expected  = _expected_last_trading_date(now)

                    if data_date and data_date >= expected:
                        # Veri tarihi güncel — ama kapanış fiyatları yakalandı mı?
                        # Bug: eski kod sadece "bugün" tararsa yakalayor. Ama gece yarısından
                        # sonra scanned_ist.date() != now.date() olunca koşul false dönerdi,
                        # ve kapanış fiyatları sonsuza dek eksik kalırdı.
                        # Düzeltme: eşiği VERİ TARİHİ üzerinden hesapla, now üzerinden değil.
                        scanned_at_utc = _get_cache_scanned_at()
                        if scanned_at_utc is not None:
                            scanned_ist = pytz.UTC.localize(scanned_at_utc).astimezone(_IST)
                            # Kapanış eşiği: data_date günü 18:25 İST
                            close_threshold = _IST.localize(
                                datetime.datetime.combine(data_date, datetime.time(18, 25))
                            )
                            if scanned_ist < close_threshold:
                                # Tarama kapanış öncesinde → kapanış fiyatları eksik
                                elapsed = _minutes_since_last_success()
                                if elapsed < 30:
                                    logger.debug(
                                        f"⏸️ [AUTO-SCAN] Kapanış kurtarma cooldown ({elapsed:.0f}dk). Bekleniyor."
                                    )
                                    return
                                logger.info(
                                    f"📸 [AUTO-SCAN] {mode}: Son tarama {scanned_ist.strftime('%Y-%m-%d %H:%M')} İST "
                                    f"(kapanış 18:25 öncesi). Kapanış fiyatları için kurtarma taraması."
                                )
                                # fall through to scan
                            else:
                                logger.debug(
                                    f"💤 [AUTO-SCAN] {mode} — veri güncel, kapanış sonrası tarama mevcut "
                                    f"(data_date={data_date}, scanned={scanned_ist.strftime('%H:%M')}). Atlanıyor."
                                )
                                return
                        else:
                            logger.debug(
                                f"💤 [AUTO-SCAN] {mode} — veri güncel "
                                f"(data_date={data_date}, beklenen={expected}). Atlanıyor."
                            )
                            return

                    # Veri eski → cooldown kontrolü (30 dk)
                    elapsed = _minutes_since_last_success()
                    if elapsed < 30:
                        logger.debug(
                            f"⏸️ [AUTO-SCAN] Veri eski (data={data_date}, beklenen={expected}) "
                            f"ama son tarama {elapsed:.0f}dk önce yapıldı. Bekleniyor."
                        )
                        return

                    gap = (expected - data_date).days if data_date else "?"
                    logger.info(
                        f"🌙 [AUTO-SCAN] {mode} — veri {gap} gün eski "
                        f"(mevcut={data_date}, beklenen={expected}) → "
                        "kapalı saatte kurtarma taraması başlatılıyor."
                    )
                    # fall through to scan

        else:
            # ── Rescue: seans açık ama cache 3 saatten eskiyse throttle'ı atla ──────
            # Önce rescue kontrol et; eğer devredeyse throttle'ı geç.
            if is_open:
                cache_age = _get_cache_age_minutes()
                if cache_age > 180:
                    logger.warning(
                        f"🚨 [AUTO-SCAN] Cache {cache_age:.0f}dk eski! "
                        "Seans içi rescue taraması başlatılıyor."
                    )
                    force = True

            # ── Seans penceresi (should_scan=True): throttle kontrolü ────────────────
            if not force:
                elapsed = _minutes_since_last_success()
                # Seans içi: 8 dk; pre/post: 15 dk minimum aralık
                min_interval = 8 if is_open else 15
                if elapsed < min_interval:
                    logger.debug(
                        f"⏸️ [AUTO-SCAN] Son tarama {elapsed:.1f}dk önce "
                        f"(min {min_interval}dk). Bekleniyor."
                    )
                    return

            # ── Lightweight "head check": yfinance verisi beklenen günden eskiyse atla ──
            # NOT: cache_data_date ile değil, expected (son beklenen işlem günü) ile karşılaştır.
            # cache_data_date gün içi kısmi tarama nedeniyle bugünü gösterebilir; yfinance ise
            # tamamlanmış son bar tarihini (dünü) döner → yanlış skip'e yol açar.
            if is_open and not force:
                try:
                    svc = MarketDataService()
                    bundle = svc.fetch_price_df("THYAO", lookback_days=1)
                    df = bundle.df
                    if not df.empty and _get_cache_age_minutes() < 60:
                        last_price_date = df.index[-1].date() if hasattr(df.index[-1], 'date') else None
                        expected_date = _expected_last_trading_date(now)
                        if last_price_date and last_price_date < expected_date:
                            # yfinance veri beklenen işlem gününden önceyse: gerçek bir veri gecikmesi
                            logger.info(
                                f"⏸️ [AUTO-SCAN] YFinance verisi güncel değil "
                                f"(yfinance: {last_price_date}, beklenen: {expected_date}). Tarama atlanıyor."
                            )
                            return
                except Exception as e:
                    logger.debug(f"[AUTO-SCAN] Head-check atlandı: {e}")

    # Cross-worker scan lock: prevent two Gunicorn workers from scanning simultaneously.
    # TTL=20min (max scan duration). Lock is released when scan completes or on next
    # successful acquire after expiry. Only acquired if scan is actually QUEUED (below).
    _SCAN_LOCK_KEY = "auto_scan_running"
    _scan_lock_acquired = False
    try:
        from sqlalchemy import text as _text
        _db_lock = SessionLocal()
        try:
            _db_lock.execute(_text(
                "DELETE FROM system_locks WHERE lock_key = :key AND expires_at < NOW()"
            ), {"key": _SCAN_LOCK_KEY})
            _res = _db_lock.execute(_text(
                "INSERT INTO system_locks (lock_key, acquired_at, expires_at) "
                "VALUES (:key, NOW(), NOW() + INTERVAL '20 minutes') "
                "ON CONFLICT (lock_key) DO NOTHING"
            ), {"key": _SCAN_LOCK_KEY})
            _scan_lock_acquired = _res.rowcount == 1
            _db_lock.commit()
        finally:
            _db_lock.close()
        if not _scan_lock_acquired:
            logger.debug("[AUTO-SCAN] Başka worker tarama yapıyor (DB kilit). Atlanıyor.")
            return
    except Exception as _le:
        logger.debug(f"[AUTO-SCAN] DB kilit kontrolü atlandı: {_le}")

    logger.info(f"🔍 [AUTO-SCAN] MOD: {mode} {'(FORCE)' if force else ''} — TARAMA BAŞLATILIYOR...")
    log_id = record_task_start("auto_scan")

    db = SessionLocal()
    try:
        cfg     = get_system_setting(db, "scanner_config", {})
        enabled = cfg.get("auto_scan_enabled", True)

        if not enabled:
            logger.info("⏸️ [AUTO-SCAN] Ayarlardan devre dışı.")
            record_task_end(log_id, "success", "Disabled in settings")
            return

        # --- Dynamic Resource Scaling (10/10 Maturity) ---
        load = get_system_load()
        cpu_load = load.get("cpu", 0)
        
        # Base threads: 16 (default)
        # If CPU > 70% -> Reduce to 4
        # If CPU > 90% -> Reduce to 2 (safe mode)
        dynamic_threads = 16
        if cpu_load > 90:
            dynamic_threads = 2
        elif cpu_load > 70:
            dynamic_threads = 4
        elif cpu_load > 40:
            dynamic_threads = 8
            
        logger.info(f"📊 [AUTO-SCAN] Sistem yükü: CPU %{cpu_load:.1f}, RAM %{load.get('ram', 0):.1f} -> Dinamik thread: {dynamic_threads}")

        # V30 Hibrit Mantık: 2 saatte bir derin analiz (7-profil), diğerleri hızlı tarama
        is_deep = False
        if 10 <= now.hour <= 18:
            last_deep_time = get_last_success_time("deep_scan")
            if not last_deep_time:
                is_deep = True
            else:
                last_deep_ist = last_deep_time.replace(tzinfo=pytz.UTC).astimezone(_IST)
                # Son derin analizden bu yana 110 dk geçtiyse veya yeni günse
                if last_deep_ist.date() < now.date() or (now - last_deep_ist).total_seconds() >= 6600:
                    is_deep = True

        payload = {
            "profile_name": cfg.get("default_profile", "Güvenli Liman"),
            "max_symbols":  cfg.get("max_symbols", 1000),
            "use_ml":       cfg.get("ml_enabled", True),
            "use_patterns": cfg.get("pattern_enabled", True),
            "max_threads":  dynamic_threads,
            "is_background": is_deep,
        }
        
        deep_log_id = None
        if is_deep:
            deep_log_id = record_task_start("deep_scan")

        res = push_to_scan_queue(
            user_id=0,
            user_email="system@pivotradar.net",
            payload_dict=payload,
        )

        if res.get("ok"):
            msg = f"Kuyruğa eklendi. Mod: {mode} {'(DERİN)' if is_deep else '(HIZLI)'}"
            logger.info(f"🚀 [AUTO-SCAN] {msg}")
            record_task_end(log_id, "success", msg)
            if deep_log_id:
                record_task_end(deep_log_id, "success", "Deep scan queued")
        else:
            detail = res.get("detail")
            msg = f"Kuyruğa eklenemedi: {detail}"
            if detail == "Already active":
                logger.warning("⚠️ [AUTO-SCAN] Sistem meşgul (zaten aktif).")
            else:
                logger.warning(f"⚠️ [AUTO-SCAN] {msg}")
            record_task_end(log_id, "error", msg)
            if deep_log_id:
                record_task_end(deep_log_id, "error", msg)
            # Scan kuyruğa giremediyse kilidi serbest bırak — başka worker denesin
            if _scan_lock_acquired:
                try:
                    from sqlalchemy import text as _text
                    _db_rel = SessionLocal()
                    try:
                        _db_rel.execute(_text("DELETE FROM system_locks WHERE lock_key = :k"), {"k": _SCAN_LOCK_KEY})
                        _db_rel.commit()
                    finally:
                        _db_rel.close()
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"❌ [AUTO-SCAN] Hata: {e}", exc_info=True)
        record_task_end(log_id, "error", str(e))
    finally:
        db.close()
