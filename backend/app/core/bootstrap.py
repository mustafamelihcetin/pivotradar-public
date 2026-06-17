# backend/app/core/bootstrap.py
"""
Application bootstrap — startup/shutdown lifecycle.

3 aşamalı başlatma:
  1. run_schema_migrations()  — Alembic upgrade head
  2. run_runtime_patches()    — ALTER TABLE (Alembic'e taşınana kadar)
  3. run_data_seeding()       — Strategy profiles + ML seed
"""
import os
import sys
import logging
import datetime
import threading
import subprocess
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import text
from app.core import settings
from app.core.database import engine, Base, SessionLocal
from app.core.scheduler import scheduler_manager

logger = logging.getLogger(__name__)


def bootstrap_app(app: FastAPI):
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        _t0 = time.monotonic()
        logger.info("PIVOTRADAR — BOOTSTRAP INITIALIZING...")

        def _phase(name: str, fn):
            """Kritik adım: hata olursa exception propagate eder, bootstrap durur."""
            _ts = time.monotonic()
            fn()
            logger.info(f"BOOTSTRAP [{name}] {int((time.monotonic()-_ts)*1000)}ms")

        def _safe_phase(name: str, fn):
            """Opsiyonel adım: hata olursa loglanır, bootstrap devam eder."""
            _ts = time.monotonic()
            try:
                fn()
                logger.info(f"BOOTSTRAP [{name}] {int((time.monotonic()-_ts)*1000)}ms")
            except Exception as _e:
                logger.warning(f"BOOTSTRAP [{name}] SKIPPED ({int((time.monotonic()-_ts)*1000)}ms): {_e}")

        # ── Kritik adımlar: başarısız olursa uygulama başlamaz ───────────────
        _phase("integrity",     _verify_system_integrity)
        _phase("scanner_reset", _reset_scanner_state)
        _phase("migrations",    run_schema_migrations)
        _phase("patches",       run_runtime_patches)
        _phase("tables",        _ensure_feature_tables)
        _phase("seeding",       run_data_seeding)

        # ── Opsiyonel adımlar: başarısız olursa degraded modda devam ─────────
        _safe_phase("self_heal",  _run_startup_heal)
        _safe_phase("scheduler",  _setup_scheduler)
        _safe_phase("rescue",     _start_rescue_thread)
        _safe_phase("cache_warm", _start_analyze_cache_warm)
        _safe_phase("chart_warm", _start_chart_cache_warm)

        logger.info(f"PIVOTRADAR — RUNTIME BOOTSTRAP COMPLETE in {int((time.monotonic()-_t0)*1000)}ms")

        try:
            yield
        finally:
            logger.info("SHUTTING DOWN...")
            _cleanup_app()
            logger.info("CLEANUP COMPLETE.")

    app.router.lifespan_context = lifespan


# ── Phase 1: Schema migrations (Alembic) ─────────────────────────────────────

def run_schema_migrations():
    """Alembic upgrade head — deterministik, idempotent."""
    try:
        import alembic  # noqa: F401
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(Path(__file__).parent.parent.parent),
            capture_output=True, text=True, timeout=60,
        )
        combined = (result.stdout + result.stderr).strip()
        if result.returncode == 0:
            logger.info(f"ALEMBIC: {result.stdout.strip() or 'up to date'}")
        elif "script_location" in combined or "alembic.ini" in combined:
            logger.info("ALEMBIC: alembic.ini not found — skipping migrations (runtime patches active).")
        else:
            stderr = result.stderr.strip()
            if "No module named alembic" not in stderr:
                logger.warning(f"ALEMBIC: {combined[:500]}")
    except ImportError:
        logger.info("ALEMBIC: not installed, skipping.")
    except Exception as e:
        logger.warning(f"ALEMBIC: {e}")


# ── Phase 2: Runtime schema patches (to be migrated to Alembic over time) ────

