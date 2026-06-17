# backend/app/features/scanner/user_scorer.py
"""
Per-user personalized scoring from cached raw indicator data.

Architecture:
  - Auto-scan stores raw, profile-independent indicators in SymbolDataCache.
  - This module reads that cache and applies the user's chosen profile weights
    to produce a personalized QRS score — all in memory, in milliseconds.
  - Users never have to wait for a data download or compete for the scan queue.
"""
from __future__ import annotations
import datetime
import logging
import math
import uuid
import statistics
from typing import Optional
from app.features.scanner.sector_mapping import get_sector
from app.features.market_data.data.universe_bist import get_sector as get_sector_display, get_company_name

logger = logging.getLogger("PivotRadar.UserScorer")

from sqlalchemy.orm import Session

from app.features.scanner.models import SymbolDataCache
from app.features.scoring.yzdsh_rules import rules_score
from app.core.config_profiles import normalize_profile




# ── QRS kalite filtresi sabitleri ────────────────────────────────────────────
# SPK uyumlu karar destek: "Al/Sat/Tut" yerine matematiksel durum tespiti
_RSI_EXTREME_THRESHOLD   = 90.0   # Aşırı Isınma / Mean Reversion riski
_RSI_OVERBOUGHT_WARN     = 80.0   # RSI yüksek uyarı
_RSI_OVERSOLD_EXTREME    = 15.0   # Aşırı satım (bearish sinyalde ceza yok, tam tersi)
_BULL_TRAP_VOL_THRESHOLD = 0.85   # Hacim onaysız yükseliş tespiti
_MIN_RR_RATIO            = 2.0    # Minimum Risk/Ödül oranı



# Legacy _compute_qrs_quality_flags deleted. 
# UnifiedPRISM now handles all quality and penalty logic centrally.

# ── Cache helpers ─────────────────────────────────────────────────────────────

def get_latest_batch_id(db: Session) -> Optional[str]:
    """Returns the batch_id of the most recent completed scan that actually has data."""
    row = (
        db.query(SymbolDataCache.batch_id)
        .order_by(SymbolDataCache.scanned_at.desc())
        .limit(1)
        .first()
    )
    return row.batch_id if row else None


