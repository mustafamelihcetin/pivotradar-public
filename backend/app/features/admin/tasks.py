# backend/app/features/admin/tasks.py
import logging
import datetime
from sqlalchemy import text, func
from app.core.database import SessionLocal
from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
from app.features.scanner.models import ScanScore
from app.features.users.models import User
from app.core.task_history import record_task_start, record_task_end
from app.core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.AdminTasks")


def run_anomaly_check():
    """
    Son N günlük tahmin performansını kontrol eder.
    Eşikler admin panelinden (anomaly_config) yapılandırılabilir.
    win_rate < min veya avg_deviation > max → WARNING log + sistem ayarlarına alarm yaz.
    """
    log_id = record_task_start("anomaly_check")
    db = SessionLocal()
    try:
        # Eşikleri sistem ayarlarından oku (admin panelinde güncellenebilir)
        _default_anomaly = DEFAULT_SETTINGS["anomaly_config"]
        cfg = get_system_setting(db, "anomaly_config", _default_anomaly)
        win_rate_min  = float(cfg.get("win_rate_min",  _default_anomaly["win_rate_min"]))
        deviation_max = float(cfg.get("deviation_max", _default_anomaly["deviation_max"]))
        window_days   = int(cfg.get("window_days",     _default_anomaly["window_days"]))
        min_samples   = int(cfg.get("min_samples",     _default_anomaly["min_samples"]))

        cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=window_days)
        rows = (
            db.query(ScanScore)
            .filter(
                ScanScore.evaluated_at.isnot(None),
                ScanScore.directional_hit.isnot(None),
                ScanScore.scanned_at >= cutoff,
            )
            .all()
        )

        if len(rows) < min_samples:
            logger.info(f"[ANOMALY] Yeterli veri yok ({len(rows)} kayıt, minimum {min_samples}). Kontrol atlandı.")
            record_task_end(log_id, "success", f"insufficient_data: {len(rows)} rows")
            return

        dir_hits = sum(1 for r in rows if r.directional_hit)
        win_rate = dir_hits / len(rows)

        dev_vals = [r.magnitude_deviation_pct for r in rows if r.magnitude_deviation_pct is not None]
        avg_dev = sum(dev_vals) / len(dev_vals) if dev_vals else 0.0

        alerts = []
        if win_rate < win_rate_min:
            msg = f"ALARM: Yönsel isabet oranı kritik — win_rate={win_rate:.1%} (eşik: {win_rate_min:.0%}). Son {window_days} gün, {len(rows)} tahmin."
            logger.warning(f"[ANOMALY] {msg}")
            alerts.append(msg)

        if avg_dev > deviation_max:
            msg = f"ALARM: Hedef büyüklük sapması yüksek — avg_deviation={avg_dev:.1f}% (eşik: {deviation_max}%). Model kalibre edilmeli."
            logger.warning(f"[ANOMALY] {msg}")
            alerts.append(msg)

        if not alerts:
            logger.info(f"[ANOMALY] Sistem sağlıklı — win_rate={win_rate:.1%}, avg_dev={avg_dev:.1f}%, n={len(rows)}")
            record_task_end(log_id, "success", f"ok: win={win_rate:.2f} dev={avg_dev:.1f}")
        else:
            # SystemSettings tablosuna alarm yaz (admin paneli okuyabilsin)
            try:
                from app.features.admin.models import SystemSettings
                key = "anomaly_alerts"
                existing = db.query(SystemSettings).filter(SystemSettings.key == key).first()
                payload = {
                    "last_check": now_utc().replace(tzinfo=None).isoformat(),
                    "win_rate": round(win_rate, 4),
                    "avg_deviation": round(avg_dev, 2),
                    "sample_count": len(rows),
                    "alerts": alerts,
                }
                if existing:
                    existing.value = payload
                else:
                    db.add(SystemSettings(key=key, value=payload))
                db.commit()
            except Exception as _e:
                logger.error(f"[ANOMALY] Alert kaydedilemedi: {_e}")

            # E-posta ile admin'e bildir
            _send_anomaly_email(win_rate, avg_dev, len(rows), alerts)

            # A-1: Anomaly tespit edildi → otomatik recalibration + retrain tetikle.
            _trigger_autonomous_recovery(win_rate, avg_dev, len(rows))
            record_task_end(log_id, "warning", f"alerts: {len(alerts)}, auto-recovery triggered")

    except Exception as e:
        logger.error(f"[ANOMALY] Kontrol hatası: {e}")
        record_task_end(log_id, "error", str(e))
    finally:
        db.close()

