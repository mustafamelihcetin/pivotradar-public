# backend/app/features/admin/calibration.py
"""
Calibration Engine — geçmiş QRS/hedef tahminlerini gerçek fiyat sonuçlarıyla karşılaştırır.

Kullanıcı Mentalitesi:
  - "Tuttu"    = fiyat TAHMİN EDİLEN YÖNDE hareket etti (herhangi bir miktarda).
  - "Tutmadı"  = yanlış yöne gitti.
  - Sapma      = |tahmin_getiri_pct − gerçek_getiri_pct|
  - Tam İsabet = fiyat hedef seviyeye fiilen ulaştı (target_hit)

İki ayrı boyut:
  1. directional_hit   → yön doğru mu? (kullanıcı mentalitesi — ana metrik)
  2. target_hit        → tam hedef fiyatına ulaşıldı mı? (isotonic kalibrasyon için)
"""
import math
import datetime
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.features.scanner.models import ScanScore
from app.features.market_data.service import MarketDataService
from app.core.config_profiles import normalize_profile
from app.core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.Calibration")


def _directional_hit(direction: str, actual_return_pct: float) -> bool:
    """Fiyat tahmin edilen yönde hareket etti mi? (herhangi bir miktarda yeterli)"""
    if direction == "bullish":
        return actual_return_pct > 0.0
    elif direction == "bearish":
        return actual_return_pct < 0.0
    return False


def _magnitude_deviation(
    direction: str,
    entry_price: float,
    target_price: float,
    actual_return_pct: float,
) -> tuple[float, float]:
    """
    Döner: (predicted_return_pct, magnitude_deviation_pct)
    predicted_return_pct: hedef fiyattan beklenen getiri %
    magnitude_deviation_pct: |beklenen - gerçekleşen| mutlak fark
    """
    if entry_price <= 0 or not target_price:
        return 0.0, abs(actual_return_pct)
    if direction == "bullish":
        pred_pct = (target_price - entry_price) / entry_price * 100.0
    elif direction == "bearish":
        pred_pct = (entry_price - target_price) / entry_price * 100.0
    else:
        return 0.0, 0.0
    # actual_return_pct işareti korunmalı: bearish tahmin + fiyat yükseldiyse sapma büyür.
    # pred_pct zaten pozitif (yön soyutlanmış), actual_return_pct yönlü.
    # Bearish: beklenen hareket negatif yönde, actual pozitifse sapmayı topla.
    if direction == "bearish":
        signed_actual = -actual_return_pct  # bearish beklentiye göre normalize et
    else:
        signed_actual = actual_return_pct
    deviation = abs(pred_pct - signed_actual)
    return round(pred_pct, 2), round(deviation, 2)