def get_cache_meta(db: Session) -> dict:
    """Returns metadata about the latest cache batch (age, symbol count, etc.)."""
    from app.features.scanner.models import ScanScore  # avoid circular at module level

    row = (
        db.query(
            SymbolDataCache.batch_id, SymbolDataCache.scanned_at,
            SymbolDataCache.data_date, SymbolDataCache.data_time
        )
        .order_by(SymbolDataCache.scanned_at.desc())
        .first()
    )
    if not row:
        return {"available": False, "scanned_at": None, "data_date": None, "data_time": None, "age_minutes": None, "symbol_count": 0}
    
    scanned_at = row.scanned_at
    data_date  = row.data_date
    data_time  = row.data_time

    # data_date null gelebilir (fallback ile oluşturulmuş cache'lerde).
    # Fallback: ScanScore tablosundan en son scan_date'i al.
    if data_date is None:
        ss_row = (
            db.query(ScanScore.scan_date)
            .filter(ScanScore.scan_date.isnot(None))
            .order_by(ScanScore.scan_date.desc())
            .first()
        )
        if ss_row:
            data_date = ss_row.scan_date

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    # Ensure scanned_at is TZ-aware if the DB returned it as naive (assuming UTC)
    if scanned_at.tzinfo is None:
        scanned_at = scanned_at.replace(tzinfo=datetime.timezone.utc)

    age_sec = (now_utc - scanned_at).total_seconds()
    count   = db.query(SymbolDataCache).filter(SymbolDataCache.batch_id == row.batch_id).count()

    # BIST kapanış ~18:00 yerel → UTC+3, yani UTC 15:00
    if data_date:
        data_dt      = datetime.datetime.combine(data_date, datetime.time(15, 0)).replace(tzinfo=datetime.timezone.utc)  # 18:00 TRT = 15:00 UTC
        data_age_sec = (now_utc - data_dt).total_seconds()
        # Negatif olamaz (henüz kapanmamış gün için)
        data_age_sec = max(0, data_age_sec)
    else:
        data_age_sec = age_sec

    # Kaynak dağılımı — her sembolün data_source'unu say
    source_breakdown: dict = {}
    live_overlay_count = 0
    try:
        from app.features.scanner.models import SymbolDataCache as SDC
        sources = (
            db.query(SDC.source_tag)
            .filter(SDC.batch_id == row.batch_id, SDC.source_tag.isnot(None))
            .all()
        )
        for (src,) in sources:
            key = str(src).split("|")[0] if src else "unknown"
            source_breakdown[key] = source_breakdown.get(key, 0) + 1
            if "yfinance" == key:
                live_overlay_count += 1
    except Exception:
        pass

    stale_hits = source_breakdown.get("yfinance_stale", 0) + source_breakdown.get("stale_fallback", 0)
    stale_hit_rate = round(stale_hits / max(count, 1), 3)

    data_age_hours = max(0, round(data_age_sec / 3600, 1))

    # ── Hafta sonu / tatil kontrolü ───────────────────────────────────────────
    # BIST Cuma kapanışından Pazartesi açılışına kadar veri üretmez — bu normaldir.
    def _bist_market_closed_since(ref_date: datetime.date) -> bool:
        """ref_date'den bu yana tamamlanmış bir BIST seansı var mıydı?

        Tamamlanmış seans: hafta içi gün VE 15:00 UTC (= 18:00 TRT) geçmiş.
        Geçmişe ait hafta içi günler zaten kapanmış sayılır.
        """
        bist_close_utc = datetime.time(15, 0)
        check = ref_date + datetime.timedelta(days=1)
        today = now_utc.date()
        while check <= today:
            if check.weekday() < 5:  # 0=Pzt … 4=Cum; 5=Cmt, 6=Paz
                if check < today:
                    return False  # geçmiş hafta içi — seans kesinlikle kapandı
                elif now_utc.time() >= bist_close_utc:
                    return False  # bugün hafta içi ve seans kapandı
            check += datetime.timedelta(days=1)
        return True

    ref = data_date if data_date else scanned_at.date()
    market_closed = _bist_market_closed_since(ref)

    # ── data_freshness ────────────────────────────────────────────────────────
    if market_closed:
        # Hafta sonu veya tatil — eski veri beklenen durum, uyarı gösterme
        data_freshness = {"status": "fresh", "message": "Veri güncel (piyasa kapalı)."}
    elif data_age_hours <= 30:
        data_freshness = {"status": "fresh", "message": "Veri güncel."}
    elif data_age_hours <= 48:
        data_freshness = {"status": "stale_warning", "message": f"Son fiyat verisi {round(data_age_hours)} saat önce. Tarama önerilir."}
    else:
        data_freshness = {"status": "stale_critical", "message": f"Veri {round(data_age_hours / 24, 1)} günden eski. Lütfen tarama başlatın."}

    # ── ml_warning ────────────────────────────────────────────────────────────
    ml_warning = None
    try:
        ml_null_count = (
            db.query(SymbolDataCache)
            .filter(
                SymbolDataCache.batch_id == row.batch_id,
                SymbolDataCache.ml_score.is_(None)
            )
            .count()
        )
        if count > 0 and ml_null_count == count:
            ml_warning = "ML modeli bu taramada devre dışıydı. Skorlar yalnızca kural motoruyla üretildi."
    except Exception:
        pass

    return {
        "available":        True,
        "batch_id":         row.batch_id,
        "scanned_at":       scanned_at.isoformat().replace("+00:00", "") + ("Z" if "+" not in scanned_at.isoformat().replace("+00:00", "") else ""),
        "data_date":        data_date.isoformat() if data_date else None,
        "data_time":        (data_time.isoformat().replace("+00:00", "") + ("Z" if "+" not in data_time.isoformat().replace("+00:00", "") else "")) if data_time else (data_date.isoformat() if data_date else None),
        "age_minutes":      max(0, round(age_sec / 60, 1)),
        "data_age_hours":   data_age_hours,
        "symbol_count":     count,
        "data_freshness":   data_freshness,
        "ml_warning":       ml_warning,
        # ── Veri gözlemlenebilirliği ──────────────────────────────────────────
        "source_breakdown":    source_breakdown,
        "stale_hit_rate":      stale_hit_rate,
        "live_overlay_count":  live_overlay_count,
    }