def _trigger_autonomous_recovery(win_rate: float, avg_dev: float, sample_count: int) -> None:
    """
    A-1: Anomaly tespit edildiğinde otomatik iyileştirme zinciri başlatır.

    Strateji:
      1. İzotopik kalibrasyon parametrelerini sıfırla (en az invazif)
      2. Yeterli veri varsa (≥50) forced retrain başlat
      3. Telegram/log üzerinden operasyona bildir
    """
    import threading
    logger.warning(
        "[AUTO-RECOVERY] Anomaly → otonom iyileştirme başlatılıyor. "
        f"win_rate={win_rate:.1%}, avg_dev={avg_dev:.1f}%, n={sample_count}"
    )

    def _run():
        # Adım 1: Kalibrasyon pipeline'ını çalıştır (isotonic yeniden fit)
        try:
            from app.features.scoring.ml.training import run_calibration_pipeline
            run_calibration_pipeline()
            logger.info("[AUTO-RECOVERY] Adım 1 tamamlandı: Kalibrasyon pipeline çalıştı.")
        except Exception as _e:
            logger.error(f"[AUTO-RECOVERY] Kalibrasyon hatası: {_e}")

        # Adım 2: Yeterli veri varsa full retrain tetikle
        if sample_count >= 50:
            try:
                from app.features.scoring.ml.training import run_full_retrain
                run_full_retrain()
                logger.info("[AUTO-RECOVERY] Adım 2 tamamlandı: Full retrain çalıştı.")
            except Exception as _e:
                logger.error(f"[AUTO-RECOVERY] Retrain hatası: {_e}")
        else:
            logger.info(f"[AUTO-RECOVERY] Adım 2 atlandı: veri yetersiz ({sample_count} < 50).")

        # Adım 3: Bildirim gönder
        try:
            from app.core.notifier import send_alert
            send_alert(
                title="⚠️ PivotRadar: Anomaly Tespit Edildi",
                message=(
                    f"win_rate={win_rate:.1%}, avg_dev={avg_dev:.1f}%, n={sample_count}\n"
                    "Kalibrasyon ve retrain otomatik başlatıldı."
                ),
                level="warning",
            )
        except Exception as _e:
            logger.warning(f"[AUTO-RECOVERY] Bildirim gönderilemedi: {_e}")

    # Daemon thread — server'ı bloklamaz
    t = threading.Thread(target=_run, daemon=True, name="auto-recovery")
    t.start()


def _send_anomaly_email(win_rate: float, avg_dev: float, sample_count: int, alerts: list) -> None:
    try:
        from app.core.config import settings
        from app.core.email import send_email
        admin_email = getattr(settings, "SMTP_USERNAME", None) or "info@pivotradar.net"
        alert_lines = "".join(f"<li>{a}</li>" for a in alerts)
        html = f"""
        <h2>⚠️ PivotRadar Anomaly Alarmı</h2>
        <ul>{alert_lines}</ul>
        <table>
          <tr><td><b>Win Rate</b></td><td>{win_rate:.1%}</td></tr>
          <tr><td><b>Ort. Sapma</b></td><td>{avg_dev:.1f}%</td></tr>
          <tr><td><b>Örnek Sayısı</b></td><td>{sample_count}</td></tr>
        </table>
        <p>Sistem otomatik kalibrasyon ve retrain başlattı.</p>
        """
        send_email(to=admin_email, subject="⚠️ PivotRadar: Performans Anomalisi Tespit Edildi", html=html)
        logger.info(f"[ANOMALY] E-posta gönderildi → {admin_email}")
    except Exception as e:
        logger.warning(f"[ANOMALY] E-posta gönderilemedi: {e}")