def run_runtime_patches():
    """
    ALTER TABLE patches — köprü: yeni kolonlar Alembic migration'a taşınana kadar burada.
    Her patch `ADD COLUMN IF NOT EXISTS` ile idempotent.
    """
    is_pg = "postgresql" in engine.url.drivername
    if not is_pg:
        logger.warning("SCHEMA PATCH: Non-PostgreSQL DB detected — runtime patches skipped. Use PostgreSQL in production.")
        return

    try:
        with engine.connect() as conn:
            conn.execute(text("SET lock_timeout = '3s'"))
            _patch_users_table(conn)
            _patch_scan_tables(conn)
            _patch_ml_perf_table(conn)
            _patch_rate_limit_table(conn)
            _patch_support_table(conn)
            _patch_audit_table(conn)
            _ensure_indexes(conn)
            conn.commit()
        logger.info("SCHEMA PATCH: completed.")
    except Exception as e:
        if "lock_timeout" in str(e).lower():
            logger.info("SCHEMA PATCH: skipped (lock timeout — another instance running).")
        else:
            logger.warning(f"SCHEMA PATCH: {e}")


def _patch_rate_limit_table(conn):
    try:
        # Failsafe: Create rate_limit_records if missing
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rate_limit_records (
                id SERIAL PRIMARY KEY,
                key VARCHAR NOT NULL,
                timestamp TIMESTAMP,
                hits INTEGER DEFAULT 1
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rate_limit_records_key ON rate_limit_records (key)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rate_limit_records_timestamp ON rate_limit_records (timestamp)"))
        
        # Failsafe: Create token_blacklist if missing
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS token_blacklist (
                id SERIAL PRIMARY KEY,
                jti VARCHAR UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_token_blacklist_jti ON token_blacklist (jti)"))

        # Failsafe: Create ml_performance_stats if missing
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ml_performance_stats (
                id SERIAL PRIMARY KEY,
                profile VARCHAR NOT NULL,
                timestamp TIMESTAMP,
                win_rate FLOAT,
                directional_win_rate FLOAT,
                target_hit_rate FLOAT,
                avg_magnitude_deviation FLOAT,
                avg_target_distance FLOAT,
                rmse FLOAT,
                n_evaluated INTEGER,
                n_hits INTEGER,
                n_directional INTEGER
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ml_perf_profile_ts ON ml_performance_stats (profile, timestamp)"))

        # Failsafe: Create system_task_logs if missing
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_task_logs (
                id SERIAL PRIMARY KEY,
                task_name VARCHAR NOT NULL,
                started_at TIMESTAMP,
                finished_at TIMESTAMP,
                status VARCHAR DEFAULT 'running',
                message TEXT,
                duration FLOAT
            )
        """))

        # Distributed lock table for calibration/retrain concurrency control
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_locks (
                lock_key VARCHAR PRIMARY KEY,
                acquired_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL
            )
        """))

        # DB-persistent profile score cache — survives restarts, shared across workers
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS profile_score_cache (
                id SERIAL PRIMARY KEY,
                profile_name VARCHAR NOT NULL,
                batch_id VARCHAR NOT NULL,
                top_n INTEGER NOT NULL DEFAULT 1000,
                overrides_hash VARCHAR NOT NULL DEFAULT '',
                computed_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                result_json TEXT NOT NULL,
                UNIQUE(profile_name, batch_id, top_n, overrides_hash)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_profile_score_cache_lookup "
            "ON profile_score_cache (profile_name, batch_id, expires_at)"
        ))
        
        # Column level patches (idempotent)
        conn.execute(text("ALTER TABLE rate_limit_records ADD COLUMN IF NOT EXISTS hits INTEGER DEFAULT 1"))

        # Prune rate_limit_records older than 24h — prevents unbounded growth
        conn.execute(text("DELETE FROM rate_limit_records WHERE timestamp < NOW() - INTERVAL '24 hours'"))

        # Prune expired token blacklist entries
        conn.execute(text("DELETE FROM token_blacklist WHERE expires_at < NOW()"))
    except Exception as e:
        logger.debug(f"Persistence tables failsafe: {e}")