def persist_cache(df_results: list[dict], batch_id: str, db: Session) -> int:
    """
    Upserts raw indicator data into SymbolDataCache for the given batch.
    Deletes previous batch rows first to keep the table lean (only latest data needed).
    Returns the number of rows inserted.
    """
    # --- SLIDING WINDOW PERSISTENCE (V23) ---
    import math



    def _f(v, default=0.0):
        try:
            val = float(v)
            return val if math.isfinite(val) else default
        except (TypeError, ValueError):
            return default

    today = datetime.date.today()
    rows = []
    for rec in df_results:
        close = _f(rec.get("close"))
        atr   = _f(rec.get("atr_percent"), 2.0)

        # Teknik Direnç Projeksiyonu — ATR bazlı 2:1 R/R (ham cache; profil bilinmiyor)
        # Kullanıcıya özel hedef score_for_user() içinde yeniden hesaplanır.
        qrs = _f(rec.get("yzdsh"))
        atr_abs = close * (atr / 100.0)  # Mutlak ATR değeri
        if qrs >= 65:
            direction    = "bullish"
            target_price = str(round(close + atr_abs * 2.0, 4)) if close else None
        elif qrs <= 35:
            direction    = "bearish"
            target_price = str(round(close - atr_abs * 2.0, 4)) if close else None
        else:
            direction    = "neutral"
            target_price = None

        # ATR Bazlı Olasılık Vadesi — ham hesap (profil bilinmiyor, 2.0× ATR kullan)
        predicted_days = max(5, min(45, int(10.0 / max(atr, 0.5)))) if atr else 14

        ts = rec.get("timestamp") or str(today)
        data_dt_full = None
        try:
            # First try parsing full timestamp (from engine.py)
            data_dt_full = datetime.datetime.fromisoformat(ts.replace("Z", ""))
            if data_dt_full.tzinfo is None:
                data_dt_full = data_dt_full.replace(tzinfo=datetime.timezone.utc)
            data_date = data_dt_full.date()
        except Exception:
            try:
                data_date = datetime.date.fromisoformat(ts[:10])
            except Exception:
                data_date = today

        pat_score = rec.get("pattern_score")
        if pat_score is not None:
            try:
                pat_score = int(pat_score)
            except Exception:
                pat_score = None

        rows.append(SymbolDataCache(
            symbol        = str(rec.get("symbol", "")).upper(),
            batch_id      = batch_id,
            scanned_at    = datetime.datetime.now(datetime.timezone.utc),
            data_date     = data_date,
            data_time     = data_dt_full,
            close_price   = close if close > 0 else None,
            change_pct    = _f(rec.get("change_pct")),
            rsi           = _f(rec.get("rsi"), 50.0),
            ema20         = _f(rec.get("ema20")),
            ema50         = _f(rec.get("ema50")),
            atr_percent   = atr,
            volume        = _f(rec.get("volume")),
            volume_ratio  = _f(rec.get("volume_ratio"), 1.0),
            trend         = bool(rec.get("trend", False)),
            breakout      = _f(rec.get("breakout"), 0.0),
            momentum      = _f(rec.get("momentum"), 0.0),
            pattern_name  = rec.get("pattern_name") or None,
            pattern_score = pat_score,
            pattern_json  = rec.get("pattern_json") or None,
            ema20_gap     = _f(rec.get("ema20_gap")),
            ema50_gap     = _f(rec.get("ema50_gap")),
            range_pct     = _f(rec.get("range_pct")),
            body_pct      = _f(rec.get("body_pct")),
            ml_score      = _f(rec.get("ml_score")) if rec.get("ml_score") is not None else None,
            strategy_snapshot = rec.get("strategy_snapshot"),
            target_price  = target_price,
            target_direction = direction,
            predicted_days   = predicted_days,
            source_tag    = str(rec.get("ohlc_meta", {}).get("src", "") or "scanner"),
            # Extended technical + macro indicators
            w52_position          = _f(rec.get("w52_position"), 0.5) if rec.get("w52_position") is not None else None,
            dist_from_52w_high    = _f(rec.get("dist_from_52w_high"), 0.0) if rec.get("dist_from_52w_high") is not None else None,
            dist_from_52w_low     = _f(rec.get("dist_from_52w_low"), 0.0) if rec.get("dist_from_52w_low") is not None else None,
            volume_zscore         = _f(rec.get("volume_zscore"), 0.0) if rec.get("volume_zscore") is not None else None,
            ret_3d                = _f(rec.get("ret_3d"), 0.0) if rec.get("ret_3d") is not None else None,
            ret_acceleration      = _f(rec.get("ret_acceleration"), 0.0) if rec.get("ret_acceleration") is not None else None,
            consecutive_down_days = int(rec.get("consecutive_down_days") or 0) if rec.get("consecutive_down_days") is not None else None,
            close_position        = _f(rec.get("close_position"), 0.5) if rec.get("close_position") is not None else None,
            ema_alignment_score   = int(rec.get("ema_alignment_score") or 0) if rec.get("ema_alignment_score") is not None else None,
            trend_duration_days   = int(rec.get("trend_duration_days") or 0) if rec.get("trend_duration_days") is not None else None,
            bist100_trend_5d      = _f(rec.get("bist100_trend_5d"), 0.0) if rec.get("bist100_trend_5d") is not None else None,
            vix_regime            = int(rec.get("vix_regime") or 0) if rec.get("vix_regime") is not None else None,
            usdtry_change_5d      = _f(rec.get("usdtry_change_5d"), 0.0) if rec.get("usdtry_change_5d") is not None else None,
            sector_rel_strength_5d = _f(rec.get("sector_rel_strength_5d"), 0.0) if rec.get("sector_rel_strength_5d") is not None else None,
        ))

    if not rows:
        return 0

    try:
        # --- SLIDING WINDOW PERSISTENCE (V23) ---
        # 1. Clean up stale history (older than 25 days to be safe, covers 15+ business days)
        cutoff = datetime.date.today() - datetime.timedelta(days=25)
        db.query(SymbolDataCache).filter(SymbolDataCache.data_date < cutoff).delete(synchronize_session=False)

        # 1b. Clean orphan rows with NULL batch_id (from interrupted or failed scans)
        db.query(SymbolDataCache).filter(SymbolDataCache.batch_id == None).delete(synchronize_session=False)

        # 2. Avoid duplicates for the same symbol and data_date in the current insert set
        symbols = list({r.symbol for r in rows})
        dates   = list({r.data_date for r in rows if r.data_date})
        db.query(SymbolDataCache).filter(
            SymbolDataCache.symbol.in_(symbols),
            SymbolDataCache.data_date.in_(dates)
        ).delete(synchronize_session=False)
        
        # 3. Bulk insert the new batch
        db.bulk_save_objects(rows)
        db.commit()
        return len(rows)
    except Exception:
        db.rollback()
        raise