def run_db_maintenance():
    """Daily database maintenance: pruning old records and optimizing tables."""
    logger.info("🧹 [DB-MAINTENANCE] VERİTABANI TEMİZLİĞİ BAŞLATILIYOR...")
    log_id = record_task_start("db_maintenance")
    
    db = SessionLocal()
    try:
        # 1. Fetch DB settings
        cfg = get_system_setting(db, "db_config", DEFAULT_SETTINGS["db_config"])
        enabled = cfg.get("auto_prune_enabled", False)
        
        if not enabled:
            logger.info("⏸️ [DB-MAINTENANCE] Otomatik temizleme devre dışı. İşlem atlanıyor.")
            record_task_end(log_id, "success", "Auto-prune disabled in settings")
            return

        # Minimum 20 gün zorunlu — eğitim verisi silinmesin.
        # Kalibrasyon için en az 2-3 haftalık tahmin geçmişi şart.
        retention_days      = max(20, int(cfg.get("retention_days", 730)))
        prune_neutral_days  = max(20, int(cfg.get("prune_neutral_days", 90)))
        
        now = now_utc().replace(tzinfo=None)
        retention_cutoff = now - datetime.timedelta(days=retention_days)
        neutral_cutoff   = now - datetime.timedelta(days=prune_neutral_days)
        
        # --- A: Prune Neutral Records ---
        # No target direction (neutral) and older than neutral_cutoff
        q1 = db.query(ScanScore).filter(
            ScanScore.target_direction == "neutral",
            ScanScore.scanned_at < neutral_cutoff
        )
        c1 = q1.delete()
        logger.info(f"🗑️ [DB-MAINTENANCE] {c1} adet eski nötr kayıt silindi.")
        
        # --- B: Prune Old Evaluated Records ---
        # Already evaluated and older than retention_cutoff
        q2 = db.query(ScanScore).filter(
            ScanScore.evaluated_at.isnot(None),
            ScanScore.scanned_at < retention_cutoff
        )
        c2 = q2.delete()
        logger.info(f"🗑️ [DB-MAINTENANCE] {c2} adet zaman aşımına uğramış değerlendirilmiş kayıt silindi.")
        
        # --- C: Garbage Data Cleanup (stuck fallback records) ---
        # ML ve QRS aynı anda tam 50.0 olan kayıtlar "takılı/fallback" verisidir.
        # Bu kayıtlar kalibrasyon modelini yanıltır ve SPK uyumlu değildir.
        q3 = db.query(ScanScore).filter(
            ScanScore.ml_score == 50.0,
            ScanScore.qrs_score == 50.0,
        )
        c3 = q3.delete()
        if c3:
            logger.info(f"[DB-MAINTENANCE] {c3} adet stuck ML/QRS=50.0 garbage kayit silindi.")

        # --- D: ML skoru NULL olan (hesaplanamayan) kayıtları temizle ---
        q4 = db.query(ScanScore).filter(
            ScanScore.ml_score.is_(None),
            ScanScore.scanned_at < (now - datetime.timedelta(days=30)),
        )
        c4 = q4.delete()
        if c4:
            logger.info(f"[DB-MAINTENANCE] {c4} adet ml_score=NULL eski kayit silindi.")

        # --- E: Süresi geçmiş parola sıfırlama token'larını temizle ---
        c5 = 0
        try:
            expired_users = db.query(User).filter(
                User.reset_token.isnot(None),
                User.reset_token_expires.isnot(None),
                User.reset_token_expires < now,
            ).all()
            for u in expired_users:
                u.reset_token = None
                u.reset_token_expires = None
            c5 = len(expired_users)
            if c5:
                logger.info(f"[DB-MAINTENANCE] {c5} adet süresi geçmiş reset token temizlendi.")
        except Exception as _te:
            logger.warning(f"[DB-MAINTENANCE] Token temizleme hatası: {_te}")

        db.commit()

        total = c1 + c2 + c3 + c4
        logger.info(f"[DB-MAINTENANCE] Temizlik tamamlandi. Silinen: {total} kayit (neutral={c1}, eski={c2}, garbage={c3}, null_ml={c4}), token={c5}.")
        msg = f"Silinen: {total} kayit, token={c5}"
        record_task_end(log_id, "success", msg)
            
    except Exception as e:
        db.rollback()
        logger.error(f"❌ [DB-MAINTENANCE] Hata: {e}")
        record_task_end(log_id, "error", str(e))
    finally:
        db.close()
