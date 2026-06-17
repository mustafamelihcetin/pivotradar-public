
import datetime
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from app.features.scoring.ml.evaluator import evaluate_past_predictions
from sqlalchemy import text

def run_time_machine():
    db = SessionLocal()
    print("⏳ Zaman Makinesi Başlatılıyor...")
    
    # 1. Mevcut "Güvenli Liman" (Profil 1 benzeri) kayıtlarını bul
    # profile_name üzerinden gidiyoruz
    base_records = db.query(ScanScore).filter(ScanScore.profile_name == "Güvenli Liman").limit(500).all()
    
    if not base_records:
        print("❌ Hata: Güvenli Liman profilinde hiç kayıt bulunamadı, klonlama yapılamıyor.")
        return

    other_profiles = [
        "Agresif Atak", "Dönüş Uzmanı", "Trend Avcısı", 
        "Değer Kaşifi", "Anlık Fırsatçı", "Kırılım Dedektörü"
    ]
    
    print(f"📦 {len(base_records)} adet olgun kayıt bulundu. Diğer {len(other_profiles)} profile kopyalanıyor...")
    
    new_rows = []
    for record in base_records:
        for p_name in other_profiles:
            # Kaydı klonla
            clone = ScanScore(
                symbol=record.symbol,
                scan_date=record.scan_date,
                scanned_at=record.scanned_at,
                qrs_score=record.qrs_score,
                ml_score=record.ml_score,
                rule_score=record.rule_score,
                close_price=record.close_price,
                atr_percent=record.atr_percent,
                rsi=record.rsi,
                volume=record.volume,
                volume_ratio=record.volume_ratio,
                trend=record.trend,
                target_price=record.target_price,
                target_direction=record.target_direction,
                predicted_days=record.predicted_days,
                profile_name=p_name,
                scan_session_id=f"time-machine-{p_name}",
                # Evaluatörün tekrar bakması için bu alanları boşaltıyoruz
                evaluated_at=None,
                actual_price_at_eval=None,
                target_hit=None
            )
            new_rows.append(clone)
            
    # Toplu ekle
    db.bulk_save_objects(new_rows)
    db.commit()
    print(f"✅ {len(new_rows)} yeni kayıt oluşturuldu.")
    
    # 2. Evaluatör'ü çalıştır (Bu işlem tüm bu yeni kayıtları analiz edip istatistik üretecek)
    print("🧠 Evaluatör (Zeka Motoru) çalıştırılıyor... Bu işlem biraz sürebilir.")
    evaluate_past_predictions()
    print("🚀 İŞLEM TAMAMLANDI! Admin panelini yenileyin.")

if __name__ == "__main__":
    run_time_machine()