def run_calibration(db: Session, eval_window_days: int = 14, batch_size: int = 200) -> dict:
    """
    Vadesi geçmiş tahminleri değerlendirir.
    Her kayıt için şunları yazar:
      - target_hit, hit_status, hit_accuracy_pct  (tam hedef isabeti)
      - directional_hit                            (yön doğruluğu)
      - predicted_return_pct, magnitude_deviation_pct (büyüklük analizi)
      - actual_return_pct, max_gain_pct, max_loss_pct
    """
    cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=eval_window_days)
    today  = datetime.date.today()

    pending = (
        db.query(ScanScore)
        .filter(
            ScanScore.evaluated_at.is_(None),
            ScanScore.target_direction.in_(["bullish", "bearish"]),
            ScanScore.target_price.isnot(None),
            ScanScore.close_price.isnot(None),
            ScanScore.predicted_days.isnot(None),
            ScanScore.scanned_at <= cutoff,
        )
        .order_by(ScanScore.scanned_at)
        .limit(batch_size)
        .all()
    )

    from app.features.admin.utils import add_business_days
    pending = [
        r for r in pending
        if add_business_days(r.scan_date, r.predicted_days) <= today
    ]

    if not pending:
        return {"evaluated": 0, "message": "Değerlendirilecek bekleyen tahmin yok."}

    svc = MarketDataService()
    price_cache: dict = {}
    evaluated = 0
    hits = 0
    dir_hits = 0
    errors = 0

    for row in pending:
        try:
            sym = row.symbol
            if sym not in price_cache:
                bundle = svc.fetch_price_df(sym)
                price_cache[sym] = bundle.df if bundle else None

            df = price_cache[sym]
            if df is None or df.empty:
                errors += 1
                continue

            scan_dt  = row.scan_date
            pred_days = row.predicted_days or eval_window_days
            end_date  = add_business_days(scan_dt, int(pred_days * 1.5))
            end_dt    = datetime.datetime.combine(end_date, datetime.time.max)

            mask   = (df.index >= scan_dt) & (df.index <= end_dt)
            window = df[mask]

            if window.empty:
                errors += 1
                continue

            close0  = float(row.close_price)
            target  = float(row.target_price)
            direct  = row.target_direction

            high_col = window["High"] if "High" in window.columns else window["Close"]
            low_col  = window["Low"]  if "Low"  in window.columns else window["Close"]

            max_high  = float(high_col.max())
            min_low   = float(low_col.min())
            end_close = float(window["Close"].iloc[-1])

            actual_return = (end_close - close0) / close0 * 100 if close0 else 0.0
            max_gain      = (max_high - close0) / close0 * 100 if close0 else 0.0
            max_loss_bull = (min_low  - close0) / close0 * 100 if close0 else 0.0

            # ── Tam hedef isabeti (target_hit) ───────────────────────────────
            exp_move = abs(target - close0) if target else 0.0
            hit      = False
            accuracy = 0.0

            if direct == "bullish":
                hit = bool(max_high >= target) if target else False
                if exp_move > 0:
                    accuracy = max(0.0, (max_high - close0)) / exp_move * 100
            elif direct == "bearish":
                hit = bool(min_low <= target) if target else False
                if exp_move > 0:
                    accuracy = max(0.0, (close0 - min_low)) / exp_move * 100

            if hit or accuracy >= 100:
                status   = "target_hit"
                accuracy = max(100.0, accuracy)
            elif accuracy >= 80:
                status = "near_miss"
            elif accuracy >= 50:
                status = "partial"
            else:
                status = "miss"

            # ── Yönsel doğruluk (directional_hit) ────────────────────────────
            dir_hit = _directional_hit(direct, actual_return)
            pred_pct, deviation = _magnitude_deviation(direct, close0, target, actual_return)

            # ── Kaydet ───────────────────────────────────────────────────────
            row.evaluated_at            = now_utc().replace(tzinfo=None)
            row.actual_price_at_eval    = round(end_close, 4)
            row.actual_return_pct       = round(actual_return, 2)
            row.target_hit              = hit
            row.hit_accuracy_pct        = round(accuracy, 1)
            row.hit_status              = status
            row.max_gain_pct            = round(max_gain, 2)
            row.max_loss_pct            = round(max_loss_bull, 2)
            row.directional_hit         = dir_hit
            row.predicted_return_pct    = pred_pct
            row.magnitude_deviation_pct = deviation

            evaluated += 1
            if hit:      hits     += 1
            if dir_hit:  dir_hits += 1

        except Exception as e:
            logger.warning(f"Calibration error for {row.symbol}: {e}")
            errors += 1

    db.commit()

    hit_rate     = round(hits     / evaluated * 100, 1) if evaluated else 0.0
    dir_hit_rate = round(dir_hits / evaluated * 100, 1) if evaluated else 0.0

    return {
        "evaluated":           evaluated,
        "hits":                hits,
        "directional_hits":    dir_hits,
        "hit_rate":            hit_rate,
        "directional_hit_rate": dir_hit_rate,
        "errors":              errors,
        "message": (
            f"{evaluated} tahmin değerlendirildi — "
            f"Hedef isabeti: %{hit_rate} | Yönsel doğruluk: %{dir_hit_rate}"
        ),
    }


