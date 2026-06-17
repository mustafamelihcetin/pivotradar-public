# _engine_pipeline.py
# -*- coding: utf-8 -*-
"""
PivotRadar - Analysis Engine Pipeline

run_pipeline() ana tarama fonksiyonu + _process_symbol() per-sembol işçisi.
Yardımcı sınıf/fonksiyonlar pipeline/ alt dizinine taşındı:
  pipeline/_helpers.py   — SimpleTA, call_rules_score, debug helpers
  pipeline/_context.py   — ScanContext dataclass
"""

from __future__ import annotations

from dataclasses import dataclass, field  # noqa: F401 — _process_symbol context compat
from typing import Dict, Any, Optional, Callable, Tuple
from pathlib import Path
import functools
import logging
import time
import os
import json
import threading
import concurrent.futures

import numpy as np
import pandas as pd

from app.shared.feature_builder import build_ml_features
from app.features.charts.patterns import detect_patterns_validated
from app.features.market_data.service import MarketDataService
from app.core import settings
from app.core.database import SessionLocal
from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS

from ._engine_constants import (
    _RSI_EXTREME_OVERBOUGHT,
    _RSI_OVERBOUGHT,
    _ML_CAP_EXTREME,
    _ML_CAP_OVERBOUGHT,
    CHUNK_SIZE,
    _FUTURE_TIMEOUT,
)
from ._engine_ml import _pick_latest_ml_model, MLScorer  # noqa: F401

# Pipeline alt modülleri
from .pipeline._helpers import (
    call_rules_score as _call_rules_score,
    SimpleTA, ta,
    env_bool as _env_bool,
    fmt_float as _fmt_float,
    ensure_float as _ensure_float,
    feat_nonzero_stats as _feat_nonzero_stats,
    assert_ml_strict as _assert_ml_strict,
    parse_int_param as _parse_int_param,
    parse_float_param as _parse_float_param,
)
from .pipeline._context import ScanContext as _ScanContext

# Tüm formasyonlar için sentiment haritası (modül seviyesi — QRS + ML için paylaşımlı)
PATTERN_SENTIMENT: dict = {
    "Bayrak": 1.00, "Flama": 1.00, "Kupa Sap": 0.95,
    "Alçalan Takoz": 0.95, "Ters Baş Omuz": 0.95,
    "Üçlü Dip": 0.90, "Çift Dip": 0.85,
    "Yükselen Kanal": 0.75, "Yükselen Üçgen": 0.75,
    "Destek Hattı": 0.65,
    "Daralan Üçgen": 0.10, "Range/Kutu": 0.00,
    "Alçalan Kanal": -0.35, "Genişleyen Üçgen": -0.30,
    "Alçalan Üçgen": -0.60, "Direnç Hattı": -0.55,
    "Yükselen Takoz": -0.85,
    "Çift Tepe": -0.85, "Üçlü Tepe": -0.90,
    "Baş Omuz": -1.00,
}

# Pattern type → ordinal encoding for ML (must match training.py _PATTERN_ENCODING)
_PATTERN_ENCODING_ML: Dict[str, float] = {
    "Çift Dip": 2.0, "Ters Baş Omuz": 2.0, "Üçlü Dip": 2.0, "Kupa Sap": 2.0, "Alçalan Takoz": 2.0,
    "Yükselen Kanal": 1.0, "Yükselen Üçgen": 1.0, "Bayrak": 1.0, "Flama": 1.0,
    "Daralan Üçgen": 0.0, "Range/Kutu": 0.0, "Destek Hattı": 0.5, "Direnç Hattı": -0.5,
    "Genişleyen Üçgen": 0.0, "Alçalan Kanal": -1.0, "Alçalan Üçgen": -1.0,
    "Baş Omuz": -2.0, "Çift Tepe": -2.0, "Üçlü Tepe": -2.0, "Yükselen Takoz": -2.0,
}

# Profile → ordinal encoding for ML (must match constants.py PROFILE_ENCODING)
_PROFILE_ENCODING_ML: Dict[str, float] = {
    "Güvenli Liman": 2.0, "Trend Avcısı": 1.0, "Değer Kaşifi": 1.0,
    "Dönüş Uzmanı": 0.0, "Kırılım Dedektörü": 0.0,
    "Anlık Fırsatçı": -1.0, "Agresif Atak": -2.0,
}

logger = logging.getLogger("PivotRadar.Engine")




