# backend/app/features/scanner/logic/calibration_task.py
import datetime
import json
import logging
import os
import pandas as pd
from ....core.market_calendar import add_trading_days



from sqlalchemy.orm import Session
from ....core.database import SessionLocal
from ..models import ScanScore, MLPerformanceStat
from ...market_data.service import MarketDataService
from ....core.time_utils import now_utc

logger = logging.getLogger("PivotRadar.Calibration")

# Shared distributed lock — aynı key, ml_calibration_pipeline ile çakışmaz
from ....core.ml_lock import acquire_ml_lock as _acquire_calib_lock, release_ml_lock as _release_calib_lock


def run_autonomous_calibration(eval_window_days: int = 14):
    """
    Main entry point for the scheduled calibration task.
    """
    from dotenv import load_dotenv
    load_dotenv()

    # Debug: Check DB Connection
    from ....core.database import SQLALCHEMY_DATABASE_URL
    logger.info(f"Connecting to: {SQLALCHEMY_DATABASE_URL[:20]}...")

    db = SessionLocal()
    try:
        _lock_ok = _acquire_calib_lock(db)
    except Exception as _lock_err:
        logger.error("_acquire_calib_lock failed: %s", _lock_err)
        db.close()
        return

    if not _lock_ok:
        logger.info("Calibration already running (distributed lock held) — skipping.")
        db.close()
        return

    data_svc = MarketDataService()
    try:
        today = datetime.date.today()

        # Olgun sinyaller: scan_date + predicted_days <= today
        # Lookback: max 90 gün geriye (predicted_days en fazla 45 gün varsayılır)
        cutoff_start = today - datetime.timedelta(days=90)

        pending_signals = (
            db.query(ScanScore)
            .filter(
                ScanScore.scan_date >= cutoff_start,
                ScanScore.scan_date < today,
                ScanScore.evaluated_at.is_(None),
                ScanScore.close_price.isnot(None),
                ScanScore.close_price > 0,
            )
            .all()
        )

        # Sadece olgunlaşmış sinyalleri değerlendir — iş günü bazlı (takvim günü değil)
        mature = []
        for s in pending_signals:
            horizon = int(s.predicted_days or 14)
            try:
                maturity = add_trading_days(s.scan_date, horizon)
            except Exception:
                maturity = s.scan_date + datetime.timedelta(days=horizon)
            if maturity <= today:
                mature.append((s, maturity))

        if not mature:
            logger.info("No mature signals for calibration.")
            return

        logger.info(f"Calibrating {len(mature)} mature signals (of {len(pending_signals)} pending)...")

        # BIST100 (XU100.IS) getirisini bir kez çek — alpha hesabı için benchmark
        bist100_df = None
        try:
            bist_bundle = data_svc.fetch_price_df("XU100.IS", lookback_days=120)
            bist100_df = bist_bundle.df if bist_bundle else None
        except Exception as _be:
            logger.warning(f"BIST100 verisi çekilemedi, alpha hesabı atlanacak: {_be}")

        # Group by symbol to fetch price history once
        sym_map: dict = {}
        for s, maturity in mature:
            if s.symbol not in sym_map:
                sym_map[s.symbol] = []
            sym_map[s.symbol].append((s, maturity))

        profile_stats = {
            p: {"hits": 0, "total": 0, "dir_hits": 0, "mag_dev": [], "dist_err": [],
                "alphas": [], "bench_wins": 0}
            for p in ["Güvenli Liman", "Agresif Atak", "Dönüş Uzmanı", "Trend Avcısı", "Değer Kaşifi", "Anlık Fırsatçı", "Kırılım Dedektörü"]
        }

        for symbol, sig_list in sym_map.items():
            try:
                # 120 gün yeterli (en eski sinyal 90 gün + 14 gün horizon = 104 gün)
                bundle = data_svc.fetch_price_df(symbol, lookback_days=120)
                df = bundle.df if bundle else None
                if df is None or df.empty:
                    continue

                for sig, maturity_date in sig_list:
                    # Dejenere ML skoru olan kayıtları performans istatistiklerinden hariç tut.
                    _ml = sig.ml_score
                    if _ml is not None and (
                        abs(_ml - 50.0) < 0.01 or abs(_ml - 24.6) < 0.01 or abs(_ml - 38.1) < 0.01
                    ):
                        continue

                    t_price = sig.target_price
                    entry_p = sig.close_price
                    scan_dt = sig.scan_date

                    # Sinyal sonrası barlar
                    post_df = df[df.index.date > scan_dt]
                    if post_df.empty:
                        continue

                    # T+N fiyatı: maturity_date'e en yakın kapanış (ilk mevcut gün)
                    at_maturity = post_df[post_df.index.date >= maturity_date]
                    if at_maturity.empty:
                        # Veri henüz gelmediyse bugünün son kapanışını kullan
                        eval_p = float(post_df["Close"].iloc[-1])
                    else:
                        eval_p = float(at_maturity["Close"].iloc[0])

                    # Sadece T+N'e kadar olan barları kullan (gelecek barlar hit hesabını bozar)
                    window_df = post_df[post_df.index.date <= maturity_date]
                    if window_df.empty:
                        window_df = post_df

                    max_p = float(window_df["High"].max())
                    min_p = float(window_df["Low"].min())

                    # Getiri: T+N kapanış vs giriş fiyatı
                    actual_ret = ((eval_p - entry_p) / entry_p * 100) if entry_p else 0

                    # Neutral sinyalleri calibration istatistiğinden dışla
                    if sig.target_direction == "neutral":
                        sig.evaluated_at = now_utc().replace(tzinfo=None)
                        sig.actual_price_at_eval = eval_p
                        sig.actual_return_pct = actual_ret
                        sig.target_hit = None
                        sig.hit_status = "neutral_skip"
                        sig.directional_hit = None
                        continue

                    # hit_status hesapla
                    if t_price and entry_p and t_price > 0:
                        is_bullish = sig.target_direction == "bullish"
                        closes = window_df["Close"].astype(float)
                        if is_bullish:
                            target_hit_bool = bool((closes >= t_price).any())
                            near_miss = bool((closes >= t_price * 0.98).any()) and not target_hit_bool
                        else:
                            target_hit_bool = bool((closes <= t_price).any())
                            near_miss = bool((closes <= t_price * 1.02).any()) and not target_hit_bool

                        if target_hit_bool:
                            hit_status = "target_hit"
                        elif near_miss:
                            hit_status = "near_miss"
                        elif actual_ret > 0:
                            hit_status = "partial"
                        else:
                            hit_status = "miss"
                    else:
                        # Hedef fiyat yoksa yön bazlı değerlendir
                        is_bullish_fb = sig.target_direction == "bullish"
                        if is_bullish_fb:
                            target_hit_bool = actual_ret > 0
                            hit_status = "partial" if actual_ret > 0 else "miss"
                        else:
                            target_hit_bool = actual_ret < 0
                            hit_status = "partial" if actual_ret < 0 else "miss"

                    sig.evaluated_at = now_utc().replace(tzinfo=None)
                    sig.actual_price_at_eval = eval_p
                    sig.actual_return_pct = actual_ret
                    sig.target_hit = target_hit_bool
                    sig.hit_status = hit_status

                    # Max gain / max loss during eval window (risk metrics)
                    if entry_p and entry_p > 0:
                        sig.max_gain_pct = ((max_p - entry_p) / entry_p * 100) if max_p else None
                        sig.max_loss_pct = ((min_p - entry_p) / entry_p * 100) if min_p else None

                    # directional_hit: vade penceresi kapanışında yön doğru mu?
                    if sig.target_direction == "bullish":
                        sig.directional_hit = bool(eval_p > entry_p)
                    elif sig.target_direction == "bearish":
                        sig.directional_hit = bool(eval_p < entry_p)
                    else:
                        sig.directional_hit = None

                    # Alpha vs BIST100 benchmark (T+N penceresi)
                    if bist100_df is not None and not bist100_df.empty:
                        try:
                            bist_post = bist100_df[bist100_df.index.date > scan_dt]
                            bist_at = bist_post[bist_post.index.date >= maturity_date]
                            if not bist_at.empty and not bist100_df[bist100_df.index.date <= scan_dt].empty:
                                bist_entry = float(bist100_df[bist100_df.index.date <= scan_dt]["Close"].iloc[-1])
                                bist_eval  = float(bist_at["Close"].iloc[0])
                                bist_ret   = ((bist_eval - bist_entry) / bist_entry * 100) if bist_entry else 0
                                sig.bist100_return_on_date = bist_ret
                                sig.alpha = actual_ret - bist_ret
                                sig.outperformed_benchmark = sig.alpha > 0
                        except Exception:
                            pass

                    # Strategy Snapshot Evaluation
                    if sig.strategy_snapshot:
                        try:
                            snapshot = json.loads(sig.strategy_snapshot)
                            for prof_name, data in snapshot.items():
                                if prof_name not in profile_stats: continue
                                
                                p_target = float(data.get("target_price") or 0)
                                p_dir    = data.get("direction")
                                
                                if not p_target or not p_dir or p_target <= 0: continue
                                
                                profile_stats[prof_name]["total"] += 1

                                # 1. Did it hit target? — Sadece vade penceresindeki barlar (post_df değil)
                                hit = False
                                closes_arr = window_df["Close"].astype(float)
                                if p_dir == "bullish":
                                    hit = bool((closes_arr >= p_target).any())
                                    if eval_p > entry_p: profile_stats[prof_name]["dir_hits"] += 1
                                elif p_dir == "bearish":
                                    hit = bool((closes_arr <= p_target).any())
                                    if eval_p < entry_p: profile_stats[prof_name]["dir_hits"] += 1
                                    
                                if hit: profile_stats[prof_name]["hits"] += 1

                                # 2. Distance Error (Target vs Max reached)
                                if p_dir == "bullish":
                                    dist = abs(p_target - max_p) / p_target * 100
                                else:
                                    dist = abs(p_target - min_p) / p_target * 100
                                profile_stats[prof_name]["dist_err"].append(dist)

                                # 3. Alpha vs BIST100 benchmark
                                if sig.alpha is not None:
                                    profile_stats[prof_name]["alphas"].append(sig.alpha)
                                    if sig.outperformed_benchmark:
                                        profile_stats[prof_name]["bench_wins"] += 1
                        except Exception as _snap_err:
                            logger.warning("strategy_snapshot parse hatası (%s): %s", symbol, _snap_err)
            except Exception as e:
                logger.error(f"Error calibrating {symbol}: {e}")

        # Save Performance Stats for BOTH local and canonical names
        from ....core.config_profiles import normalize_profile as _norm
        
        for prof_name, stats in profile_stats.items():
            if stats["total"] > 0:
                win_rate  = stats["hits"] / stats["total"]
                dir_rate  = stats["dir_hits"] / stats["total"]
                avg_err   = sum(stats["dist_err"]) / len(stats["dist_err"]) if stats["dist_err"] else 0
                avg_alpha = sum(stats["alphas"]) / len(stats["alphas"]) if stats["alphas"] else None
                bench_wr  = stats["bench_wins"] / len(stats["alphas"]) if stats["alphas"] else None

                def _mk_stat(**kw):
                    return MLPerformanceStat(
                        win_rate=win_rate,
                        directional_win_rate=dir_rate,
                        target_hit_rate=win_rate,
                        avg_target_distance=avg_err,
                        avg_alpha=avg_alpha,
                        benchmark_win_rate=bench_wr,
                        n_evaluated=stats["total"],
                        n_hits=stats["hits"],
                        **kw,
                    )

                # Save as local name (e.g. "Güvenli Liman")
                db.add(_mk_stat(profile=prof_name))

                # Save as canonical name (e.g. "SAFE_HARBOR") for UI Matrix
                canon = _norm(prof_name)
                if canon != prof_name:
                    db.add(_mk_stat(profile=canon))
        
        db.commit()
        logger.info("Autonomous calibration completed successfully.")

        # Auto-retrain: yeni değerlendirilmiş kayıt sayısı eşiği geçtiyse tetikle
        try:
            from .calibration import _maybe_trigger_retrain
            _maybe_trigger_retrain(db)
        except Exception as _re:
            logger.warning(f"Auto-retrain check failed: {_re}")

    finally:
        _release_calib_lock(db)
        db.close()

if __name__ == "__main__":
    run_autonomous_calibration()