def _patch_support_table(conn):
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS support_messages (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR NOT NULL,
                subject VARCHAR NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                is_read BOOLEAN DEFAULT FALSE,
                is_responded BOOLEAN DEFAULT FALSE,
                source VARCHAR DEFAULT 'contact',
                user_id INTEGER
            )
        """))
        conn.execute(text("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'contact'"))
        conn.execute(text("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    except Exception as e:
        logger.debug(f"Support table patch: {e}")


def _patch_audit_table(conn):
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(50) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                detail JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_logs(user_id, created_at DESC)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC)"
        ))
        # last_login_ip kolonu users tablosuna ekle (şüpheli giriş tespiti için)
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)"))
    except Exception as e:
        logger.debug(f"audit_logs patch: {e}")


def _ensure_feature_tables():
    """
    Tablo oluşturmayı ayrı bir bağlantıyla garantiye alır.
    _patch_* fonksiyonları paylaşılan conn üzerinde çalışır; önceki bir patch
    transaction'ı abort ederse sonrakiler sessizce atlanabilir. Bu fonksiyon
    SQLAlchemy metadata.create_all ile tamamen bağımsız çalışır.
    """
    try:
        from app.features.support.models import SupportMessage  # noqa: F401
        Base.metadata.create_all(engine, tables=[SupportMessage.__table__], checkfirst=True)
        logger.info("FEATURE TABLES: support_messages ensured.")
    except Exception as e:
        logger.warning(f"FEATURE TABLES: {e}")


def _patch_users_table(conn):
    cols = {
        "settings":              "JSON DEFAULT '{}'",
        "google_id":             "VARCHAR UNIQUE",
        "profile_picture":       "VARCHAR",
        "hashed_password":       "VARCHAR",
        "email_verified":        "BOOLEAN DEFAULT FALSE",
        "verification_token":    "VARCHAR",
        "reset_token":           "VARCHAR",
        "reset_token_expires":   "TIMESTAMP",
        "force_password_change": "BOOLEAN DEFAULT FALSE",
        "strategy_profile_id":   "INTEGER",
        "role":                  "VARCHAR DEFAULT 'VIEWER'",
        # 2FA columns
        "totp_secret":                 "VARCHAR",
        "totp_enabled":                "BOOLEAN DEFAULT FALSE",
        "totp_confirmed":              "BOOLEAN DEFAULT FALSE",
        "verification_token_expires":  "TIMESTAMP",
    }
    for col, col_type in cols.items():
        try:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {col_type}"))
        except Exception as e:
            logger.debug(f"users.{col}: {e}")

    # api_keys table
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR NOT NULL,
                key_hash VARCHAR UNIQUE NOT NULL,
                key_prefix VARCHAR NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                last_used TIMESTAMP,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_keys_key_hash ON api_keys (key_hash)"))
    except Exception as e:
        logger.debug(f"api_keys table: {e}")


def _patch_scan_tables(conn):
    f_type = "DOUBLE PRECISION"
    # Columns common to both tables (types must match the ORM models)
    common_cols = {
        "volume":                   "FLOAT",
        "hit_accuracy_pct":         "FLOAT",
        "hit_status":               "VARCHAR",
        "data_time":                "TIMESTAMP",
        "pattern_score":            "INTEGER",
        "ml_score":                 f_type,
        "momentum":                 f_type,
        "breakout":                 f_type,
        "target_direction":         "VARCHAR",
        "predicted_days":           "INTEGER",
        "directional_hit":          "BOOLEAN",
        "predicted_return_pct":     f_type,
        "magnitude_deviation_pct":  f_type,
        "ema20_gap":                f_type,
        "ema50_gap":                f_type,
        "range_pct":                f_type,
        "body_pct":                 f_type,
        "raw_features":             "TEXT",
        "veto_reasons":             "VARCHAR",
        "strategy_snapshot":        "TEXT",
    }
    # Extended technical + macro indicators (Phase 2/3)
    extended_cols = {
        "w52_position":           f_type,
        "dist_from_52w_high":     f_type,
        "dist_from_52w_low":      f_type,
        "volume_zscore":          f_type,
        "ret_3d":                 f_type,
        "ret_acceleration":       f_type,
        "consecutive_down_days":  "INTEGER",
        "close_position":         f_type,
        "ema_alignment_score":    "INTEGER",
        "trend_duration_days":    "INTEGER",
        "bist100_trend_5d":       f_type,
        "vix_regime":             "INTEGER",
        "usdtry_change_5d":       f_type,
        "sector_rel_strength_5d": f_type,
        "pattern_is_stale":       "BOOLEAN",
        "secondary_pattern_name": "VARCHAR",
    }
    common_cols.update(extended_cols)

    # scan_scores.target_price is FLOAT (ORM: Column(Float))
    # symbol_data_cache.target_price is VARCHAR (ORM: Column(String))
    table_extra = {
        "scan_scores": {
            "target_price": f_type, "stop_price": f_type, "risk_reward": f_type,
            "bist100_return_on_date": f_type, "alpha": f_type,
            "outperformed_benchmark": "BOOLEAN",
        },
        "symbol_data_cache":  {
            "target_price": "VARCHAR",
            "open_price":   f_type,
            "high_price":   f_type,
            "low_price":    f_type,
            "source_tag":   "VARCHAR",
        },
    }
    for table in ("scan_scores", "symbol_data_cache"):
        cols = {**common_cols, **table_extra.get(table, {})}
        for col, col_type in cols.items():
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {col_type}'))
            except Exception as e:
                logger.debug(f"{table}.{col}: {e}")


def _patch_ml_perf_table(conn):
    f_type = "DOUBLE PRECISION"
    for col, col_type in {
        "avg_magnitude_deviation": f_type,
        "avg_target_distance":     f_type,
        "avg_alpha":               f_type,
        "benchmark_win_rate":      f_type,
    }.items():
        try:
            conn.execute(text(
                f"ALTER TABLE ml_performance_stats ADD COLUMN IF NOT EXISTS {col} {col_type}"
            ))
        except Exception as e:
            logger.debug(f"ml_performance_stats.{col}: {e}")


def _ensure_indexes(conn):
    try:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_scan_scores_evaluated_at ON scan_scores (evaluated_at)"
        ))
    except Exception:
        pass

    try:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_scan_scores_date_direction ON scan_scores (scan_date, target_direction)"
        ))
    except Exception:
        pass

    # Fix SymbolDataCache.target_price type: String → Float (safe cast via USING)
    try:
        conn.execute(text(
            "ALTER TABLE symbol_data_cache "
            "ALTER COLUMN target_price TYPE FLOAT USING target_price::FLOAT"
        ))
    except Exception:
        pass  # Already Float or column doesn't exist yet

    # Data lineage: source_tag column
    try:
        conn.execute(text(
            "ALTER TABLE symbol_data_cache ADD COLUMN IF NOT EXISTS source_tag VARCHAR"
        ))
    except Exception:
        pass

    # Full OHLC columns for gap-fill integrity
    for _col in ("open_price", "high_price", "low_price"):
        try:
            conn.execute(text(f"ALTER TABLE symbol_data_cache ADD COLUMN IF NOT EXISTS {_col} FLOAT"))
        except Exception:
            pass

    # Pattern cache unification: grafik ve liste aynı kaynaktan beslensin.
    # Scanner'ın detect_patterns_validated() sonucu buraya yazılır; chart engine tekrar
    # hesaplamak yerine bu JSON'u okur → hem tutarlılık sağlanır hem CPU tasarrufu yapılır.
    try:
        conn.execute(text("ALTER TABLE symbol_data_cache ADD COLUMN IF NOT EXISTS pattern_json TEXT"))
    except Exception:
        pass


# ── Phase 3: Data seeding ─────────────────────────────────────────────────────

def run_data_seeding():
    """Strategy profiles + default settings seed — idempotent."""
    _seed_strategy_profiles()
    _run_data_fixes()


def _seed_strategy_profiles():
    try:
        from app.features.users.models import StrategyProfile
        db = SessionLocal()
        try:
            profiles = [
                (1, "Güvenli Liman",     "#22d3ee", "Maksimum Sermaye Koruması & Risk Optimizasyonu"),
                (2, "Agresif Atak",      "#f87171", "Yüksek Risk - Keskin Momentum"),
                (3, "Dönüş Uzmanı",      "#34d399", "Kısa Vadeli Dip ve Dönüşler"),
                (4, "Trend Avcısı",      "#fbbf24", "Güçlü Momentum Takibi"),
                (5, "Değer Kaşifi",      "#a78bfa", "Teknik Olarak Düşük Fiyatlı"),
                (6, "Anlık Fırsatçı",    "#fb923c", "Yüksek Frekanslı Hızlı Atak"),
                (7, "Kırılım Dedektörü", "#a855f7", "Teknik Formasyon Kırılımları"),
            ]
            for pid, name, color, desc in profiles:
                existing = db.query(StrategyProfile).filter(StrategyProfile.id == pid).first()
                if not existing:
                    db.add(StrategyProfile(id=pid, name=name, color=color, description=desc))
                else:
                    existing.name = name
                    existing.color = color
                    existing.description = desc
            db.commit()
            logger.info("SEED: strategy profiles verified.")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"SEED ERROR: {e}")


def _run_data_fixes():
    """One-time idempotent data repairs."""
    _fix_neutral_target_hits()
    _fix_premature_evaluations()


def _fix_neutral_target_hits():
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE scan_scores SET target_hit = NULL "
                "WHERE target_direction = 'neutral' AND target_hit IS NOT NULL"
            ))
            conn.commit()
    except Exception as e:
        logger.warning(f"DATA FIX (neutral hits): {e}")


def _fix_premature_evaluations():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE scan_scores
                SET evaluated_at=NULL, target_hit=NULL, actual_return_pct=NULL,
                    actual_price_at_eval=NULL, max_gain_pct=NULL, max_loss_pct=NULL,
                    directional_hit=NULL, predicted_return_pct=NULL,
                    magnitude_deviation_pct=NULL
                WHERE evaluated_at IS NOT NULL
                  AND predicted_days IS NOT NULL
                  AND target_direction IN ('bullish', 'bearish')
                  AND (scan_date + (predicted_days * 1.5 * INTERVAL '1 day'))::date > evaluated_at::date
            """))
            conn.commit()
    except Exception as e:
        logger.warning(f"DATA FIX (premature eval): {e}")


