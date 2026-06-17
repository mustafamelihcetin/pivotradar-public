# backend/app/features/scoring/ml/evaluator.py
import logging
import pandas as pd
import datetime
import math
from typing import Dict, Optional, Tuple
from sqlalchemy import and_
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from app.features.market_data.service import MarketDataService
from app.core.market_calendar import add_trading_days
from app.core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.Evaluator")
from app.features.scoring.ml.constants import SOFT_WEIGHTS as _STATUS_WEIGHTS, FORMATION_ATR_MULT

_BIST100_SYMBOL = "XU100.IS"
# In-process cache: scan_date_str → (entry_close, eval_close) or None
_bist100_cache: Dict[str, Optional[Tuple[float, float]]] = {}


def _fetch_bist100_return(
    data_svc: MarketDataService,
    scan_date: datetime.date,
    maturity_date: datetime.date,
) -> Optional[float]:
    """Return BIST100 pct change over [scan_date+1 .. maturity_date], or None on failure."""
    cache_key = f"{scan_date}:{maturity_date}"
    if cache_key in _bist100_cache:
        cached = _bist100_cache[cache_key]
        if cached is None:
            return None
        entry_c, final_c = cached
        return round((final_c - entry_c) / entry_c * 100.0, 2) if entry_c > 0 else None

    try:
        bundle = data_svc.fetch_price_df(
            _BIST100_SYMBOL,
            lookback_days=(datetime.date.today() - scan_date).days + 10,
        )
        if bundle is None or bundle.df.empty:
            _bist100_cache[cache_key] = None
            return None

        df = bundle.df
        if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
            df.index = df.index.tz_convert(None)

        df_dates = df.index.strftime("%Y-%m-%d")
        try:
            eval_start = add_trading_days(scan_date, 1)
        except Exception:
            eval_start = scan_date
        mask = (df_dates >= eval_start.strftime("%Y-%m-%d")) & (
            df_dates <= maturity_date.strftime("%Y-%m-%d")
        )
        window = df.loc[mask]
        if window.empty or len(window) < 1:
            _bist100_cache[cache_key] = None
            return None

        entry_c = float(window["Close"].iloc[0])
        final_c = float(window["Close"].iloc[-1])
        _bist100_cache[cache_key] = (entry_c, final_c)
        return round((final_c - entry_c) / entry_c * 100.0, 2) if entry_c > 0 else None
    except Exception as exc:
        logger.debug("BIST100 fetch failed for %s–%s: %s", scan_date, maturity_date, exc)
        _bist100_cache[cache_key] = None
        return None


def _safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except Exception:
        return default



def _compute_hit_status(
    target_hit: bool,
    direction: str,
    entry_price: float,
    target_price: float,
    max_high: float,
    min_low: float,
) -> tuple[str, float]:
    """
    Returns (hit_status, hit_accuracy_pct).
    hit_accuracy_pct: tahmin edilen hareketin yüzde kaçına ulaşıldı (0-100+).
    """
    exp_move = abs(target_price - entry_price) if target_price else 0.0
    accuracy = 0.0

    if direction == "bullish" and exp_move > 0:
        achieved = max(0.0, max_high - entry_price)
        accuracy = (achieved / exp_move) * 100
    elif direction == "bearish" and exp_move > 0:
        achieved = max(0.0, entry_price - min_low)
        accuracy = (achieved / exp_move) * 100

    # target_hit artık kapanış fiyatı bazlı; accuracy intraday referans için tutuldu.
    # accuracy >= 100 koşulu kaldırıldı — intraday hit ile closing hit çelişiyordu.
    if target_hit:
        return "target_hit", max(100.0, accuracy)
    elif accuracy >= 80:
        return "near_miss", accuracy
    elif accuracy >= 50:
        return "partial", accuracy
    else:
        return "miss", accuracy