# ── Core scoring ──────────────────────────────────────────────────────────────

def score_for_user(
    db: Session,
    profile_name: str,
    expert_overrides: Optional[dict] = None,
    top_n: int = 500,
    batch_id: Optional[str] = None,
) -> tuple[list[dict], dict]:
    """
    Reads the latest SymbolDataCache batch and applies `profile_name` weights
    to produce a personalized, sorted QRS ranking.

    Returns:
        (results_list, cache_meta_dict)
    """
    import logging
    logger = logging.getLogger("PivotRadar.UserScorer")
    
    # Clean profile name (handling leading/trailing spaces from UI state)
    profile_name = str(profile_name).strip()
    
    # Get latest batch if not specified
    if not batch_id:
        batch_id = get_latest_batch_id(db)

    meta = get_cache_meta(db)

    if not batch_id:
        logger.warning(f"No cache batch found for profile request: {profile_name}")
        return [], meta

    logger.info(f"Scoring {meta.get('symbol_count', 0)} symbols for profile: {profile_name} using batch: {batch_id}")

    # [V30] Resilient Query Logic
    # We first try the target batch. If it fails or is empty, we fall back to ANY recent data.
    def _fetch_rows(target_id):
        return (
            db.query(SymbolDataCache)
            .filter(SymbolDataCache.batch_id == target_id)
            .order_by(SymbolDataCache.symbol.asc(), SymbolDataCache.data_date.desc(),
                      SymbolDataCache.scanned_at.desc())
            .all()
        )

    all_rows = _fetch_rows(batch_id)
    
    # Resurrection Fallback: If current batch is empty, try to get the latest 1000 records regardless of batch
    if not all_rows:
        logger.warning(f"Batch {batch_id} is empty! Attempting fallback to previous data.")
        all_rows = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).limit(2000).all()

    # In-memory distinct (Universally compatible)
    rows_map = {}
    for r in all_rows:
        if r.symbol not in rows_map:
            rows_map[r.symbol] = r
    
    rows = list(rows_map.values())

    if not rows:
        return [], meta

    # Filter out outliers and ensure only equities are shown
    from app.features.market_data.data.universe_bist import _is_equity_code
    
    # Apply price limit (same as engine: 50,000 TL)
    PRICE_MAX = 50000.0
    
    results    = []

    for row in rows:
        # Outlier filtering (Blacklist + Structural)
        if not _is_equity_code(row.symbol):
            continue
            
        # Price Data Awareness — fallback to most recent non-null close for this symbol
        close_price = row.close_price or 0.0
        if close_price <= 0:
            fb = (
                db.query(SymbolDataCache.close_price)
                .filter(SymbolDataCache.symbol == row.symbol, SymbolDataCache.close_price > 0)
                .order_by(SymbolDataCache.scanned_at.desc())
                .first()
            )
            if fb:
                close_price = float(fb[0])

        # Still filter extreme price outliers (structural error protection)
        if close_price > PRICE_MAX:
            continue

        rsi        = row.rsi  # Allow None
        trend      = bool(row.trend)
        atr_pct    = row.atr_percent or 2.0
        vol_ratio  = row.volume_ratio or 1.0
        breakout   = row.breakout   or 0.0
        pat_score  = row.pattern_score or 0
        ml_score   = row.ml_score   # may be None if ML was disabled
        # Kalibre edilmiş ML skoru: gerçek win-rate'i yansıtır (ham skoru değiştirmez)
        try:
            from app.features.scoring.ml.ml_calib import apply_calibration as _apply_calib
            ml_score_cal = round(float(_apply_calib([ml_score], profile_name=profile_name)[0]), 1) if ml_score is not None else None
        except Exception:
            ml_score_cal = None

        # Birincil formasyon adı: DB kolonu boşsa pattern_json'dan türet
        _row_pattern_name = row.pattern_name or ""
        if not _row_pattern_name:
            try:
                import json as _json_pn
                if getattr(row, "pattern_json", None):
                    _pj = _json_pn.loads(row.pattern_json)
                    _pj_type = _pj.get("detected_type", "")
                    if _pj_type and _pj_type not in ("Formasyon Yok", "NONE", ""):
                        _pj_conf = float(_pj.get("confidence", 0))
                        if _pj_conf >= 0.30:
                            _row_pattern_name = _pj_type
            except Exception:
                pass

        # İkincil formasyon adı — önce DB kolonu, yoksa raw_features JSON fallback
        _secondary_pattern_name = getattr(row, "secondary_pattern_name", None) or None
        if not _secondary_pattern_name:
            try:
                import json as _json
                if getattr(row, "raw_features", None):
                    _rf = _json.loads(row.raw_features)
                    _spn = _rf.get("secondary_pattern_name", "")
                    _secondary_pattern_name = _spn if _spn and _spn != "NONE" else None
            except Exception:
                pass
        if _secondary_pattern_name == "NONE":
            _secondary_pattern_name = None
        _pattern_is_stale = bool(getattr(row, "pattern_is_stale", False))

        # Sector identification
        sector = get_sector(row.symbol)

        # Expert parameter overrides
        if expert_overrides:
            try:
                if "volBlast" in expert_overrides:
                    vol_ratio = float(expert_overrides["volBlast"])
                if "trendFilter" in expert_overrides and not bool(expert_overrides["trendFilter"]):
                    trend = False   # force ignore trend
                if "rsiMin" in expert_overrides:
                    # Filter: skip symbols below RSI threshold
                    if rsi is None or rsi < float(expert_overrides["rsiMin"]):
                        continue
                if "rsiMax" in expert_overrides:
                    if rsi is None or rsi > float(expert_overrides["rsiMax"]):
                        continue
            except (TypeError, ValueError):
                pass

        # ── [REFACTORED V5] Unified PRISM Decision Engine ──────────────────────────
        indicators_bundle = {
            "rsi_val": rsi,
            "trend": trend,
            "atr_pct": atr_pct,
            "vol_ratio": vol_ratio,
            "momentum": row.momentum or 0.0,
            "breakout": breakout,
            "pattern_name": _row_pattern_name,
            "pattern_score": float(pat_score or 0),
            "close": close_price,
            # Extended indicators (may be None on older cache rows — use safe defaults)
            "w52_position":          float(getattr(row, "w52_position", None) or 0.5),
            "dist_from_52w_high":    float(getattr(row, "dist_from_52w_high", None) or 0.0),
            "dist_from_52w_low":     float(getattr(row, "dist_from_52w_low", None) or 0.0),
            "volume_zscore":         float(getattr(row, "volume_zscore", None) or 0.0),
            "ret_3d":                float(getattr(row, "ret_3d", None) or 0.0),
            "ret_acceleration":      float(getattr(row, "ret_acceleration", None) or 0.0),
            "consecutive_down_days": int(getattr(row, "consecutive_down_days", None) or 0),
            "close_position":        float(getattr(row, "close_position", None) or 0.5),
            "ema_alignment_score":   int(getattr(row, "ema_alignment_score", None) or 0),
            "trend_duration_days":   int(getattr(row, "trend_duration_days", None) or 0),
            "bist100_trend_5d":      float(getattr(row, "bist100_trend_5d", None) or 0.0),
            "vix_regime":            int(getattr(row, "vix_regime", None) or 0),
            "usdtry_change_5d":      float(getattr(row, "usdtry_change_5d", None) or 0.0),
            "sector_rel_strength_5d": float(getattr(row, "sector_rel_strength_5d", None) or 0.0),
        }

        # Central Verdict from Unified Engine
        from app.features.scoring.prism_service import UnifiedPRISM
        verdict = UnifiedPRISM.evaluate(
            indicators=indicators_bundle,
            ml_score=ml_score,
            profile_name=profile_name,
            symbol=row.symbol
        )

        qrs         = verdict.get("qrs", 0.0)
        direction   = verdict.get("direction", "neutral")
        target_p    = verdict.get("target_price")
        pred_days   = verdict.get("predicted_days", 10)
        quality_lbl = verdict.get("quality_label", "Nötr")
        is_divergent = verdict.get("is_divergent", False)
        risk_flags  = verdict.get("reason_codes", [])

        # Trailing Stop Calculation
        close = close_price
        atr_abs = close * (atr_pct / 100.0)
        trailing_stop = None
        if direction == "bullish":
            trailing_stop = round(close - atr_abs * 1.2, 4) if close else None
        elif direction == "bearish":
            trailing_stop = round(close + atr_abs * 1.2, 4) if close else None

        results.append({
            "symbol":                     row.symbol,
            "close":                      close,
            "change_pct":                 row.change_pct if row.change_pct is not None else 0.0,
            "rsi":                        rsi,
            "atr_percent":                atr_pct,
            "volume":                     row.volume or 0.0,
            "volume_ratio":               vol_ratio,
            "trend":                      trend,
            "breakout":                   breakout,
            "momentum":                   row.momentum or 0.0,
            "pattern_name":               _row_pattern_name or "",
            "pattern_desc":               getattr(row, 'pattern_desc', ""),
            "pattern_score":              pat_score,
            "pattern_is_stale":           _pattern_is_stale,
            "ml_score":                   ml_score,
            "ml_score_cal":               ml_score_cal,
            "secondary_pattern_name":     _secondary_pattern_name,
            "rule_score":                 round(verdict.get("score_breakdown", {}).get("technical", qrs), 2),
            "yzdsh":                      qrs,
            "profile_name":               profile_name,
            "is_ai_verified":             (ml_score and ml_score >= 82 and qrs >= 85),
            # SPK Uyumlu alanlar
            "target_price":               target_p,
            "target_direction":           direction,
            "predicted_days":             pred_days,
            "teknik_direnc_projeksiyonu": target_p,
            "trailing_stop":              trailing_stop,
            "risk_flags":                 risk_flags,
            "quality_label":              quality_lbl,
            "is_divergent":               is_divergent,
            "timestamp":                  row.data_time.isoformat().replace("+00:00", "") + ("Z" if "+" not in row.data_time.isoformat().replace("+00:00", "") else "") if getattr(row, "data_time", None) else (row.data_date.isoformat() if row.data_date else None),
            "data_src":                   "cache",
            "sector":                     get_sector_display(row.symbol),
            "name":                       get_company_name(row.symbol),
        })


    # [LEVEL 4] Sectoral Alpha (Relative Strength) Normalization
    if results:
        try:
            # 1. Group by sector for change% analysis
            # Y-4: NULL change_pct değerleri dışarıda bırakılıyor. Önceden None → 0.0 kabul ediliyordu;
            # bu sektör ortalamasını aşağı çekiyor ve alpha hesaplamasını bozuyordu.
            sector_groups = {}
            for res in results:
                sec = res["sector"]
                if sec not in sector_groups:
                    sector_groups[sec] = []
                chg = res.get("change_pct")
                if chg is not None:  # Y-4: NULL'ları dışla
                    sector_groups[sec].append(chg)

            # 2. Calculate sector-wide averages
            # Min 3 hisse şartı: daha az hisseyle sektör ortalaması istatistiksel anlamsız.
            # Winsorize: aşırı uç değerler (en düşük %5, en yüksek %5) sektör ortalamasını
            # bozmasın; 1 hissenin +%50 hareketi diğerlerinin alpha puanını çarpıtır.
            def _winsorized_mean(vals: list) -> float:
                if len(vals) < 3:
                    return 0.0
                sorted_v = sorted(vals)
                cut = max(1, len(sorted_v) // 20)  # %5 her uçtan (min 1 eleman)
                trimmed = sorted_v[cut:-cut] if len(sorted_v) > 2 * cut else sorted_v
                return statistics.mean(trimmed) if trimmed else 0.0

            sector_avgs = {
                sec: _winsorized_mean(vals)
                for sec, vals in sector_groups.items()
                if len(vals) >= 3  # min 3 hisse
            }
            
            # 3. Calculate market-wide average (Safety Check: only if results exist)
            market_avg = 0.0
            if results:
                chg_vals = [r["change_pct"] for r in results if r.get("change_pct") is not None]
                if chg_vals:
                    market_avg = statistics.mean(chg_vals)
            
            # 4. Apply Alpha Boosts
            for res in results:
                sec = res["sector"]
                sec_avg = sector_avgs.get(sec, 0.0)
                
                # Sektörel Pozitif Ayrışma (Alpha) — Y-4: change_pct None ise alpha hesaplamayı atla
                chg = res.get("change_pct")
                if chg is None:
                    continue
                alpha = chg - sec_avg
                if alpha > 2.8:
                    res["yzdsh"] = min(100.0, res["yzdsh"] + 12.0)
                elif alpha > 1.2:
                    res["yzdsh"] = min(100.0, res["yzdsh"] + 7.5)
                
                # Market Leader: Tüm piyasa (Batch) ortalaması negatifken yeşil kalanlar
                if market_avg < -1.5 and chg > 0:
                    res["yzdsh"] = min(100.0, res["yzdsh"] + 10.0)
                
                # Final Rounding
                res["yzdsh"] = round(res["yzdsh"], 1)
                res["QRS"] = res["yzdsh"] # Legacy Support
        except Exception as e:
            logger.error("[Level4] Alpha normalization failed: %s", e, exc_info=True)

    # Sort by personalized QRS descending, take top N
    results.sort(key=lambda x: x["yzdsh"], reverse=True)

    # ── QRS Distribution Validation ──────────────────────────────────────────
    # Healthy distribution: mean ~45-65, std >8, not all bunched at same value.
    # Anomalies indicate scoring engine drift or data quality issues.
    qrs_warning = None
    if len(results) >= 20:
        try:
            scores = [r["yzdsh"] for r in results if r.get("yzdsh") is not None]
            if scores:
                mean_qrs = statistics.mean(scores)
                stdev_qrs = statistics.stdev(scores) if len(scores) > 1 else 0
                pct_above_70 = sum(1 for s in scores if s >= 70) / len(scores) * 100
                pct_below_30 = sum(1 for s in scores if s <= 30) / len(scores) * 100

                # Dinamik std eşiği: büyük evren (500+ sembol) → yüksek std beklenir.
                # Sabit eşik=2 küçük taramalarda (50 sembol) yanlış alarm veriyordu.
                _std_min_expected = max(2.0, min(8.0, len(scores) ** 0.4))
                if stdev_qrs < _std_min_expected:
                    qrs_warning = f"QRS skorları anormal derecede kümelenmiş (std={stdev_qrs:.1f}, beklenen≥{_std_min_expected:.1f}). Skor motoru kontrolü gerekebilir."
                elif mean_qrs > 85:
                    qrs_warning = f"Ortalama QRS çok yüksek ({mean_qrs:.0f}/100) — puanlama kalibrasyonu gerekebilir."
                elif mean_qrs < 15:
                    qrs_warning = f"Ortalama QRS çok düşük ({mean_qrs:.0f}/100) — veri kalitesi veya model sorunu olabilir."
                elif pct_above_70 > 75:
                    qrs_warning = f"Hisselerin %{pct_above_70:.0f}'ı QRS≥70 aldı — eşikler yeniden kalibre edilmeli."

                if qrs_warning:
                    meta["qrs_warning"] = qrs_warning
        except Exception:
            pass

    return results[:top_n], meta
