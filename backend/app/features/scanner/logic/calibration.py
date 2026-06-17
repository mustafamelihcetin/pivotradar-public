# backend/app/features/scanner/logic/calibration.py
import logging
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore, MLPerformanceStat
from app.features.market_data.service import MarketDataService
from app.core.market_calendar import add_trading_days
from app.core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.Calibration")

def run_ml_calibration():
    """
    Geçmiş tahminlerin (ScanScore) gerçek fiyat hareketleriyle kıyaslanıp 
    başarı oranlarının (MLPerformanceStat) hesaplandığı otonom görev.
    """
    db = SessionLocal()
    try:
        logger.info("CALIBRATION: Starting ML performance audit...")
        
        # 1. Vadesi dolmuş ve henüz değerlendirilmemiş kayıtları bul
        today = datetime.date.today()
        
        # SQL ile: scan_date + predicted_days <= today
        pending_scores = (
            db.query(ScanScore)
            .filter(
                ScanScore.evaluated_at.is_(None),
                ScanScore.target_price.isnot(None),
                ScanScore.predicted_days.isnot(None)
            )
            .all()
        )
        
        # Python tarafında tarih filtresi — iş günü bazlı (takvim günü değil)
        eval_list = []
        for s in pending_scores:
            try:
                target_date = add_trading_days(s.scan_date, int(s.predicted_days or 14))
            except Exception:
                target_date = s.scan_date + datetime.timedelta(days=s.predicted_days or 14)
            if target_date <= today:
                eval_list.append(s)
        
        if not eval_list:
            logger.info("CALIBRATION: No scores have reached their maturity date yet.")
            return

        svc = MarketDataService()
        evaluated_count = 0
        hits = 0
        
        # Throttling: Bir kerede çok fazla geçmişe gitmemek için
        for score in eval_list[:100]:
            # Güncel fiyatı çek (L1-L3 hibrit)
            bundle = svc.fetch_price_df(score.symbol, lookback_days=7)
            df = bundle.df if bundle else None
            if df is None or df.empty:
                continue
                
            last_price = float(df["Close"].iloc[-1])
            data_date = df.index[-1].date()
            
            # Eğer veri tarihi scan_date ile aynıysa henüz "gelecek" veri gelmemiştir
            if data_date <= score.scan_date:
                continue
                
            # Performans hesaplama — close_price eksikse bu kaydı atla (1.0 sahte getiri üretir)
            if not score.close_price or float(score.close_price) <= 0:
                logger.debug("CALIBRATION: %s close_price eksik, atlanıyor.", score.symbol)
                continue
            entry_price = float(score.close_price)
            actual_return = (last_price - entry_price) / entry_price * 100
            
            # Hedef kontrolü (basit: son fiyat hedefe ulaştı mı?)
            is_bullish = score.target_direction == "bullish"
            target_hit = False
            if is_bullish:
                target_hit = last_price >= score.target_price
            elif score.target_direction == "bearish":
                target_hit = last_price <= score.target_price
                
            # Yönsel isabet
            directional_hit = False
            if is_bullish and last_price > entry_price:
                directional_hit = True
            elif score.target_direction == "bearish" and last_price < entry_price:
                directional_hit = True
                
            # Kaydı güncelle
            score.evaluated_at = now_utc().replace(tzinfo=None)
            score.actual_price_at_eval = last_price
            score.actual_return_pct = actual_return
            score.target_hit = target_hit
            score.directional_hit = directional_hit
            
            evaluated_count += 1
            if target_hit: hits += 1
            
        db.commit()
        logger.info(f"CALIBRATION: Evaluated {evaluated_count} scores. Target hits: {hits}")

    except Exception as e:
        logger.error(f"CALIBRATION ERROR: {e}", exc_info=True)
        db.rollback()
        db.close()
        return
    finally:
        pass  # db.close() normal akışta aşağıda yapılır

    # commit sonrası bağımsız işlemler — commit hatasından izole
    try:
        if evaluated_count > 0:
            _update_performance_stats(db)
        if evaluated_count >= 20:
            _maybe_trigger_retrain(db)
    except Exception as e:
        logger.error(f"CALIBRATION: Post-commit işlem hatası: {e}", exc_info=True)
    finally:
        db.close()


# Retraining eşiği: son modelden bu yana en az bu kadar yeni değerlendirme gerekli
_RETRAIN_TRIGGER_THRESHOLD = 50

def _maybe_trigger_retrain(db):
    """
    Toplam değerlendirilmiş kayıt sayısı eşiği geçtiyse otomatik retraining başlatır.
    Aynı seansta birden fazla tetiklenmemesi için son retrain meta'sını kontrol eder.
    """
    try:
        from app.features.scanner.models import ScanScore
        from app.features.scoring.ml.training import run_full_retrain, _BASE_MODEL_DIR, _BASE_MODEL_META
        import json, os

        # Son model kaç kayıt üzerine eğitilmişti?
        meta_path = os.path.join(_BASE_MODEL_DIR, _BASE_MODEL_META)
        last_n = 0
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                last_n = json.load(f).get("n_total", 0)

        # Şu an kaç değerlendirilmiş kayıt var?
        current_n = db.query(ScanScore).filter(
            ScanScore.evaluated_at.isnot(None),
            ScanScore.target_hit.isnot(None),
        ).count()

        new_since_last = current_n - last_n
        logger.info(f"CALIBRATION: {current_n} total evaluated, {new_since_last} new since last retrain.")

        if new_since_last >= _RETRAIN_TRIGGER_THRESHOLD:
            logger.info(f"CALIBRATION: Triggering auto-retrain ({new_since_last} new evaluations)...")
            import threading
            t = threading.Thread(target=run_full_retrain, daemon=True)
            t.start()
        else:
            logger.info(f"CALIBRATION: Auto-retrain skipped ({new_since_last} < {_RETRAIN_TRIGGER_THRESHOLD} threshold).")
    except Exception as e:
        logger.warning(f"CALIBRATION: Auto-retrain check failed: {e}")

def _update_performance_stats(db: Session):
    """ScanScore tablosundaki son verilere göre performans tablosunu günceller."""
    # Son 30 günlük verileri baz alalım
    cutoff = datetime.date.today() - datetime.timedelta(days=30)
    
    # Her profil için ayrı hesapla
    profiles = db.query(ScanScore.profile_name).distinct().all()
    
    for (p_name,) in profiles:
        if not p_name: continue
        
        stats = db.query(
            func.count(ScanScore.id).label("total"),
            func.sum(func.case((ScanScore.target_hit == True, 1), else_=0)).label("hits"),
            func.sum(func.case((ScanScore.directional_hit == True, 1), else_=0)).label("directional")
        ).filter(
            ScanScore.profile_name == p_name,
            ScanScore.evaluated_at.isnot(None),
            ScanScore.scan_date >= cutoff
        ).first()
        
        if stats and stats.total > 0:
            win_rate = float((stats.hits or 0) / stats.total)
            dir_rate = float((stats.directional or 0) / stats.total)
            
            perf = MLPerformanceStat(
                profile = p_name,
                win_rate = win_rate,
                target_hit_rate = win_rate,
                directional_win_rate = dir_rate,
                n_evaluated = stats.total,
                n_hits = int(stats.hits or 0),
                n_directional = int(stats.directional or 0)
            )
            db.add(perf)
    
    db.commit()
    logger.info("CALIBRATION: Performance stats updated.")