def _compute_directional_accuracy(
    direction: str,
    entry_price: float,
    target_price: float,
    actual_return_pct: float,
) -> tuple[bool, float, float]:
    """
    Yönsel isabet değerlendirmesi:
      - directional_hit: fiyat TAHMİN EDİLEN YÖNDE ve anlamlı miktarda hareket etti mi?
        "Anlamlı" = tahmin edilen büyüklüğün en az %20'si kadar.
        Bu eşik, gürültüyü (0.1% hareket) gerçek yönsel isabetten ayırır.
        Bullish → actual_return_pct ≥ predicted_pct * 0.20
        Bearish → actual_return_pct ≤ -(predicted_pct * 0.20)
      - predicted_return_pct: hedef fiyatından beklenen getiri yüzdesi
      - magnitude_deviation_pct: |tahmin_getiri_pct| ile |gerçek_getiri_pct| arasındaki fark

    Örnek: +%5 bekliyoruz, +%0.1 oldu → tuttu=False (0.1 < 5*0.20=1.0), sapma=%4.9
    Örnek: +%5 bekliyoruz, +%1.5 oldu → tuttu=True  (1.5 ≥ 1.0), sapma=%3.5
    Örnek: +%5 bekliyoruz, -%2   oldu → tuttu=False, sapma=%7.0
    """
    if entry_price <= 0:
        return False, 0.0, 0.0

    # Tahmin edilen getiri %
    if direction == "bullish":
        predicted_pct = ((target_price - entry_price) / entry_price * 100.0) if target_price else 0.0
    elif direction == "bearish":
        predicted_pct = ((entry_price - target_price) / entry_price * 100.0) if target_price else 0.0
    else:
        return False, 0.0, 0.0

    # Minimum anlamlı hareket eşiği: tahmin büyüklüğünün %20'si, en az 0.10%
    min_threshold = max(0.10, abs(predicted_pct) * 0.20)

    # Yönsel isabet: doğru yönde ve eşiği aşan hareket
    if direction == "bullish":
        dir_hit = actual_return_pct >= min_threshold
    else:
        dir_hit = actual_return_pct <= -min_threshold

    # Büyüklük sapması: |tahmin_pct - gerçek_pct| — bearish senaryolarda iç abs() yanlış
    deviation = abs(predicted_pct - actual_return_pct)

    return dir_hit, round(predicted_pct, 2), round(deviation, 2)