def get_accuracy_report(db: Session) -> dict:
    """
    Kapsamlı doğruluk raporu:
      - Genel metrikler: target_hit_rate, directional_hit_rate, blended_accuracy
      - QRS bandına göre breakdown
      - Yöne göre breakdown
      - Profil bazlı özet (directional_hit_rate + magnitude_deviation dahil)
    """
    evaluated = (
        db.query(ScanScore)
        .filter(ScanScore.evaluated_at.isnot(None))
        .all()
    )

    if not evaluated:
        return {"total": 0, "bands": [], "directions": {}, "profiles": []}

    directional = [r for r in evaluated if r.target_direction in ("bullish", "bearish")]
    total_eval  = len(directional)
    if total_eval == 0:
        return {"total": 0, "bands": [], "directions": {}, "profiles": []}

    # ── Genel metrikler ───────────────────────────────────────────────────────
    weights = {"target_hit": 1.0, "near_miss": 0.8, "partial": 0.4, "miss": 0.0}

    total_hits     = sum(1 for r in directional if r.hit_status == "target_hit")
    total_dir_hits = sum(1 for r in directional if r.directional_hit is True)
    dir_eval_count = sum(1 for r in directional if r.directional_hit is not None)

    weighted_sum   = sum(weights.get(r.hit_status, 0.0) for r in directional)
    blended_rate   = round(weighted_sum / total_eval * 100, 1)

    # Pozisyon getirisi: bearish sinyallerde fiyat düşüşü kazanç demektir, işareti çevir
    _ret_vals      = [
        (r.actual_return_pct if r.target_direction == "bullish" else -r.actual_return_pct)
        for r in directional if r.actual_return_pct is not None
    ]
    avg_return     = sum(_ret_vals) / len(_ret_vals) if _ret_vals else 0.0
    avg_dev_list   = [r.magnitude_deviation_pct for r in directional if r.magnitude_deviation_pct is not None]
    avg_deviation  = round(sum(avg_dev_list) / len(avg_dev_list), 2) if avg_dev_list else None

    dir_hit_rate   = round(total_dir_hits / dir_eval_count * 100, 1) if dir_eval_count else None

    # ── Status dağılımı ───────────────────────────────────────────────────────
    status_counts = {
        "target_hit": sum(1 for r in directional if r.hit_status == "target_hit"),
        "near_miss":  sum(1 for r in directional if r.hit_status == "near_miss"),
        "partial":    sum(1 for r in directional if r.hit_status == "partial"),
        "miss":       sum(1 for r in directional if r.hit_status == "miss"),
    }

    # ── QRS band breakdown ────────────────────────────────────────────────────
    bands_cfg = [(90,100,"90-100"),(80,90,"80-90"),(70,80,"70-80"),
                 (60,70,"60-70"),(40,60,"40-60"),(0,40,"0-40")]
    bands = []
    for lo, hi, label in bands_cfg:
        subset = [r for r in directional if r.qrs_score is not None and lo <= r.qrs_score < hi]
        if not subset: continue
        h      = sum(1 for r in subset if r.hit_status == "target_hit")
        dh     = sum(1 for r in subset if r.directional_hit is True)
        dh_n   = sum(1 for r in subset if r.directional_hit is not None)
        w_sum  = sum(weights.get(r.hit_status, 0.0) for r in subset)
        _r_vals = [
            (r.actual_return_pct if r.target_direction == "bullish" else -r.actual_return_pct)
            for r in subset if r.actual_return_pct is not None
        ]
        avg_r  = sum(_r_vals) / len(_r_vals) if _r_vals else 0.0
        devs   = [r.magnitude_deviation_pct for r in subset if r.magnitude_deviation_pct is not None]
        bands.append({
            "band":              label,
            "count":             len(subset),
            "hits":              h,
            "directional_hits":  dh,
            "hit_rate":          round(h  / len(subset) * 100, 1),
            "directional_rate":  round(dh / dh_n * 100, 1) if dh_n else None,
            "blended":           round(w_sum / len(subset) * 100, 1),
            "avg_return":        round(avg_r, 2),
            "avg_deviation":     round(sum(devs) / len(devs), 2) if devs else None,
        })

    # ── Yön bazlı ─────────────────────────────────────────────────────────────
    directions: dict = {}
    for d in ("bullish", "bearish"):
        sub = [r for r in directional if r.target_direction == d]
        if not sub: continue
        h    = sum(1 for r in sub if r.hit_status == "target_hit")
        dh   = sum(1 for r in sub if r.directional_hit is True)
        dhn  = sum(1 for r in sub if r.directional_hit is not None)
        w    = sum(weights.get(r.hit_status, 0.0) for r in sub)
        directions[d] = {
            "count":            len(sub),
            "hits":             h,
            "directional_hits": dh,
            "hit_rate":         round(h  / len(sub) * 100, 1),
            "directional_rate": round(dh / dhn * 100, 1) if dhn else None,
            "blended":          round(w  / len(sub) * 100, 1),
        }

    # ── Profil bazlı özet ─────────────────────────────────────────────────────
    profile_map: dict = {}
    for r in directional:
        # Profil adını normalize et — hem eski hem yeni isimleri doğru grupla
        raw_name = r.profile_name or "Bilinmeyen"
        p_key    = normalize_profile(raw_name)
        # Gruplamayı canonical key üzerinden yap, UI adını da sakla
        if p_key not in profile_map:
            profile_map[p_key] = {
                "display_name": raw_name,  # İlk görülen ismi göster
                "count": 0, "hits": 0, "dir_hits": 0, "dir_n": 0,
                "w_sum": 0.0, "returns": [], "deviations": [],
            }
        pm = profile_map[p_key]
        pm["count"] += 1
        pm["w_sum"] += weights.get(r.hit_status, 0.0)
        if r.hit_status == "target_hit":
            pm["hits"] += 1
        if r.directional_hit is not None:
            pm["dir_n"] += 1
            if r.directional_hit:
                pm["dir_hits"] += 1
        if r.actual_return_pct is not None:
            normalized = r.actual_return_pct if r.target_direction == "bullish" else -r.actual_return_pct
            pm["returns"].append(normalized)
        if r.magnitude_deviation_pct is not None:
            pm["deviations"].append(r.magnitude_deviation_pct)

    profiles = []
    for key, v in sorted(profile_map.items(), key=lambda x: -x[1]["count"]):
        avg_ret = round(sum(v["returns"]) / len(v["returns"]), 2) if v["returns"] else None
        avg_dev = round(sum(v["deviations"]) / len(v["deviations"]), 2) if v["deviations"] else None
        profiles.append({
            "profile":             key,
            "display_name":        v["display_name"],
            "count":               v["count"],
            "hits":                v["hits"],
            "directional_hits":    v["dir_hits"],
            "hit_rate":            round(v["hits"]     / v["count"]  * 100, 1),
            "directional_rate":    round(v["dir_hits"] / v["dir_n"]  * 100, 1) if v["dir_n"] else None,
            "blended":             round(v["w_sum"]    / v["count"]  * 100, 1),
            "avg_return":          avg_ret,
            "avg_magnitude_deviation": avg_dev,
        })

    # Veri kalitesi: null olmayan actual_return_pct / directional_hit oranına göre
    n_with_return    = len(_ret_vals)
    n_with_dir_hit   = dir_eval_count
    data_completeness = round(
        (n_with_return + n_with_dir_hit) / (total_eval * 2) * 100, 1
    ) if total_eval > 0 else 0.0
    if data_completeness >= 85:
        data_quality = "YÜKSEK"
    elif data_completeness >= 60:
        data_quality = "ORTA"
    else:
        data_quality = "DÜŞÜK"

    return {
        "total":                 total_eval,
        "total_hits":            total_hits,
        "overall_hit_rate":      round(total_hits / total_eval * 100, 1),
        "directional_hit_rate":  dir_hit_rate,
        "blended_accuracy":      blended_rate,
        "blended_rate":          blended_rate,
        "avg_return":            round(avg_return, 2),
        "avg_magnitude_deviation": avg_deviation,
        "near_misses":           status_counts.get("near_miss", 0),
        "status_distribution":   status_counts,
        "data_quality":          data_quality,
        "data_completeness_pct": data_completeness,
        "bands":                 bands,
        "directions":            directions,
        "profiles":              profiles,
        "note": (
            "target_hit = hedef fiyata ulaştı | "
            "directional_hit = doğru yöne hareket etti | "
            "blended = ağırlıklı doğruluk (target=1.0, near_miss=0.8, partial=0.4, miss=0.0)"
        ),
    }