def _process_symbol(symbol_tuple: tuple, ctx: _ScanContext) -> Optional[Dict[str, Any]]:
    """
    Per-symbol scoring worker — runs inside ThreadPoolExecutor.
    All shared state arrives via ctx (_ScanContext) instead of closure capture.
    """
    i, sym = symbol_tuple
    df = None
    ohlc_meta = None

    def _sani(val, default=0.0):
        try:
            f = float(val)
            return f if np.isfinite(f) else default
        except Exception:
            return default

    from app.features.scoring.prism_service import UnifiedPRISM
    from app.features.market_data.data.universe_bist import get_company_name, get_sector

    try:
        if ctx.stop_check and ctx.stop_check():
            return None

        try:
            if sym in ctx.bulk_cache:
                bundle = ctx.bulk_cache[sym]
                df, src = ctx.data_svc.stitch_hybrid(sym, bundle.df, f"{sym}.IS", skip_live=True)
            else:
                bundle = ctx.data_svc.fetch_price_df(sym, lookback_days=max(ctx.params.get("history_days", 365), 730))
                df = bundle.df
                src = bundle.source
            ohlc_meta = {"src": src, "health": "OK", "last_ts": None}
        except Exception as fe:
            emsg = str(fe)
            with ctx.processed_count_lock:
                if "404" in emsg:
                    ctx.fetch_errors["404"] += 1
                elif "delisted" in emsg.lower():
                    ctx.fetch_errors["delisted"] += 1
                else:
                    ctx.fetch_errors["other"] += 1
            return None

        try:
            from app.shared.ohlcv import DataQuality as _DQ
            if hasattr(bundle, "quality_flag") and bundle.quality_flag == _DQ.INCOMPLETE:
                logger.debug("[SKIP] %s: DataQuality.INCOMPLETE", sym)
                return None
        except Exception:
            pass

        clean_df = df.dropna(subset=["Close"])
        if len(clean_df) < 30:
            return None

        price_std = clean_df["Close"].std()
        total_vol_30 = clean_df["Volume"].tail(30).sum() if "Volume" in clean_df.columns else 0
        if price_std == 0 or total_vol_30 <= 0:
            logger.debug("[SKIP] %s: Dead/Static asset", sym)
            return None

        try:
            if src and "yfinance" in src:
                from app.core import settings as _s
                target_p = Path(_s.EOD_DIR) / f"{sym}.parquet"
                df.to_parquet(target_p)
        except Exception:
            pass

        if src and any(tag in src for tag in ("stale_fallback", "very_stale_fallback", "cf_worker|")):
            logger.info("Skipping stale/single-day data: %s (source=%s)", sym, src)
            return None
        if src and "cf_worker+stale" in src and len(df) < 30:
            logger.info("Skipping cf_worker+stale with insufficient bars: %s (%d bars)", sym, len(df))
            return None

        # ── Ölü/Devre dışı hisse kalkanı ────────────────────────────────────────
        # 1. Son bar tarihi: 5 iş gününden eski veri → işlem durdurulmuş/çıkarılmış
        try:
            if isinstance(df.index, pd.DatetimeIndex) and len(df) > 0:
                import datetime as _dt
                from app.core.market_calendar import count_trading_days
                last_bar_date = df.index[-1].date()
                _trading_days_since = count_trading_days(last_bar_date, _dt.date.today())
                if _trading_days_since >= 5:
                    logger.info(
                        "[SKIP] %s: Son bar %s — %d iş günü işlem yok (devre dışı/çıkarılmış?)",
                        sym, last_bar_date, _trading_days_since,
                    )
                    return None
        except Exception:
            pass

        # 2. Son 10 günde gerçek hareket var mı?
        try:
            _recent = clean_df.tail(10)
            _recent_vol   = float(_recent["Volume"].sum()) if "Volume" in _recent.columns else 1.0
            _recent_range = float((_recent["High"] - _recent["Low"]).sum()) if "High" in _recent.columns else 1.0
            _recent_close_std = float(_recent["Close"].std()) if len(_recent) > 1 else 1.0
            if _recent_vol <= 0 or (_recent_range < 1e-6 and _recent_close_std < 1e-6):
                logger.info("[SKIP] %s: Son 10 günde sıfır hacim/hareket — ölü hisse", sym)
                return None
        except Exception:
            pass

        if not isinstance(df.index, pd.DatetimeIndex):
            try:
                df.index = pd.to_datetime(df.index, errors="coerce")
            except Exception:
                pass

        last_close = float(pd.to_numeric(df["Close"], errors="coerce").iloc[-1])
        prev_close = float(pd.to_numeric(df["Close"], errors="coerce").iloc[-2]) if len(df) > 1 else last_close

        if last_close <= 0 or prev_close <= 0:
            return None

        change_pct = ((last_close - prev_close) / prev_close) * 100.0

        if abs(change_pct) > 95.0:
            logger.warning("Suspicious price gap — skipping %s (%+.2f%%) — likely data error", sym, change_pct)
            return None

        from app.shared.ohlcv import compute_rsi_wilder, compute_atr_wilder

        df["_atr"]  = compute_atr_wilder(df, period=14)
        df["_rsi"]  = compute_rsi_wilder(df["Close"], period=14)
        df["_ema5"] = df["Close"].ewm(span=5,  adjust=False).mean()
        df["_ema20"]= df["Close"].ewm(span=20, adjust=False).mean()
        df["_ema50"]= df["Close"].ewm(span=50, adjust=False).mean()

        vol_series  = pd.to_numeric(df["Volume"], errors="coerce").replace(0, np.nan)
        df["_v20"]  = vol_series.rolling(20).mean()
        df["_vol_ratio"] = (vol_series / df["_v20"]).fillna(1.0)

        last_vol   = float(vol_series.iloc[-1]) if pd.notna(vol_series.iloc[-1]) else 0.0
        avg_vol20  = float(df["_v20"].iloc[-1])  if pd.notna(df["_v20"].iloc[-1]) else 1.0
        _raw_ratio   = (last_vol / avg_vol20) if avg_vol20 > 0 else 1.0
        volume_ratio = max(0.0, min(20.0, _raw_ratio))   # anomaly guard: >20x avg hacim geçersiz

        atr_val    = float(df["_atr"].iloc[-1]) if pd.notna(df["_atr"].iloc[-1]) else float("nan")
        atr_percent= (atr_val / last_close * 100) if (np.isfinite(atr_val) and last_close) else 2.0
        rsi_val    = float(df["_rsi"].iloc[-1]) if pd.notna(df["_rsi"].iloc[-1]) else 50.0
        ema5       = float(df["_ema5"].iloc[-1])
        ema20      = float(df["_ema20"].iloc[-1])
        ema50      = float(df["_ema50"].iloc[-1])

        pat_score, pat_text, ai_vision = 0, "", {}
        pat_formed_bars_ago, pat_is_stale = 0, False
        _sentiment = 0.0  # formasyon sentiment (QRS + ML için) — her zaman tanımlı
        if ctx.use_patterns:
            try:
                detected = detect_patterns_validated(df)
                ai_vision = dict(detected) if isinstance(detected, dict) else {}
                _dt = ai_vision.get("detected_type", "")
                if ai_vision and _dt and _dt not in ("NONE", "Formasyon Yok", ""):
                    raw_conf = _ensure_float(ai_vision.get("confidence"), 0.0)
                    # Görsel eşik: ≥0.30 → formasyon adı listelerde gösterilir
                    if raw_conf >= 0.30:
                        pat_formed_bars_ago = int(ai_vision.get("formed_bars_ago", 0))
                        pat_is_stale        = bool(ai_vision.get("is_stale", False))
                        # Stale formasyon: QRS etkisi yok ama adı yine de kaydedilir.
                        # Frontend soluk renkte gösterir; grafik de aynı formasyonu çizdiği için
                        # liste ile tutarsızlık oluşmaz.
                        pat_text = str(_dt)
                        if not pat_is_stale:
                            _sentiment = PATTERN_SENTIMENT.get(pat_text, 0.0)
                            # QRS etkisi: ≥0.45 confidence + yaş ağırlıklı skor
                            if raw_conf >= 0.45:
                                age_mult = (
                                    1.00 if pat_formed_bars_ago <= 3  else  # son 3 bar: taze
                                    0.90 if pat_formed_bars_ago <= 8  else  # ~1.5 hafta
                                    0.75 if pat_formed_bars_ago <= 15 else  # ~3 hafta
                                    0.55 if pat_formed_bars_ago <= 25 else  # ~5 hafta
                                    0.35 if pat_formed_bars_ago <= 40 else  # ~2 ay
                                    0.15                                     # eski ama stale değil
                                )
                                pat_score = int(raw_conf * age_mult * 100)
                            # else: conf 0.30-0.45 → görüntü için yazılır, QRS etkisi 0
            except Exception as pe:
                logger.debug("Pattern detection error for %s: %s", sym, pe)

        df["_h20"] = pd.to_numeric(df["High"], errors="coerce").rolling(20).max()
        df["_h55"] = pd.to_numeric(df["High"], errors="coerce").rolling(55).max()

        high20 = float(df["_h20"].iloc[-1]) if pd.notna(df["_h20"].iloc[-1]) else float("nan")
        high55 = float(df["_h55"].iloc[-1]) if pd.notna(df["_h55"].iloc[-1]) else float("nan")
        br20 = 1.0 if (np.isfinite(high20) and last_close >= high20) else 0.0
        br55 = 1.0 if (np.isfinite(high55) and last_close >= high55) else 0.0

        ovr = ctx.params.get("overrides") or {}
        custom_trend    = bool(ovr.get("trendFilter", True)) if isinstance(ovr.get("trendFilter"), bool) else True
        _vb             = ovr.get("volBlast")
        custom_vol_ratio= max(0.0, min(20.0, float(_vb))) if _vb is not None else volume_ratio

        rule_score = float(_call_rules_score(
            rsi=_ensure_float(rsi_val, 0.0),
            breakout=float(max(br20, br55)),
            trend=1.0 if (custom_trend and ema20 > ema50) else 0.5,
            atr_pct=_ensure_float(atr_percent, 0.0),
            vol_ratio=_ensure_float(custom_vol_ratio, 0.0),
            profile_name=str(ctx.params.get("profile_name", "Dengeli"))
        ))

        if pat_score > 0:
            vol_boost = 1.20 if volume_ratio > 1.8 else (0.80 if volume_ratio < 0.7 else 1.0)
            # ── Formasyon anlamına göre QRS etkisi (birincil + ikincil) ─────────────
            _rel = (ai_vision or {}).get("profile_relevance", "medium")
            _rel_mult = {"high": 1.30, "medium": 1.00, "low": 0.65}.get(_rel, 1.00)
            _base_impact = 8.0 + (pat_score - 45) / 55.0 * 17.0
            _base_impact = max(0.0, min(25.0, _base_impact))
            # _sentiment zaten pat_text set edilirken hesaplandı

            # Kırılım yakınlığı çarpanı
            _is_stb = bool((ai_vision or {}).get("is_short_term_breakout", False))
            _stb_mult = 1.40 if _is_stb and _sentiment > 0 else (1.55 if _is_stb and _sentiment < 0 else 1.00)

            # Yakınsama bonusu (Üçgen / Takoz apekse yakınlık)
            _conv_bonus = 1.0
            _conv_ratio = (ai_vision or {}).get("convergence_ratio")
            _CONV_TYPES = {"Daralan Üçgen","Yükselen Üçgen","Alçalan Üçgen","Alçalan Takoz","Yükselen Takoz"}
            if _conv_ratio and pat_text in _CONV_TYPES:
                if _conv_ratio > 3.0:   _conv_bonus = 1.30
                elif _conv_ratio > 2.0: _conv_bonus = 1.15

            if _sentiment > 0:
                _pat_delta = _sentiment * _base_impact * _rel_mult * _stb_mult * _conv_bonus * vol_boost
                rule_score = min(100.0, rule_score + _pat_delta)
            elif _sentiment < 0:
                _pat_delta = abs(_sentiment) * _base_impact * 0.55 * _rel_mult * _stb_mult
                rule_score = max(0.0, rule_score - _pat_delta)

            # ── İkincil formasyon QRS etkisi (%40 ağırlık) ───────────────────────
            _sec_pat = (ai_vision or {}).get("secondary_pattern") or {}
            _sec_name = _sec_pat.get("detected_type", "")
            if _sec_name and _sec_name not in ("Formasyon Yok", "NONE", ""):
                _sec_sent = PATTERN_SENTIMENT.get(_sec_name, 0.0)
                _sec_conf = float(_sec_pat.get("confidence", 0.0))
                if _sec_conf >= 0.45 and _sec_sent != 0.0:
                    _sec_base = _base_impact * 0.40  # ikincil %40 etki
                    if _sec_sent > 0:
                        rule_score = min(100.0, rule_score + _sec_sent * _sec_base * vol_boost)
                    else:
                        rule_score = max(0.0, rule_score - abs(_sec_sent) * _sec_base * 0.55)

        try:
            high_last  = float(df["High"].iloc[-1])
            low_last   = float(df["Low"].iloc[-1])
            open_last  = float(df["Open"].iloc[-1])
            ema20_gap_val  = (last_close - ema20) / ema20 * 100.0 if ema20 else 0.0
            ema50_gap_val  = (last_close - ema50) / ema50 * 100.0 if ema50 else 0.0
            range_pct_val  = (high_last - low_last) / last_close * 100.0 if last_close else 0.0
            body_pct_val   = abs(last_close - open_last) / (high_last - low_last) * 100.0 if (high_last - low_last) > 0 else 0.0
        except Exception as _fe:
            logger.debug("Feature calc error for %s: %s", sym, _fe)
            ema20_gap_val = ema50_gap_val = range_pct_val = body_pct_val = 0.0

        # Pre-compute context features needed by ML before the scoring block
        _trend_duration_ml = 0
        _rs_vs_bist100_ml  = 0.0
        try:
            _ema5_s_ml  = df["_ema5"].dropna()
            _ema20_s_ml = df["_ema20"].dropna()
            _dur_ml = 0
            for _vv in reversed((_ema5_s_ml > _ema20_s_ml).values):
                if bool(_vv):
                    _dur_ml += 1
                else:
                    break
            _trend_duration_ml = _dur_ml
        except Exception:
            pass
        try:
            _closes_ml = pd.to_numeric(df["Close"], errors="coerce")
            if len(_closes_ml) >= 6:
                _c5d_ml = float(_closes_ml.iloc[-6])
                if _c5d_ml > 0:
                    _ret5d_ml  = (float(_closes_ml.iloc[-1]) - _c5d_ml) / _c5d_ml * 100.0
                    _bist5d_ml = float(ctx.global_signals.get("bist100_trend_5d", 0.0) or 0.0)
                    _rs_vs_bist100_ml = max(-50.0, min(50.0, _ret5d_ml - _bist5d_ml))
        except Exception:
            pass

        ml_score, ml_feats, ml_explanation = None, {}, []
        if ctx.use_ml and ctx.ml_scorer is not None:
            try:
                df_w = df.resample("W-FRI").agg({
                    "Open": lambda x: x.iloc[0] if len(x) > 0 else np.nan,
                    "High": "max", "Low": "min",
                    "Close": lambda x: x.iloc[-1] if len(x) > 0 else np.nan,
                    "Volume": "sum",
                }).dropna() if isinstance(df.index, pd.DatetimeIndex) else pd.DataFrame()

                _macro_extra = {
                    k: ctx.global_signals.get(k, 0.0)
                    for k in ("bist100_trend_5d", "vix_regime", "usdtry_change_5d", "market_regime")
                }
                _macro_extra["is_short_term_breakout"] = float(bool(ai_vision.get("is_short_term_breakout", False)))
                # Context features: pass computed scanner values so model gets real inputs.
                # Without this, 13+ features default to 0.0 → train/inference skew → ML~0.
                _macro_extra.update({
                    "ema20_gap":              float(ema20_gap_val),
                    "ema50_gap":              float(ema50_gap_val),
                    "range_pct":              float(range_pct_val),
                    "body_pct":               float(body_pct_val),
                    "momentum":               float(ema5 - ema20),
                    "breakout":               float(max(br20, br55)),
                    "trend":                  1.0 if ema5 > ema20 else 0.0,
                    "pattern_score":          float(pat_score),
                    "pattern_formed_bars_ago": float(pat_formed_bars_ago),
                    "pattern_is_stale":       1.0 if pat_is_stale else 0.0,
                    "pattern_type_encoded":   _PATTERN_ENCODING_ML.get((pat_text or "").strip(), 0.0),
                    "profile_encoded":        _PROFILE_ENCODING_ML.get((ctx.params.get("profile_name") or "").strip(), 0.0),
                    "rs_vs_bist100":          _rs_vs_bist100_ml,
                    "trend_duration_days":    float(_trend_duration_ml),
                    "sector_rel_strength_5d": 0.0,
                })
                ml_feats = build_ml_features(df_daily=df, df_weekly=df_w, feature_names=ctx.ml_scorer.feature_names, extra_features=_macro_extra)
                if ctx.strict_ml:
                    cov = _ensure_float(ml_feats.get("_coverage", 1.0), 1.0)
                    if cov < 0.70:
                        raise ValueError("low_cov")
                    _assert_ml_strict(ml_feats, ctx.ml_scorer.feature_names)

                for k, v in ml_feats.items():
                    if k.startswith("_"):
                        continue
                    try:
                        if pd.isna(v) or np.isinf(v):
                            ml_feats[k] = 0.0
                    except (TypeError, ValueError):
                        ml_feats[k] = 0.0

                # F-1: score_with_explanation() SHAP/MDI tabanlı özellik katkısı döndürür.
                _ml_expl = ctx.ml_scorer.score_with_explanation(ml_feats, top_n=5)
                ml_raw = _ml_expl["score"]
                ml_explanation = _ml_expl.get("top_factors", [])

                # A-5: Shadow model A/B testi — %10 trafik, sadece log (prod değişmez).
                try:
                    from app.core.ab_test import maybe_shadow_score
                    _shadow = maybe_shadow_score(ml_feats)
                    if _shadow is not None:
                        import logging as _ablog
                        _ablog.getLogger("PivotRadar.ABTest").debug(
                            "[AB] %s: prod=%.1f shadow=%.1f delta=%.1f",
                            sym, float(ml_raw or 50), _shadow, float(ml_raw or 50) - _shadow
                        )
                except Exception:
                    pass
                if ml_raw is not None:
                    ml_result = float(ml_raw)
                    micro_boost = 0.0
                    try:
                        rsi_u = max(0, min(100, _ensure_float(ml_feats.get("rsi14_x", 50), 50)))
                        micro_boost += rsi_u / 1000.0
                        vol_u = max(0, min(5, _ensure_float(ml_feats.get("vol_ratio20", 1.0), 1.0)))
                        micro_boost += vol_u / 1000.0
                    except Exception:
                        pass
                    ml_score = round(ml_result + micro_boost, 2)
                    if 0 < ml_score <= 1.0:
                        ml_score = round(ml_score * 100.0, 1)
                    if ml_score > 100.0:
                        ml_score = 100.0
                    if rsi_val > _RSI_EXTREME_OVERBOUGHT and ml_score >= 99.0:
                        ml_score = _ML_CAP_EXTREME
                    elif rsi_val > _RSI_OVERBOUGHT and ml_score >= 100.0:
                        ml_score = _ML_CAP_OVERBOUGHT
            except Exception as _ml_err:
                with ctx.processed_count_lock:
                    if ctx.ml_err_counter[0] < 3:
                        import traceback
                        logger.warning("[ML_SCORE_ERR] %s: %s: %s\n%s",
                                       sym, type(_ml_err).__name__, _ml_err, traceback.format_exc())
                        ctx.ml_err_counter[0] += 1
                ml_score = None

        ml_score_for_blend = ml_score
        robust_vol = next(
            (float(df["Volume"].iloc[k]) for k in range(-1, -6, -1)
             if k >= -len(df) and float(df["Volume"].iloc[k]) > 0),
            0.0,
        )

        # ── Extended technical indicators (Phase 2) ───────────────────────────
        w52_position       = 0.5
        dist_52w_high_pct  = 0.0
        dist_52w_low_pct   = 0.0
        volume_zscore      = 0.0
        ret_3d             = 0.0
        ret_acceleration   = 0.0
        rs_vs_bist100      = 0.0
        consecutive_down   = 0
        close_position     = 0.5
        ema_alignment      = 0
        trend_duration     = 0

        try:
            # 52-week position — Y-5: min 60 bar (~3 ay) gerektirir; 20 bar çok az.
            # 252 bar = 1 yıl, ama yeni hisseler için 60 bar minimum kabul edilebilir.
            _highs_52 = pd.to_numeric(df["High"], errors="coerce").tail(252)
            _lows_52  = pd.to_numeric(df["Low"],  errors="coerce").tail(252)
            h52 = float(_highs_52.max()) if len(_highs_52) >= 60 else float("nan")
            l52 = float(_lows_52.min())  if len(_lows_52)  >= 60 else float("nan")
            if np.isfinite(h52) and np.isfinite(l52) and h52 > l52:
                w52_position      = (last_close - l52) / (h52 - l52)
                dist_52w_high_pct = (h52 - last_close) / h52 * 100.0
                dist_52w_low_pct  = (last_close - l52) / l52 * 100.0

            # Volume z-score (20-day rolling)
            _v_series = pd.to_numeric(df["Volume"], errors="coerce").replace(0, np.nan).tail(40)
            _v_roll = _v_series.rolling(20)
            _v_mean = float(_v_roll.mean().iloc[-1])
            _v_std  = float(_v_roll.std().iloc[-1])
            if np.isfinite(_v_mean) and np.isfinite(_v_std) and _v_std > 0:
                volume_zscore = (last_vol - _v_mean) / _v_std

            # 3-day, 5-day and acceleration
            _closes = pd.to_numeric(df["Close"], errors="coerce")
            if len(_closes) >= 4:
                c_now = float(_closes.iloc[-1])
                c_3d  = float(_closes.iloc[-4])
                if c_3d > 0:
                    ret_3d = (c_now - c_3d) / c_3d * 100.0
                ret_1d_val = (c_now - float(_closes.iloc[-2])) / float(_closes.iloc[-2]) * 100.0 if float(_closes.iloc[-2]) > 0 else 0.0
                ret_acceleration = ret_1d_val - (ret_3d / 3.0)
            if len(_closes) >= 6:
                c_5d = float(_closes.iloc[-6])
                if c_5d > 0:
                    _ret_5d = (float(_closes.iloc[-1]) - c_5d) / c_5d * 100.0
                    _bist_5d = ctx.global_signals.get("bist100_trend_5d", 0.0) or 0.0
                    rs_vs_bist100 = max(-50.0, min(50.0, _ret_5d - _bist_5d))

            # Consecutive down days
            _rets = _closes.pct_change().dropna().tail(10)
            _down = 0
            for _r in reversed(_rets.values):
                if _r < 0:
                    _down += 1
                else:
                    break
            consecutive_down = _down

            # Close position in day's range
            _h_last = float(pd.to_numeric(df["High"], errors="coerce").iloc[-1])
            _l_last = float(pd.to_numeric(df["Low"],  errors="coerce").iloc[-1])
            if np.isfinite(_h_last) and np.isfinite(_l_last) and _h_last > _l_last:
                close_position = (last_close - _l_last) / (_h_last - _l_last)

            # EMA alignment score (0-3)
            if last_close > ema5:
                ema_alignment += 1
            if ema5 > ema20:
                ema_alignment += 1
            if ema20 > ema50:
                ema_alignment += 1

            # Trend duration: consecutive days where ema5 > ema20
            _ema5_s  = df["_ema5"].dropna()
            _ema20_s = df["_ema20"].dropna()
            _aligned = (_ema5_s > _ema20_s).values
            _dur = 0
            for _v in reversed(_aligned):
                if bool(_v):
                    _dur += 1
                else:
                    break
            trend_duration = _dur

        except Exception as _ext_err:
            logger.debug("Extended indicators error for %s: %s", sym, _ext_err)

        indicators_bundle = {
            "rsi_val": rsi_val, "trend": bool(ema5 > ema20),
            "atr_pct": atr_percent, "vol_ratio": volume_ratio,
            "volume": robust_vol, "momentum": _sani(ema5 - ema20),
            "breakout": _sani(max(br20, br55)),
            "pattern_name": pat_text, "pattern_score": float(pat_score or 0),
            "pattern_formed_bars_ago": pat_formed_bars_ago,
            "pattern_is_stale": pat_is_stale,
            "secondary_pattern_name": ((ai_vision or {}).get("secondary_pattern") or {}).get("detected_type") or "",
            "close": last_close,
            # Extended indicators
            "w52_position":         _sani(w52_position, 0.5),
            "dist_from_52w_high":   _sani(dist_52w_high_pct, 0.0),
            "dist_from_52w_low":    _sani(dist_52w_low_pct, 0.0),
            "volume_zscore":        _sani(volume_zscore, 0.0),
            "ret_3d":               _sani(ret_3d, 0.0),
            "ret_acceleration":     _sani(ret_acceleration, 0.0),
            "consecutive_down_days": int(consecutive_down),
            "close_position":       _sani(close_position, 0.5),
            "ema_alignment_score":  int(ema_alignment),
            "trend_duration_days":  int(trend_duration),
            # Global macro signals
            "bist100_trend_5d":     _sani(ctx.global_signals.get("bist100_trend_5d", 0.0)),
            "vix_regime":           int(ctx.global_signals.get("vix_regime", 0)),
            "usdtry_change_5d":     _sani(ctx.global_signals.get("usdtry_change_5d", 0.0)),
            "market_regime":        int(ctx.global_signals.get("market_regime", 0)),
            "rs_vs_bist100":        _sani(rs_vs_bist100, 0.0),
            "sector_rel_strength_5d": 0.0,  # filled below after sector lookup
        }

        # Sector-relative strength
        try:
            from app.features.market_data.global_signals import get_sector_rel_strength
            from app.features.scanner.sector_mapping import get_sector as _get_sector
            _sector_key = _get_sector(sym)
            indicators_bundle["sector_rel_strength_5d"] = get_sector_rel_strength(
                _sector_key, ctx.global_signals
            )
        except Exception:
            pass

        _all_profiles = [
            "Güvenli Liman", "Agresif Atak", "Dönüş Uzmanı",
            "Trend Avcısı", "Değer Kaşifi", "Anlık Fırsatçı", "Kırılım Dedektörü",
        ]
        strategy_snapshot = {}
        _bundle_ref = bundle if "bundle" in dir() else None

        # V9b: Her profil için profile_encoded ile ayrı ML skoru hesapla.
        # Model bu feature'ı henüz bilmiyorsa eski ml_score_for_blend kullanılır (backward compat).
        try:
            from app.features.scoring.ml.constants import PROFILE_ENCODING as _PENC
        except Exception:
            _PENC = {}

        _scorer_is_registry = hasattr(ctx.ml_scorer, "_base")

        for prof in _all_profiles:
            # Profil bazlı ML skoru
            prof_ml_score = ml_score_for_blend
            if ml_feats and ctx.ml_scorer is not None:
                try:
                    if _scorer_is_registry:
                        # PerProfileMLRegistry: per-profil model + isotonic kalibrasyon dahil
                        _prof_raw = float(ctx.ml_scorer.score(ml_feats, profile_name=prof))
                    else:
                        # Fallback: global model, profile_encoded ile re-score
                        _pf = dict(ml_feats)
                        _pf["profile_encoded"] = _PENC.get(prof, 0.0) if _PENC else 0.0
                        _prof_raw = float(ctx.ml_scorer.score(_pf))
                    if 0 < _prof_raw <= 1.0:
                        _prof_raw = round(_prof_raw * 100.0, 1)
                    if _prof_raw > 100.0:
                        _prof_raw = 100.0
                    prof_ml_score = round(_prof_raw, 2)
                except Exception:
                    prof_ml_score = ml_score_for_blend  # fallback

            v_prof = UnifiedPRISM.evaluate(
                indicators=indicators_bundle, ml_score=prof_ml_score,
                profile_name=prof, symbol=sym, bundle=_bundle_ref,
            )
            strategy_snapshot[prof] = {
                "qrs": v_prof["qrs"], "target_price": v_prof["target_price"],
                "stop_price": v_prof.get("stop_price"), "risk_reward": v_prof.get("risk_reward"),
                "direction": v_prof["direction"], "predicted_days": v_prof["predicted_days"],
                "label": v_prof["quality_label"], "reasons": v_prof.get("reasons", []),
                "ml_score": prof_ml_score,  # profil bazlı ml skoru strategy_snapshot'a da kaydet
            }

        verdict = strategy_snapshot.get(ctx.p_name) or UnifiedPRISM.evaluate(
            indicators=indicators_bundle, ml_score=ml_score_for_blend,
            profile_name=ctx.p_name, symbol=sym, bundle=_bundle_ref,
        )

        strategy_snapshot_json = json.dumps(strategy_snapshot, separators=(",", ":")) if strategy_snapshot else None
        yzdsh_score      = round(float(verdict["qrs"]), 2)
        target_direction = verdict["direction"]
        target_price_v   = verdict["target_price"]
        stop_price_v       = verdict.get("stop_price")
        risk_reward_v      = verdict.get("risk_reward")
        position_size_pct_v = verdict.get("position_size_pct")
        predicted_days_v   = verdict["predicted_days"]
        veto_reasons     = verdict.get("reasons", [])

        if ml_score is not None and (ml_score > 90 or yzdsh_score == 50.0):
            logger.debug("[SCORE_DEBUG] %s: ML_RAW=%.1f QRS=%.1f RSI=%.1f",
                         sym, ml_score, yzdsh_score, rsi_val)

        # ── Seçim önyargısı düzeltmesi ────────────────────────────────────────
        # Tüm profillerin QRS eşiğinin altında kalan stokları ~%8 oranında
        # eğitim veri setine dahil et. Bu sayede ML modeli "reddedilen"
        # sinyalleri de öğrenir → dead zone daralır, kalibrasyon iyileşir.
        # _final_profile_name: ctx.p_name yerine yerel değişken — ctx paylaşımlı (thread-safety)
        _final_profile_name = ctx.p_name
        import random as _rnd
        _all_qrs = [strategy_snapshot[p]["qrs"] for p in strategy_snapshot if p in strategy_snapshot]
        _max_qrs = max(_all_qrs) if _all_qrs else 0
        _is_rejected = _max_qrs < 50 and ml_score is not None and ml_score > 20
        if _is_rejected and _rnd.random() < 0.08:
            # En iyi profili bul, onun adıyla kaydet (kalibrasyon hangi isotonic'i güncelleyeceğini bilir)
            _best_prof = max(strategy_snapshot, key=lambda p: strategy_snapshot[p]["qrs"]) if strategy_snapshot else ctx.p_name
            # quality_label="TRAINING_SAMPLE" ile işaretle — filtreleme için
            yzdsh_score         = round(_max_qrs, 2)
            target_direction    = strategy_snapshot.get(_best_prof, {}).get("direction", "neutral")
            target_price_v      = strategy_snapshot.get(_best_prof, {}).get("target_price")
            stop_price_v        = strategy_snapshot.get(_best_prof, {}).get("stop_price")
            predicted_days_v    = strategy_snapshot.get(_best_prof, {}).get("predicted_days", 10)
            veto_reasons        = ["training_sample"]
            _final_profile_name = _best_prof  # ctx.p_name'e yazma — diğer thread'leri bozar
            logger.debug("[BIAS_FIX] %s reddedilmiş stok örneklendi: ml=%.1f max_qrs=%.1f prof=%s",
                         sym, ml_score, _max_qrs, _best_prof)

        last_date    = df.index[-1]
        _live_ts_str = df.attrs.get("live_ts") if hasattr(df, "attrs") else None
        timestamp_str = _live_ts_str if _live_ts_str else (
            last_date.isoformat() if hasattr(last_date, "isoformat") else str(last_date)
        )

        it_latest = {
            "symbol": sym, "name": get_company_name(sym),
            "sector": get_sector(sym),
            "last": last_close, "close": last_close,
            "change": _sani(last_close - prev_close), "change_pct": _sani(change_pct),
            "timestamp": timestamp_str,
            "qrs": yzdsh_score, "yzdsh": yzdsh_score,
            "strategy_snapshot": strategy_snapshot_json,
            "rule_score": rule_score, "ml_score": ml_score, "rsi": rsi_val,
            "volume": robust_vol if "Volume" in df.columns else (
                float(df["Hacim"].iloc[-1]) if "Hacim" in df.columns else 0.0
            ),
            "volume_ratio": volume_ratio,
            "pattern_name": pat_text,
            "direction": target_direction, "target_price": target_price_v,
            "stop_price": stop_price_v, "risk_reward": risk_reward_v, "position_size_pct": position_size_pct_v,
            "predicted_days": predicted_days_v,
            "ema20_gap": _sani(ema20_gap_val), "ema50_gap": _sani(ema50_gap_val),
            "range_pct": _sani(range_pct_val), "body_pct": _sani(body_pct_val),
            "ohlc_meta": ohlc_meta, "profile_name": _final_profile_name,
            "veto_reasons": veto_reasons,
            # Extended indicators for persistence
            "w52_position":          indicators_bundle.get("w52_position", 0.5),
            "dist_from_52w_high":    indicators_bundle.get("dist_from_52w_high", 0.0),
            "dist_from_52w_low":     indicators_bundle.get("dist_from_52w_low", 0.0),
            "volume_zscore":         indicators_bundle.get("volume_zscore", 0.0),
            "ret_3d":                indicators_bundle.get("ret_3d", 0.0),
            "ret_acceleration":      indicators_bundle.get("ret_acceleration", 0.0),
            "consecutive_down_days": indicators_bundle.get("consecutive_down_days", 0),
            "close_position":        indicators_bundle.get("close_position", 0.5),
            "ema_alignment_score":   indicators_bundle.get("ema_alignment_score", 0),
            "trend_duration_days":   indicators_bundle.get("trend_duration_days", 0),
            "bist100_trend_5d":      indicators_bundle.get("bist100_trend_5d", 0.0),
            "vix_regime":            indicators_bundle.get("vix_regime", 0),
            "usdtry_change_5d":      indicators_bundle.get("usdtry_change_5d", 0.0),
            "market_regime":         indicators_bundle.get("market_regime", 0),
            "rs_vs_bist100":         indicators_bundle.get("rs_vs_bist100", 0.0),
            "sector_rel_strength_5d": indicators_bundle.get("sector_rel_strength_5d", 0.0),
            # ML retraining features — training verisine doğru değerlerin yazılması için
            "momentum":     indicators_bundle.get("momentum", 0.0),
            "breakout":     indicators_bundle.get("breakout", 0.0),
            "pattern_score": indicators_bundle.get("pattern_score", 0),
            "ml_explanation":        ml_explanation,
            # V9: raw_features JSON — BB/MACD/ADX/Stoch/Squeeze
            # Training zamanında model bu feature'ları buradan okur.
            # Sadece model feature'ları değil, future extensibility için tüm teknik göstergeler.
            "secondary_pattern": ai_vision.get("secondary_pattern"),  # ikincil geometrik formasyon
            # Grafik-Liste tutarlılığı: tüm detect_patterns_validated() çıktısı (Plotly shapes dahil)
            # SymbolDataCache.pattern_json'a yazılır; chart engine bunu okuyarak yeniden hesaplamaz.
            "pattern_json": (lambda _av: json.dumps(
                {k: v for k, v in _av.items() if k != "debug"},
                default=str, separators=(",", ":")
            ) if _av else None)(ai_vision),
            "ml_feats_json": json.dumps(
                {
                    **{k: round(float(ml_feats[k]), 6)
                       for k in ("bb_width_pct", "macd_hist", "adx14", "stoch_k", "squeeze_kc",
                                 "macd_line", "macd_signal", "stoch_d", "mfi14",
                                 "plus_di", "minus_di", "obv",
                                 "triangle_score", "vcp_score", "sr_density")
                       if k in ml_feats and ml_feats[k] is not None},
                    # Pattern features — ML model retraining için hazır
                    "pattern_formed_bars_ago":  float(pat_formed_bars_ago),
                    "pattern_score_norm":        float(pat_score) / 100.0,
                    "pattern_sentiment":         float(_sentiment) if pat_text else 0.0,
                    "pattern_is_bullish":        float(1.0 if (_sentiment > 0 and pat_text) else 0.0),
                    "pattern_is_bearish":        float(1.0 if (_sentiment < 0 and pat_text) else 0.0),
                    "pattern_is_stb":            float(1.0 if (ai_vision or {}).get("is_short_term_breakout") else 0.0),
                    "secondary_pattern_name":    ((ai_vision or {}).get("secondary_pattern") or {}).get("detected_type") or "",
                    "secondary_pattern_sentiment": float(
                        PATTERN_SENTIMENT.get(
                            ((ai_vision or {}).get("secondary_pattern") or {}).get("detected_type") or "", 0.0
                        )
                    ),
                },
                separators=(",", ":")
            ) if ml_feats else None,
        }

        with ctx.processed_count_lock:
            ctx.local_processed_count[0] += 1
            curr = ctx.local_processed_count[0]
            if ctx.progress_cb:
                now_ts = time.time()
                if curr % 5 == 0 or (now_ts - ctx.last_progress_ts[0]) >= 3.0:
                    ctx.last_progress_ts[0] = now_ts
                    pct_val = int((curr / max(ctx.total_symbols, 1)) * 100)
                    if pct_val >= 85:    stg = "GRAFİK"
                    elif pct_val >= 60:  stg = "YAPAY ZEKA"
                    elif pct_val >= 30:  stg = "ANALİZ"
                    elif pct_val >= 10:  stg = "VERİ"
                    else:                stg = "KAYNAK"
                    ctx.progress_cb(stg, pct_val, f"{stg} ({curr}/{ctx.total_symbols}): {sym}")

        history_rows = []
        lookback = min(20, len(df))
        for j in range(1, lookback + 1):
            idx = -j
            row_raw = df.iloc[idx]
            ts_row  = df.index[idx]
            c_row   = float(row_raw["Close"])
            a_row   = float(row_raw["_atr"]) if pd.notna(row_raw["_atr"]) else 0.0
            history_rows.append({
                "symbol": sym, "timestamp": ts_row.isoformat(), "close": c_row,
                "change_pct": it_latest["change_pct"] if j == 1 else (
                    _sani(((c_row - df.iloc[idx - 1]["Close"]) / df.iloc[idx - 1]["Close"] * 100.0)
                          if (idx - 1 >= -len(df)) else 0.0)
                ),
                "rsi": _sani(row_raw["_rsi"], 50.0),
                "ema20": _sani(row_raw["_ema20"]), "ema50": _sani(row_raw["_ema50"]),
                "atr_percent": _sani(a_row / c_row * 100.0 if c_row else 2.0),
                "volume": float(df.iloc[idx]["Volume"]) if "Volume" in df.columns else (
                    float(df.iloc[idx]["Hacim"]) if "Hacim" in df.columns else 0.0
                ),
                "volume_ratio": _sani(row_raw["_vol_ratio"]),
                "trend": bool(row_raw["_ema5"] > row_raw["_ema20"]),
                "breakout": _sani(max(
                    1.0 if (pd.notna(row_raw["_h20"]) and c_row >= row_raw["_h20"]) else 0.0,
                    1.0 if (pd.notna(row_raw["_h55"]) and c_row >= row_raw["_h55"]) else 0.0,
                )),
                "momentum": _sani(row_raw["_ema5"] - row_raw["_ema20"]),
                "ml_score": it_latest.get("ml_score") if j == 1 else None,
                "yzdsh": it_latest.get("yzdsh") if j == 1 else None,
                "pattern_name": it_latest.get("pattern_name") if j == 1 else None,
            })

        return {"latest": it_latest, "history": history_rows}

    except Exception as _pe:
        if sym in (ctx.candidate_symbols[:5] + ctx.candidate_symbols[-5:]):
            logger.warning("[SKIP] %s: %s: %s", sym, type(_pe).__name__, _pe)
        else:
            logger.debug("[SKIP] %s: %s: %s", sym, type(_pe).__name__, _pe)
        return None