# ── Supporting helpers ────────────────────────────────────────────────────────

def _bootstrap_ml_calib():
    try:
        from app.features.scoring.ml.ml_calib import bootstrap_seed_models
        bootstrap_seed_models()
    except Exception as e:
        logger.warning(f"ML CALIB: {e}")


def _reset_scanner_state():
    """Sunucu başlarken progress.json'u senkron olarak IDLE'a sıfırlar.
    Daemon thread kullanmaz — request kabul edilmeden önce dosya güncellenir."""
    try:
        import json as _json
        from app.core import settings as _s
        payload = _json.dumps({"state": "IDLE", "percent": 0, "stage": "IDLE", "message": "Sistem başlatıldı."})
        _s.PROGRESS_FILE.write_text(payload, encoding="utf-8")
        logger.info("SCANNER RESET: progress.json → IDLE")
    except Exception as e:
        logger.warning(f"SCANNER RESET: {e}")


def _cleanup_old_raw_features():
    """Null out raw_features JSONB on scan_scores older than 90 days to reclaim storage."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        result = db.execute(
            text(
                "UPDATE scan_scores SET raw_features = NULL "
                "WHERE scanned_at < NOW() - INTERVAL '90 days' AND raw_features IS NOT NULL"
            )
        )
        db.commit()
        logger.info("JSONB cleanup: %d rows cleared", result.rowcount)
    except Exception as e:
        db.rollback()
        logger.error("JSONB cleanup failed: %s", e)
    finally:
        db.close()


def _setup_scheduler():
    scheduler_manager.start()

    try:
        from app.features.scanner.tasks import run_auto_scan
        from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
        db = SessionLocal()
        try:
            cfg = get_system_setting(db, "scanner_config", DEFAULT_SETTINGS["scanner_config"])
            m = int(cfg.get("auto_scan_interval_minutes", 8))
            h = int(cfg.get("auto_scan_interval_hours", 0))
            scheduler_manager.add_interval_job(
                run_auto_scan, job_id="auto_scan", minutes=max(1, m + h * 60)
            )
        finally:
            db.close()
    except Exception as e:
        logger.error(f"SCHEDULER (auto_scan): {e}", exc_info=True)

    try:
        from app.features.scanner.logic.calibration_task import run_autonomous_calibration
        scheduler_manager.add_interval_job(
            run_autonomous_calibration, job_id="autonomous_calibration", hours=6
        )
    except Exception as e:
        logger.error(f"SCHEDULER (autonomous_calibration): {e}", exc_info=True)

    try:
        # Tam ML pipeline: evaluate_past_predictions → isotonic kalibrasyon → base model retrain.
        # run_autonomous_calibration yalnızca 3-20 günlük sinyallere bakar; bu görev tüm olgun kayıtları değerlendirir.
        from app.features.scoring.ml.training import run_calibration_pipeline
        scheduler_manager.add_cron_job(
            run_calibration_pipeline, hour=3, minute=30, job_id="ml_calibration_pipeline"
        )
    except Exception as e:
        logger.error(f"SCHEDULER (ml_calibration_pipeline): {e}", exc_info=True)

    try:
        from app.features.admin.maintenance import run_smart_maintenance
        scheduler_manager.add_cron_job(run_smart_maintenance, hour=2, minute=0, job_id="system_maintenance")
    except Exception as e:
        logger.error(f"SCHEDULER (system_maintenance): {e}", exc_info=True)

    try:
        from app.features.admin.tasks import run_anomaly_check
        scheduler_manager.add_cron_job(run_anomaly_check, hour=4, minute=30, job_id="anomaly_check")
    except Exception as e:
        logger.error(f"SCHEDULER (anomaly_check): {e}", exc_info=True)

    try:
        from app.core.self_heal import runtime_status
        scheduler_manager.add_interval_job(runtime_status, job_id="self_heal_watchdog", minutes=5)
    except Exception as e:
        logger.error(f"SCHEDULER (self_heal_watchdog): {e}", exc_info=True)

    try:
        scheduler_manager.add_cron_job(
            _cleanup_old_raw_features, hour=2, minute=0, job_id="jsonb_cleanup"
        )
    except Exception as e:
        logger.error(f"SCHEDULER (jsonb_cleanup): {e}", exc_info=True)


def _start_analyze_cache_warm():
    """Startup'ta mevcut SymbolDataCache verisi varsa tüm profil skorlarını DB'ye yazar.
    30s gecikmeyle başlar (bootstrap bitsin diye). fcntl lock ile sadece 1 worker çalışır.
    """
    def _deferred_warm():
        import time as _t
        _t.sleep(30)  # Bootstrap ve diğer worker'ın da hazır olmasını bekle
        try:
            db = SessionLocal()
            try:
                from app.features.scanner.models import SymbolDataCache
                latest = db.query(SymbolDataCache).order_by(
                    SymbolDataCache.scanned_at.desc()
                ).first()
                if not latest:
                    logger.info("Startup warm: SymbolDataCache boş, atlanıyor.")
                    return
                import datetime as _dt
                age_h = (_dt.datetime.now(_dt.timezone.utc) -
                         latest.scanned_at.replace(tzinfo=_dt.timezone.utc)
                        ).total_seconds() / 3600
                if age_h > 48:
                    logger.info("Startup warm: veri %s saat eski, atlanıyor.", round(age_h, 1))
                    return
            finally:
                db.close()

            from app.features.scanner.routers.api_scan import warm_analyze_cache
            warm_analyze_cache()
            logger.info("Startup warm: tetiklendi.")
        except Exception as e:
            logger.warning("Startup warm: %s", e)

    threading.Thread(target=_deferred_warm, daemon=True, name="startup-warm").start()


_CHART_PREWARM_SYMBOLS = [
    "THYAO", "BIMAS", "ASELS", "EREGL", "GARAN",
    "AKBNK", "TUPRS", "SISE",  "KCHOL", "FROTO",
    "YKBNK", "ISCTR", "MGROS", "CCOLA", "ARCLK",
    "PETKM", "SASA",  "TOASO", "PGSUS", "TAVHL",
]

def _start_chart_cache_warm():
    """Startup'tan 60s sonra en popüler 20 hissenin grafiğini arka planda cache'ler."""
    def _warm():
        import time as _t
        _t.sleep(60)
        try:
            from app.features.charts.engine import build_chart_for_symbol
            from app.features.charts.router import _get_chart_cache, _set_chart_cache, _sanitize
            from datetime import timedelta
            from app.core.time_utils import now_utc
            start_date = (now_utc() - timedelta(days=730)).strftime('%Y-%m-%d')
            for sym in _CHART_PREWARM_SYMBOLS:
                cache_key = f"{sym}|candle|6M|None|None|Güvenli Liman"
                if _get_chart_cache(cache_key) is not None:
                    continue
                try:
                    payload = build_chart_for_symbol(
                        sym, "candle", days=730, start_date=start_date,
                        profile_name="Güvenli Liman",
                    )
                    payload["initial_period_hint"] = "6M"
                    _set_chart_cache(cache_key, _sanitize(payload))
                    logger.info("Chart warm: %s OK", sym)
                except Exception as e:
                    logger.debug("Chart warm: %s skip — %s", sym, e)
                _t.sleep(1.5)  # yfinance rate-limit koruması
        except Exception as e:
            logger.warning("Chart warm thread: %s", e)

    threading.Thread(target=_warm, daemon=True, name="chart-warm").start()


def _start_rescue_thread():
    def _rescue():
        import time, random
        time.sleep(random.uniform(5, 25))
        from app.features.scanner.models import SymbolDataCache
        from app.features.scanner.tasks import _expected_last_trading_date, run_auto_scan
        db = SessionLocal()
        try:
            latest = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
            if not latest:
                run_auto_scan(force=True)
                return
            import pytz
            ist_now = datetime.datetime.now(pytz.timezone("Europe/Istanbul"))
            expected = _expected_last_trading_date(ist_now)
            data_date = latest.data_date
            if data_date and hasattr(data_date, "date"):
                data_date = data_date.date()
            if not data_date or data_date < expected:
                run_auto_scan(force=True)
        finally:
            db.close()

    try:
        threading.Thread(target=_rescue, daemon=True, name="startup-rescue").start()
    except Exception as e:
        logger.warning(f"RESCUE THREAD: {e}")


def _run_startup_heal():
    """Self-healing startup: crash recovery + sistem sağlık raporu."""
    try:
        from app.core.self_heal import startup_heal
        from app.core.notify import notify_startup_degraded
        report = startup_heal()
        if report.get("overall") == "degraded":
            logger.warning("[Bootstrap] Self-heal: sistem degraded durumda → %s", report)
            try:
                notify_startup_degraded(report)
            except Exception as _ne:
                logger.debug("[Bootstrap] Startup notification gönderilemedi: %s", _ne)
    except Exception as e:
        logger.warning("[Bootstrap] Self-heal atlandı: %s", e)


def _cleanup_app():
    try:
        from app.features.scanner.router import _STOP_EVENT, _write_progress, _ACTIVE
        if _ACTIVE.get("user_id") is not None:
            _STOP_EVENT.set()
            _write_progress("IDLE", 0, "IDLE", "Sistem yeniden başlatıldı.")
    except Exception:
        pass
    scheduler_manager.shutdown()


def _verify_system_integrity():
    dirs = [
        Path(os.getcwd()) / "logs",
        Path(os.getcwd()) / "data",
        Path(os.getcwd()) / "assets" / "models",
        Path(os.getcwd()) / "db_backups",
        settings.PROGRESS_FILE.parent,
        settings.EOD_DIR,
    ]
    for d in dirs:
        if not d.exists():
            try:
                d.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                logger.error(f"INTEGRITY: could not create {d}: {e}")
