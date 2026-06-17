# backend/app/features/scanner/models.py
"""
ScanScore — persists every scanner result to DB so we can:
  1. Track QRS/ML score history per symbol over time
  2. Calibrate predictions (target_price / direction) vs actual outcomes
  3. Feed the admin panel with rich analytics
"""
import datetime
from app.core.time_utils import now_utc
from sqlalchemy import (
    Column, Integer, SmallInteger, String, Float, Boolean, Date, DateTime, Index, Text
)
from app.core.database import Base


def _now_naive() -> datetime.datetime:
    return now_utc().replace(tzinfo=None)


class ScanScore(Base):
    __tablename__ = "scan_scores"

    id          = Column(Integer, primary_key=True, index=True)
    symbol      = Column(String, nullable=False, index=True)
    scan_date   = Column(Date, nullable=False, index=True)   # close-price date
    scanned_at  = Column(DateTime, default=_now_naive, index=True)

    # ── AI / rule scores ─────────────────────────────────────────────────────
    qrs_score   = Column(Float, nullable=True)   # blended yzdsh (0-100)
    ml_score    = Column(Float, nullable=True)   # raw ML model output
    rule_score  = Column(Float, nullable=True)   # rule engine only

    # ── Price snapshot at scan time ───────────────────────────────────────────
    close_price   = Column(Float, nullable=True)
    atr_percent   = Column(Float, nullable=True)
    rsi           = Column(Float, nullable=True)
    volume        = Column(Float, nullable=True)
    volume_ratio  = Column(Float, nullable=True)
    trend         = Column(Boolean, nullable=True)   # EMA5 > EMA20
    pattern_name         = Column(String, nullable=True)
    pattern_is_stale     = Column(Boolean, nullable=True)
    secondary_pattern_name = Column(String, nullable=True)
    change_pct    = Column(Float, nullable=True)

    # ML Retraining Features (V20+)
    ema20_gap     = Column(Float, nullable=True)
    ema50_gap     = Column(Float, nullable=True)
    range_pct     = Column(Float, nullable=True)
    body_pct      = Column(Float, nullable=True)
    momentum      = Column(Float, nullable=True)    # ema5 - ema20
    breakout      = Column(Float, nullable=True)    # max(br20, br55)
    pattern_score = Column(Integer, nullable=True)  # 0-100 formasyon skoru
    raw_features  = Column(String, nullable=True) # Stored as JSON string

    # ── Prediction (computed at scan time from ATR + direction) ───────────────
    target_price     = Column(Float, nullable=True)
    stop_price       = Column(Float, nullable=True)    # ATR-based stop-loss level
    risk_reward      = Column(Float, nullable=True)    # reward / risk ratio (e.g. 2.4 = 2.4:1)
    target_direction = Column(String, nullable=True)   # 'bullish'|'bearish'|'neutral'
    predicted_days   = Column(Integer, nullable=True)  # estimated calendar days to target

    # ── Metadata ──────────────────────────────────────────────────────────────
    profile_name    = Column(String, nullable=True)
    scan_session_id = Column(String, nullable=True, index=True)  # UUID per scan run

    # ── Calibration result (filled by calibration job) ────────────────────────
    evaluated_at         = Column(DateTime, nullable=True)
    actual_price_at_eval = Column(Float, nullable=True)
    actual_return_pct    = Column(Float, nullable=True)   # (actual - close) / close * 100
    target_hit           = Column(Boolean, nullable=True) # did price reach target in window?
    max_gain_pct         = Column(Float, nullable=True)   # max gain during eval window
    max_loss_pct         = Column(Float, nullable=True)   # max loss during eval window
    hit_accuracy_pct     = Column(Float, nullable=True)   # 0..100+ precision score
    hit_status           = Column(String, nullable=True)  # 'target_hit', 'near_miss', 'partial', 'miss'

    # ── Yönsel doğruluk & büyüklük sapması (kullanıcı mentalitesi) ───────────────
    # directional_hit: fiyat TAHMİN EDİLEN YÖNDE hareket etti mi? (herhangi bir miktarda)
    # target_hit: tam hedef fiyatına ulaşıldı mı?
    directional_hit          = Column(Boolean, nullable=True)   # yön doğru mu?
    predicted_return_pct     = Column(Float,   nullable=True)   # tahmin edilen getiri % (hedef fiyat - giriş) / giriş * 100
    magnitude_deviation_pct  = Column(Float,   nullable=True)   # |tahmin_getiri - gerçek_getiri| farkı

    # ── PRISM veto audit trail ────────────────────────────────────────────────
    # ── Strategy Snapshot (V30: Multi-Profile Support) ──────────────────────
    # Stored as JSON string: {"Safe Harbor": {"qrs": 85, "target": 102.5, "hit": null}, ...}
    strategy_snapshot = Column(String, nullable=True)

    # ── PRISM veto audit trail ────────────────────────────────────────────────
    # Hangi güvenlik mekanizmasının devreye girdiğini kaydeder.
    veto_reasons = Column(String, nullable=True)

    # Extended technical + macro indicators (V3 ML features)
    w52_position          = Column(Float, nullable=True)
    dist_from_52w_high    = Column(Float, nullable=True)
    dist_from_52w_low     = Column(Float, nullable=True)
    volume_zscore         = Column(Float, nullable=True)
    ret_3d                = Column(Float, nullable=True)
    ret_acceleration      = Column(Float, nullable=True)
    consecutive_down_days = Column(Integer, nullable=True)
    close_position        = Column(Float, nullable=True)
    ema_alignment_score   = Column(Integer, nullable=True)
    trend_duration_days   = Column(Integer, nullable=True)
    bist100_trend_5d      = Column(Float, nullable=True)
    vix_regime            = Column(Integer, nullable=True)
    usdtry_change_5d      = Column(Float, nullable=True)
    market_regime         = Column(Integer, nullable=True)
    sector_rel_strength_5d = Column(Float, nullable=True)
    rs_vs_bist100         = Column(Float, nullable=True)

    # Alpha vs BIST100 benchmark (filled by evaluator)
    bist100_return_on_date = Column(Float, nullable=True)  # XU100.IS return % over eval window
    alpha                  = Column(Float, nullable=True)  # actual_return_pct - bist100_return_on_date
    outperformed_benchmark = Column(Boolean, nullable=True)  # alpha > 0
    ml_schema_version      = Column(SmallInteger, nullable=True)  # FEATURE_SCHEMA_VERSION at scan time

    # Composite indices for fast lookups
    __table_args__ = (
        Index('ix_scan_scores_symbol_date', 'symbol', 'scan_date'),
        Index('ix_scan_scores_evaluated_at', 'evaluated_at'),
        Index('ix_scan_scores_date_direction', 'scan_date', 'target_direction'),
    )