def run_pipeline(
    max_symbols: int = 1000,
    profile_name: str = "Güvenli Liman",
    expert_mode: bool = False,
    prefilter_top_n: Optional[int] = None,
    vol_min: Optional[float] = None,
    rsi_min: Optional[float] = None,
    overrides: Optional[dict] = None,
    progress_cb: Optional[Callable[[str, int, str], None]] = None,
    stop_check: Optional[Callable[[], bool]] = None,
    max_threads: Optional[int] = None,
    is_background: bool = False,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Ana analiz akışı.
    """
    # Create params dict for internal consistency
    params = {
        "max_symbols": max_symbols,
        "profile_name": profile_name,
        "expert_mode": expert_mode,
        "prefilter_top_n": prefilter_top_n,
        "vol_min": vol_min,
        "rsi_min": rsi_min,
        "overrides": overrides or {},
        "max_threads": max_threads,
    }
    start_time = time.time()

    # Merge with Global System Settings (Admin Panel Overrides)
    try:
        with SessionLocal() as db:
            global_cfg = get_system_setting(db, "scanner_config", {})
            if global_cfg.get("max_symbols") and params.get("max_symbols") is None:
                params["max_symbols"] = global_cfg["max_symbols"]
            if "use_ml" not in params and "ml_enabled" in global_cfg:
                params["use_ml"] = global_cfg["ml_enabled"]
            if "use_patterns" not in params and "pattern_enabled" in global_cfg:
                params["use_patterns"] = global_cfg["pattern_enabled"]
    except Exception as se:
        logger.warning(f"Global settings fetch failed (Engine): {se}")

    # Parametreler
    p_name = params.get("profile_name", params.get("default_profile", "DENGELI"))
    period_days = _parse_int_param(params, "period_days", 200)  # legacy
    # Scan sırasında "mutlaka internet" ve "1y/6m tarihçe" kontrolü
    force_online = bool(params.get("force_online", False))
    history_days = _parse_int_param(params, "history_days", 365)
    cache_ttl_hours = _parse_float_param(params, "cache_ttl_hours", 22.0)
    strict_ml = bool(params.get("strict_ml", False))  # False: ML çalışsın, coverage düşse bile
    use_ml = bool(params.get("use_ml", True))
    use_patterns = bool(params.get("use_patterns", True))

    # Universe fetching (10/10 Maturity: Autonomous data source)
    from app.features.market_data.data.universe_bist import load_universe
    try:
        universe = load_universe()
    except Exception as e:
        logger.error(f"Universe fetch failed: {e}")
        return pd.DataFrame(), {"error": f"Universe fetch failed: {e}"}, []

    if universe is None or universe.empty:
        return pd.DataFrame(), {"error": "Universe empty"}, []

    c_sym = next((c for c in universe.columns if c.lower() in ("symbol", "sembol")), None)
    if not c_sym:
        return pd.DataFrame(), {"error": "No symbol column in universe"}, []

    candidate_symbols = universe[c_sym].dropna().astype(str).unique().tolist()
    candidate_symbols.sort()

    total_symbols = len(candidate_symbols)
    logger.info(f"Analiz başlıyor: {total_symbols} sembol. Parametreler: {params}")

    # Debug controls
    debug_scoring = bool(params.get("debug_scoring", False)) or _env_bool("PIVOTRADAR_DEBUG_SCORING", False)
    debug_n = int(os.environ.get("PIVOTRADAR_DEBUG_N", "6"))
    debug_top_n = int(os.environ.get("PIVOTRADAR_DEBUG_TOP_N", "12"))
    if debug_scoring:
        logger.info("[DEBUG_SCORING] enabled (debug_n=%d, debug_top_n=%d)", debug_n, debug_top_n)

    logger.info("[SCAN_ENGINE] Pipeline starting (use_ml=%s)", use_ml)

    # ML Model — ML modeli her zaman yüklenmeli (P0: modelin yüklenmemesi kabul edilemez)
    ml_scorer: Optional[MLScorer] = None
    if use_ml:
        ml_load_errors = []
        # Attempt 1: Standard model selection
        try:
            ml_path = _pick_latest_ml_model()
            if ml_path:
                ml_scorer = MLScorer(str(ml_path))
                logger.info("[ML_ENGINE] Loaded successfully: %s", ml_path.name)
        except Exception as e:
            ml_load_errors.append(f"primary: {e}")

        # Attempt 2: Fallback paths — bundled ml_base.joblib
        if ml_scorer is None:
            _fallback_paths = [
                Path(settings.PROJECT_ROOT) / "models" / "ml_base.joblib",
                Path(settings.PROJECT_ROOT) / "assets" / "models" / "ml_base.joblib",
                Path("/app/models/ml_base.joblib"),
                Path("/app/assets/models/ml_base.joblib"),
            ]
            for fp in _fallback_paths:
                if fp.exists():
                    try:
                        ml_scorer = MLScorer(str(fp))
                        logger.info("[ML_ENGINE] FALLBACK loaded: %s", fp.name)
                        break
                    except Exception as e2:
                        ml_load_errors.append(f"fallback({fp.name}): {e2}")

        if ml_scorer is None:
            logger.critical("[ML_ENGINE] ALL MODEL LOAD ATTEMPTS FAILED: %s", ml_load_errors)
            # Pipeline devam eder ama sadece rule-based skor üretir
            use_ml = False
        else:
            # Base MLScorer'ı per-profil registry ile sar
            try:
                from app.features.scoring.ml.ai_score import PerProfileMLRegistry
                ml_scorer = PerProfileMLRegistry(ml_scorer)
                logger.info("[ML_ENGINE] PerProfileMLRegistry aktif.")
            except Exception as _reg_err:
                logger.warning("[ML_ENGINE] PerProfileMLRegistry kurulamadı: %s", _reg_err)

    # Loop state
    processed_count = 0
    skipped_count = 0
    results: list[Dict[str, Any]] = []

    fetch_errors = {"delisted": 0, "404": 0, "other": 0}

    processed_count_lock = threading.Lock()
    local_processed_count = [0]
    _ml_err_counter = [0]  # thread-safe via processed_count_lock

    # Singleton Data Service (V19 Optimization)
    data_svc = MarketDataService()

    # --- Phase 1: Bulk OHLC Fetch (TURBO MODE) ---
    logger.info("[SCAN_ENGINE] Prefetching OHLC for %d symbols...", total_symbols)
    bulk_cache = {}

    # 150'lik gruplar halinde toplu çek (yfinance rate limit ve hız için optimal)
    for i in range(0, total_symbols, CHUNK_SIZE):
        # Check stop signal between chunks
        if stop_check and stop_check():
            logger.info("Bulk prefetch stopped by signal.")
            break

        chunk = candidate_symbols[i : i + CHUNK_SIZE]
        if progress_cb:
            pct = int((i / max(total_symbols, 1)) * 40)  # bulk fetch = 0-40%
            progress_cb("KAYNAK", pct, f"Market verileri çekiliyor ({i}/{total_symbols})")
        try:
            period_str = "2y" if history_days > 250 else "1y"
            # Per-chunk timeout: if yfinance hangs, skip chunk and continue
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _bulk_exec:
                _fut = _bulk_exec.submit(data_svc.fetch_bulk_ohlc, chunk, period_str)
                try:
                    fetched = _fut.result(timeout=30)
                    bulk_cache.update(fetched)
                except concurrent.futures.TimeoutError:
                    logger.warning("[BULK] Chunk %d-%d timeout (30s) — atlanıyor.", i, i + len(chunk))
        except Exception as e:
            logger.debug("Bulk chunk error: %s", e)

    logger.info("[SCAN_ENGINE] Prefetch COMPLETED. Cached: %d", len(bulk_cache))

    # Fetch global macro signals once before processing symbols
    _global_signals: Dict[str, Any] = {}
    try:
        from app.features.market_data.global_signals import get_global_signals
        _global_signals = get_global_signals()
        _bist_val = _global_signals.get("bist100_trend_5d", 0.0)
        _vix_val  = _global_signals.get("vix_regime", 0)
        _usd_val  = _global_signals.get("usdtry_change_5d", 0.0)
        _src = "stale" if (_bist_val == 0.0 and _vix_val == 0 and _usd_val == 0.0) else "fresh"
        logger.info("[SCAN_ENGINE] Global signals (source=%s): vix_regime=%s bist100_5d=%.2f usdtry_5d=%.2f",
                    _src, _vix_val, _bist_val, _usd_val)
    except Exception as _gs_err:
        logger.warning("[SCAN_ENGINE] Global signals fetch failed: %s — using defaults.", _gs_err)

    ctx = _ScanContext(
        bulk_cache=bulk_cache, data_svc=data_svc, ml_scorer=ml_scorer,
        params=params, p_name=p_name, candidate_symbols=candidate_symbols,
        total_symbols=total_symbols, stop_check=stop_check, progress_cb=progress_cb,
        use_ml=use_ml, use_patterns=use_patterns, strict_ml=strict_ml,
        debug_scoring=debug_scoring, fetch_errors=fetch_errors,
        processed_count_lock=processed_count_lock,
        global_signals=_global_signals,
        local_processed_count=local_processed_count,
        ml_err_counter=_ml_err_counter,
    )
    _worker = functools.partial(_process_symbol, ctx=ctx)

    import multiprocessing as _mp
    _auto_workers = min(32, (_mp.cpu_count() or 4) * 2)
    max_workers = int(params.get("max_threads") or os.environ.get("PR_THREADS", str(_auto_workers)))

    batch_history: list = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_sym = {executor.submit(_worker, (i, sym)): sym for i, sym in enumerate(candidate_symbols)}
        for future in concurrent.futures.as_completed(future_to_sym):
            if stop_check and stop_check():
                for f in future_to_sym:
                    f.cancel()
                logger.info("Scan stopped by stop_check signal — remaining futures cancelled.")
                break
            try:
                res = future.result(timeout=_FUTURE_TIMEOUT)
            except concurrent.futures.TimeoutError:
                sym = future_to_sym[future]
                logger.warning("[TIMEOUT] %s — %ss aşımı, atlanıyor.", sym, _FUTURE_TIMEOUT)
                res = None
            except Exception as _fe:
                sym = future_to_sym[future]
                logger.debug("[FUTURE_ERR] %s: %s", sym, _fe)
                res = None
            if res:
                results.append(res["latest"])
                if "history" in res:
                    batch_history.extend(res["history"])
            processed_count += 1

    logger.info("[SCAN_ENGINE] Pipeline COMPLETED. Produced %d results.", len(results))

    # Formasyon özeti — hangi hissede ne tespit edildi, UI'a ne yazıldı
    try:
        _scan_pat = [
            (r["symbol"], r.get("pattern_name") or "", r.get("secondary_pattern_name") or "",
             int(r.get("pattern_score") or 0), float(r.get("yzdsh") or r.get("qrs_score") or 0))
            for r in results
            if r.get("pattern_name") and r["pattern_name"] not in ("Formasyon Yok", "NONE", "")
        ]
        _scan_sec = [(sym, p, s) for sym, p, s, sc, q in _scan_pat if s and s not in ("Formasyon Yok", "NONE", "")]
        logger.info(
            "[SCAN] ÖZET: %d hisse tarandı | formasyon=%d | ikincil=%d",
            len(results), len(_scan_pat), len(_scan_sec)
        )
        if _scan_pat:
            top20 = sorted(_scan_pat, key=lambda x: x[4], reverse=True)[:20]
            logger.info("[SCAN] ── DB'ye yazılan formasyonlar (QRS sırası) ──")
            for sym, p, s, sc, q in top20:
                sec = f"  +[{s}]" if s and s not in ("Formasyon Yok", "NONE", "") else ""
                logger.info("  %-8s | %-28s | PUAN=%-3d | QRS=%.0f%s", sym, p, sc, q, sec)
        if _scan_sec:
            logger.info("[SCAN] ── İkincil formasyonlar ──")
            for sym, p, s in _scan_sec:
                logger.info("  %-8s | BİRİNCİL=%-22s | İKİNCİL=%s", sym, p, s)
    except Exception:
        pass

    duration = time.time() - start_time

    # Source data time (latest timestamp)
    source_data_time = None
    if results:
        try:
            ts_list = [r.get("timestamp") for r in results if r.get("timestamp")]
            if ts_list:
                source_data_time = max(ts_list)
        except Exception:
            source_data_time = None

    _ml_trained_at = None
    if ml_scorer is not None:
        try:
            _ml_trained_at = ml_scorer.meta.get("created")
        except Exception:
            pass

    meta: Dict[str, Any] = {
        "processed": processed_count,
        "total": total_symbols,
        "results_count": len(results),
        "skipped": skipped_count,
        "duration": round(duration, 2),
        "fetch_error_stats": fetch_errors,
        "source_data_time": source_data_time,
        "ml_active": bool(ml_scorer is not None),
        "ml_trained_at": _ml_trained_at,
        "ml_warning": None if (ml_scorer is not None or not use_ml) else "ML_MODEL_UNAVAILABLE: Skorlar kural motoru ile üretildi. Model dosyası eksik veya bozuk olabilir.",
    }

    logger.info(f"Analiz tamamlandı. Süre: {duration:.1f}s. Sonuç: {len(results)}")

    df_res = pd.DataFrame(results)

    # ── Strategy Filtering (vol_min, rsi_min, price_max) ──
    try:
        vol_min   = _parse_float_param(params, "vol_min", 0.0)
        rsi_min   = _parse_float_param(params, "rsi_min", 0.0)
        price_max = _parse_float_param(params, "price_max", 50000.0) # Default outlier cap

        if not df_res.empty:
            if vol_min > 0:
                df_res = df_res[df_res["volume"] >= vol_min]
            if rsi_min > 0:
                df_res = df_res[df_res["rsi"] >= rsi_min]
            if price_max > 0:
                df_res = df_res[df_res["close"] <= price_max]
    except Exception as e:
        logger.warning(f"Filter error in pipeline: {e}")

    # Apply UI limits AFTER scoring (don't slice alphabetically).
    try:
        max_symbols = int(params.get("max_symbols") or 0)
    except Exception:
        max_symbols = 0
    try:
        prefilter_top_n = int(params.get("prefilter_top_n") or 0)
    except Exception:
        prefilter_top_n = 0
    if not df_res.empty:
        sort_cols = [c for c in ["yzdsh", "rule_score", "ml_score"] if c in df_res.columns]

        # --- [FAZ 6] Portfolio Risk: Sector Diversity Guard ---
        try:
            from app.features.market_data.data.universe_bist import get_sector
            sector_counts = {}

            # Sort by score first to identify leaders
            if sort_cols:
                df_res = df_res.sort_values(by=sort_cols, ascending=[False] * len(sort_cols), kind="mergesort")

            def apply_sector_penalty(row):
                symbol = row["symbol"]
                sector = get_sector(symbol)
                count = sector_counts.get(sector, 0)
                sector_counts[sector] = count + 1

                # If we already have 3 from this sector, penalize the score
                if count >= 3:
                    penalty = 15.0 # -15 points for concentration risk
                    return max(0.0, row["yzdsh"] - penalty)
                return row["yzdsh"]

            if "yzdsh" in df_res.columns:
                df_res["yzdsh"] = df_res.apply(apply_sector_penalty, axis=1)
                # Re-sort after penalty
                if sort_cols:
                    df_res = df_res.sort_values(by=sort_cols, ascending=[False] * len(sort_cols), kind="mergesort")
        except Exception as e:
            logger.warning(f"Sector diversity guard error: {e}")

        # Final sort (if not already handled)
        if sort_cols and "yzdsh" not in df_res.columns:
            df_res = df_res.sort_values(by=sort_cols, ascending=[False] * len(sort_cols), kind="mergesort")

        # --- Global Score Calibration (V18) [REMOVED AS PER USER REQUEST] ---
        # We no longer scale yzdsh to hit 92.5. Real scores are now prioritized.


        # Collapse diagnostics
        try:
             # Repopulate ML diagnostics after scaling (ML scores aren't scaled, only YZDSH)
            if "ml_score" in df_res.columns:
                ml_std = float(df_res["ml_score"].std(ddof=0))
                ml_unique = int(df_res["ml_score"].nunique(dropna=True))
                if np.isfinite(ml_std) and ml_std < 1e-6:
                    logger.warning(
                        "[ML_COLLAPSE] ml_score std~0 (std=%s, unique=%d). Check feature schema/values.",
                        _fmt_float(ml_std),
                        ml_unique,
                    )
                if debug_scoring:
                    yz_std = float(df_res["yzdsh"].std(ddof=0)) if "yzdsh" in df_res.columns else float("nan")
                    logger.info("[SCORE_STATS] ml_std=%s (unique=%d) | yzdsh_std=%s | n=%d", _fmt_float(ml_std), ml_unique, _fmt_float(yz_std), int(len(df_res)))
        except Exception:
            pass

        if prefilter_top_n and prefilter_top_n > 0 and len(df_res) > prefilter_top_n:
            df_res = df_res.head(prefilter_top_n).reset_index(drop=True)

        if max_symbols and max_symbols > 0 and len(df_res) > max_symbols:
            df_res = df_res.head(max_symbols).reset_index(drop=True)

    meta["results_count"] = int(len(df_res))

    # Debug top-N summary (post-sort & post-limit)
    if debug_scoring and not df_res.empty:
        try:
            view = df_res.head(min(debug_top_n, len(df_res)))[["symbol", "yzdsh", "rule_score", "ml_score"]].copy()
            rows = []
            for _, r in view.iterrows():
                rows.append(
                    f"{r['symbol']}: yzdsh={_fmt_float(r['yzdsh'])} rule={_fmt_float(r['rule_score'])} ml={_fmt_float(r['ml_score'])}"
                )
            logger.info("[TOP_%d] %s", min(debug_top_n, len(df_res)), " | ".join(rows))
        except Exception:
            pass

    return df_res, meta, batch_history