def evaluate_past_predictions():
    """
    Analyzes ScanScore entries where the predicted maturity date has passed.
    Maturity is computed in TRADING DAYS (BIST calendar) — never calendar days.
    Sets: target_hit, hit_status, hit_accuracy_pct, actual_return_pct,
          max_gain_pct, max_loss_pct, actual_price_at_eval, evaluated_at.
    """
    db = SessionLocal()
    data_svc = MarketDataService()
    today = datetime.date.today()

    logger.critical(f"!!! EVALUATOR V30 STARTING !!! (Today: {today})")
    try:
        scores = db.query(ScanScore).filter(
            and_(
                ScanScore.evaluated_at == None,
                ScanScore.target_direction.in_(["bullish", "bearish"]),
            )
        ).all()

        logger.critical(f"!!! EVALUATOR V30 FOUND {len(scores)} SCORES !!!")
        updated_count = 0
        skipped_immature = 0

        for s_orig in scores:
            try:
                # Fresh fetch from current session to avoid attachment errors
                s = db.query(ScanScore).get(s_orig.id)
                if not s: continue
                
                # --- MATURITY CALCULATION (CRITICAL FIX) ---
                p_days = s.predicted_days
                if p_days is None or math.isnan(float(p_days)):
                    p_days = 5
                    s.predicted_days = p_days
                
                try:
                    maturity_date = add_trading_days(s.scan_date, int(p_days))
                except Exception as _td_err:
                    logger.warning(f"add_trading_days failed for {s.symbol}: {_td_err}")
                    continue

                if maturity_date > today:
                    skipped_immature += 1
                    continue
                # --------------------------------------------

                bundle = data_svc.fetch_price_df(
                    s.symbol,
                    lookback_days=(today - s.scan_date).days + 5,
                )

                if bundle is None or bundle.df.empty:
                    logger.info(f"Skipping {s.symbol}: No price data from {s.scan_date}")
                    continue
                    
                df = bundle.df
                # Ensure naive DatetimeIndex (Nuclear Fix)
                if not isinstance(df.index, pd.DatetimeIndex):
                    df.index = pd.to_datetime(df.index, errors='coerce')
                
                if df.index.tz is not None:
                    df.index = df.index.tz_convert(None) # Strip TZ safely

                # Robust string-based comparison
                df_dates = df.index.strftime('%Y-%m-%d')
                
                # Ensure s.scan_date is naive date string
                s_scan_dt = s.scan_date
                if hasattr(s_scan_dt, 'date'): s_scan_dt = s_scan_dt.date()
                s_date_str = s_scan_dt.strftime('%Y-%m-%d')
                
                m_date_str = maturity_date.strftime('%Y-%m-%d')

                # Giriş günü bias düzeltmesi: sinyal kapanış sonrası oluşur,
                # gerçek giriş ertesi gün açılışında olur — scan günü pencereye dahil edilmez.
                try:
                    eval_start_date = add_trading_days(s.scan_date, 1)
                    eval_start_str  = eval_start_date.strftime('%Y-%m-%d')
                except Exception:
                    eval_start_str = s_date_str

                mask = (df_dates >= eval_start_str) & (df_dates <= m_date_str)
                window_df = df.loc[mask]

                if window_df.empty:
                    logger.info(f"Skipping {s.symbol}: Window empty ({s_date_str} to {m_date_str})")
                    continue

                # Recover entry price if missing
                entry_price = s.close_price
                if entry_price is None:
                    s_row = df[df.index.date == s.scan_date]
                    if not s_row.empty:
                        entry_price = float(s_row["Close"].iloc[0])
                        s.close_price = entry_price # Cache it
                    else:
                        continue
                
                entry_price  = float(entry_price)
                direction    = s.target_direction

                # Recover target_price if nan or None
                target_price = s.target_price
                if target_price is None or math.isnan(float(target_price)):
                    # V10: formasyon tipine göre ATR çarpanı — reversal=2.5×, devam=1.5×, default=2.0×
                    atr_val = _safe_float(s.atr_percent, 2.0)
                    _pname = (getattr(s, "pattern_name", None) or "").strip()
                    _atr_mult = FORMATION_ATR_MULT.get(_pname, FORMATION_ATR_MULT["_default"])
                    if direction == "bullish":
                        target_price = entry_price * (1.0 + (_atr_mult * atr_val / 100.0))
                    else:
                        target_price = entry_price * (1.0 - (_atr_mult * atr_val / 100.0))
                    s.target_price = round(float(target_price), 2)
                
                target_price = float(target_price)

                highs   = window_df["High"].astype(float)
                lows    = window_df["Low"].astype(float)
                closes  = window_df["Close"].astype(float)

                max_high    = float(highs.max())
                min_low     = float(lows.min())
                final_close = float(closes.iloc[-1])
                
                # Check for nan in price data
                if math.isnan(max_high) or math.isnan(min_low) or math.isnan(final_close):
                    continue

                s.actual_price_at_eval = round(final_close, 4)
                s.actual_return_pct    = round((final_close - entry_price) / entry_price * 100.0, 2)
                s.evaluated_at         = now_utc().replace(tzinfo=None)

                if direction == "bullish":
                    # Kapanış fiyatı bazlı hit: intraday high gerçekçi değil,
                    # BIST'te gün içi zirveye tam isabet imkansız.
                    s.target_hit   = bool((closes >= target_price).any())
                    s.max_gain_pct = round((max_high - entry_price) / entry_price * 100.0, 2)
                    s.max_loss_pct = round((min_low  - entry_price) / entry_price * 100.0, 2)
                elif direction == "bearish":
                    s.target_hit   = bool((closes <= target_price).any())
                    s.max_gain_pct = round((entry_price - min_low)  / entry_price * 100.0, 2)
                    s.max_loss_pct = round((entry_price - max_high) / entry_price * 100.0, 2)
                else:
                    s.target_hit   = None
                    s.max_gain_pct = None
                    s.max_loss_pct = None

                # Nuanced hit_status + hit_accuracy_pct (tam hedef fiyatına ulaşma)
                if s.target_hit is not None:
                    status, accuracy = _compute_hit_status(
                        target_hit=bool(s.target_hit),
                        direction=direction,
                        entry_price=entry_price,
                        target_price=target_price,
                        max_high=max_high,
                        min_low=min_low,
                    )
                    s.hit_status       = status
                    s.hit_accuracy_pct = round(accuracy, 1)
                else:
                    s.hit_status       = None
                    s.hit_accuracy_pct = None

                # Yönsel doğruluk & büyüklük sapması (kullanıcı mentalitesi):
                # "tuttu" = yön doğru (herhangi bir miktarda), "tutmadı" = yanlış yön
                # sapma = |tahmin_getiri_pct - gerçek_getiri_pct|
                dir_hit, pred_ret, magnitude_dev = _compute_directional_accuracy(
                    direction=direction,
                    entry_price=entry_price,
                    target_price=target_price,
                    actual_return_pct=s.actual_return_pct or 0.0,
                )
                s.directional_hit         = dir_hit
                s.predicted_return_pct    = pred_ret
                s.magnitude_deviation_pct = magnitude_dev

                # Alpha vs BIST100 benchmark
                bist100_ret = _fetch_bist100_return(data_svc, s.scan_date, maturity_date)
                if bist100_ret is not None and s.actual_return_pct is not None:
                    s.bist100_return_on_date = bist100_ret
                    s.alpha = round(s.actual_return_pct - bist100_ret, 2)
                    s.outperformed_benchmark = bool(s.alpha > 0)

                db.add(s)
                updated_count += 1
                if updated_count % 50 == 0:
                    db.commit()

            except Exception as e:
                try:
                    db.rollback()
                except Exception:
                    pass
                _sym_label = getattr(s, "symbol", None) or getattr(s_orig, "symbol", "?")
                _dt_label  = getattr(s, "scan_date", None) or getattr(s_orig, "scan_date", "?")
                logger.error(f"Error evaluating {_sym_label} from {_dt_label}: {str(e)}")
                # Re-init session after rollback — eski session önce kapatılır
                try:
                    db.close()
                except Exception:
                    pass
                db = SessionLocal()

        if updated_count % 50 != 0:
            db.commit()

        logger.info(
            f"Evaluation complete. Updated {updated_count} records. "
            f"Skipped {skipped_immature} immature."
        )
        return updated_count

    except Exception as e:
        logger.error(f"Global error in evaluator: {e}")
        db.rollback()
    finally:
        db.close()