class SymbolDataCache(Base):
    __tablename__ = "symbol_data_cache"

    id          = Column(Integer, primary_key=True, index=True)
    symbol      = Column(String, nullable=False, index=True)
    batch_id    = Column(String, nullable=False, index=True)
    scanned_at  = Column(DateTime, default=_now_naive, index=True)
    data_date   = Column(Date, nullable=True)
    data_time   = Column(DateTime, nullable=True)

    open_price   = Column(Float, nullable=True)
    high_price   = Column(Float, nullable=True)
    low_price    = Column(Float, nullable=True)
    close_price  = Column(Float, nullable=True)
    change_pct   = Column(Float, nullable=True)

    rsi          = Column(Float, nullable=True)
    ema20        = Column(Float, nullable=True)
    ema50        = Column(Float, nullable=True)
    atr_percent  = Column(Float, nullable=True)
    volume       = Column(Float, nullable=True)
    volume_ratio = Column(Float, nullable=True)
    trend        = Column(Boolean, nullable=True)
    breakout     = Column(Float, nullable=True)
    momentum     = Column(Float, nullable=True)

    pattern_name  = Column(String, nullable=True)
    pattern_score = Column(Integer, nullable=True)
    pattern_json  = Column(Text, nullable=True)   # serialized detect_patterns_validated() output (grafik cache)

    ema20_gap     = Column(Float, nullable=True)
    ema50_gap     = Column(Float, nullable=True)
    range_pct     = Column(Float, nullable=True)
    body_pct      = Column(Float, nullable=True)

    ml_score = Column(Float, nullable=True)

    # Multi-Profile Scores (V30: Local Switch Support)
    # JSON String: {"Safe Harbor": 85.2, "Aggressive": 42.1, ...}
    strategy_snapshot = Column(String, nullable=True)

    target_price     = Column(Float, nullable=True)
    target_direction = Column(String, nullable=True)
    predicted_days   = Column(Integer, nullable=True)
    source_tag       = Column(String, nullable=True)  # data origin: "bigpara", "cf_worker", "yfinance", etc.

    # Extended technical indicators (Phase 2/3)
    w52_position          = Column(Float, nullable=True)
    dist_from_52w_high    = Column(Float, nullable=True)
    dist_from_52w_low     = Column(Float, nullable=True)
    volume_zscore         = Column(Float, nullable=True)
    ret_3d                = Column(Float, nullable=True)
    ret_acceleration      = Column(Float, nullable=True)
    consecutive_down_days = Column(Integer, nullable=True)
    close_position        = Column(Float, nullable=True)
    ema_alignment_score   = Column(Integer, nullable=True)
    trend_duration_days   = Column(Integer, nullable=True)
    bist100_trend_5d      = Column(Float, nullable=True)
    vix_regime            = Column(Integer, nullable=True)
    usdtry_change_5d      = Column(Float, nullable=True)
    sector_rel_strength_5d = Column(Float, nullable=True)

    __table_args__ = (
        Index('ix_symbol_cache_batch_sym', 'batch_id', 'symbol'),
    )


class SystemTaskLog(Base):
    __tablename__ = "system_task_logs"

    id          = Column(Integer, primary_key=True, index=True)
    task_name   = Column(String, nullable=False, index=True)
    started_at  = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))
    finished_at = Column(DateTime, nullable=True)
    status      = Column(String, default="running")
    message     = Column(String, nullable=True)
    duration    = Column(Float, nullable=True)


class MLPerformanceStat(Base):
    __tablename__ = "ml_performance_stats"

    id            = Column(Integer, primary_key=True, index=True)
    profile       = Column(String, nullable=False, index=True)
    timestamp     = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None), index=True)

    win_rate      = Column(Float, nullable=True)
    directional_win_rate = Column(Float, nullable=True)
    target_hit_rate = Column(Float, nullable=True)

    # [V30] Close-Loop Calibration Metrics
    avg_magnitude_deviation = Column(Float, nullable=True)  # % sapma
    avg_target_distance     = Column(Float, nullable=True)  # Hedefe olan ortalama uzaklık (Price Error)

    rmse          = Column(Float, nullable=True)
    n_evaluated   = Column(Integer, nullable=True)
    n_hits        = Column(Integer, nullable=True)
    n_directional = Column(Integer, nullable=True)

    # Alpha vs BIST100 benchmark
    avg_alpha          = Column(Float, nullable=True)  # mean(actual_return - bist100_return)
    benchmark_win_rate = Column(Float, nullable=True)  # fraction of predictions that beat BIST100

    __table_args__ = (
        Index('ix_ml_perf_profile_ts', 'profile', 'timestamp'),
    )
