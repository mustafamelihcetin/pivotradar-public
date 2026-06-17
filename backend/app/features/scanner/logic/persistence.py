import uuid
import datetime
import math
import json
import pandas as pd
from app.core.database import SessionLocal
from app.features.scanner.models import ScanScore
from app.core.time_utils import now_utc
from app.core.config_profiles import PROFILE_DURATION_DAYS, normalize_profile
from app.features.scoring.ml.constants import FEATURE_BOUNDS, FEATURE_SCHEMA_VERSION

_PROFILE_DAY_FALLBACK_MIN = {k: v[0] for k, v in PROFILE_DURATION_DAYS.items()}
_PROFILE_DAY_FALLBACK_MAX = {k: v[1] for k, v in PROFILE_DURATION_DAYS.items()}


def _bounded(key: str, value, default=None):
    """FEATURE_BOUNDS'a göre değeri kırpar. None / NaN → default döner."""
    if value is None:
        return default
    try:
        f = float(value)
        if not math.isfinite(f):
            return default
        bounds = FEATURE_BOUNDS.get(key)
        if bounds:
            f = max(bounds[0], min(bounds[1], f))
        return f
    except (TypeError, ValueError):
        return default


def _fallback_predicted_days(profile_name: str, atr: float) -> int:
    pn = normalize_profile(profile_name)
    p_min = _PROFILE_DAY_FALLBACK_MIN.get(pn, 5)
    p_max = _PROFILE_DAY_FALLBACK_MAX.get(pn, 45)
    raw = max(5, int(round(atr * 2.5))) if atr else 14
    return max(p_min, min(p_max, raw))

def persist_scan_results(df_res: pd.DataFrame, payload: dict, session_id: str = None) -> None:
    session_id = session_id or str(uuid.uuid4())
    main_profile = payload.get("profile_name", "Güvenli Liman")
    today        = datetime.date.today()
    rows = []

    for rec in df_res.to_dict("records"):
        # Base indicators shared by all profiles for this symbol/scan
        close = rec.get("close")      if rec.get("close")      is not None else 0.0
        atr   = rec.get("atr_percent") if rec.get("atr_percent") is not None else 2.0
        scan_date_str = rec.get("timestamp") or str(today)
        try:
            scan_date = datetime.date.fromisoformat(scan_date_str[:10])
        except Exception:
            scan_date = today

        # Check if we have multi-profile results in the snapshot
        snapshot_raw = rec.get("strategy_snapshot")
        profiles_to_save = {} # name -> data
        
        if snapshot_raw:
            try:
                if isinstance(snapshot_raw, str):
                    snapshot = json.loads(snapshot_raw)
                else:
                    snapshot = snapshot_raw
                
                if isinstance(snapshot, dict):
                    profiles_to_save = snapshot
            except Exception:
                pass

        # If no snapshot, fallback to the single main profile
        if not profiles_to_save:
            profiles_to_save = {
                main_profile: {
                    "qrs": rec.get("yzdsh") or 0.0,
                    "target_price": rec.get("target_price"),
                    "stop_price": rec.get("stop_price"),
                    "risk_reward": rec.get("risk_reward"),
                    "direction": rec.get("target_direction") or ("bullish" if (rec.get("yzdsh") or 0) >= 65 else "neutral"),
                    "predicted_days": rec.get("predicted_days"),
                    "reasons": rec.get("veto_reasons") or []
                }
            }

        # Create a separate record for each profile
        for p_name, p_data in profiles_to_save.items():
            qrs = p_data.get("qrs", 0.0)
            direction = p_data.get("direction") or "neutral"
            
            # İkincil profil neutral + düşük güven → DB'ye kaydetme (yer tasarrufu)
            # Sadece ana profil veya QRS>=70 olanlar kaydedilir
            if p_name != main_profile and direction == "neutral" and qrs < 70:
                continue

            def _fi(key, default=None):
                v = rec.get(key)
                if v is None:
                    return default
                try:
                    f = float(v)
                    return f if math.isfinite(f) else default
                except (TypeError, ValueError):
                    return default

            def _ii(key, default=None):
                v = rec.get(key)
                if v is None:
                    return default
                try:
                    return int(v)
                except (TypeError, ValueError):
                    return default

            rows.append(ScanScore(
                symbol          = str(rec.get("symbol", "")).upper(),
                scan_date       = scan_date,
                scanned_at      = now_utc().replace(tzinfo=None),
                profile_name    = p_name,
                qrs_score       = float(qrs) if math.isfinite(qrs) else None,
                ml_score        = float(rec.get("ml_score") or 0) if rec.get("ml_score") is not None else None,
                rule_score      = float(rec.get("rule_score") or 0),
                close_price     = float(close) if close and math.isfinite(close) else None,
                atr_percent     = float(atr)   if math.isfinite(atr)   else None,
                rsi             = float(rec.get("rsi") or 50),
                volume          = float(rec.get("volume") or 0),
                volume_ratio    = _bounded("vol_ratio20", rec.get("volume_ratio"), default=1.0),
                trend           = (bool(rec.get("trend")) if rec.get("trend") is not None else None),
                ema20_gap       = float(rec.get("ema20_gap") or 0),
                ema50_gap       = float(rec.get("ema50_gap") or 0),
                range_pct       = float(rec.get("range_pct") or 0),
                body_pct        = float(rec.get("body_pct") or 0),
                momentum        = _fi("momentum"),
                breakout        = _fi("breakout"),
                pattern_score   = _ii("pattern_score"),
                raw_features    = rec.get("ml_feats_json"),
                pattern_name         = rec.get("pattern_name") or None,
                pattern_is_stale     = bool(rec.get("pattern_is_stale", False)),
                secondary_pattern_name = rec.get("secondary_pattern_name") or None,
                change_pct      = float(rec.get("change_pct") or 0),
                target_price    = p_data.get("target_price"),
                stop_price      = p_data.get("stop_price"),
                risk_reward     = p_data.get("risk_reward"),
                target_direction= direction,
                predicted_days  = p_data.get("predicted_days") or _fallback_predicted_days(p_name, atr),
                veto_reasons    = json.dumps(p_data.get("reasons")) if isinstance(p_data.get("reasons"), list) else str(p_data.get("reasons", "")),
                strategy_snapshot = snapshot_raw if isinstance(snapshot_raw, str) else json.dumps(snapshot_raw),
                scan_session_id = session_id,
                # V3 extended features
                w52_position          = _fi("w52_position"),
                dist_from_52w_high    = _fi("dist_from_52w_high"),
                dist_from_52w_low     = _fi("dist_from_52w_low"),
                volume_zscore         = _fi("volume_zscore"),
                ret_3d                = _fi("ret_3d"),
                ret_acceleration      = _fi("ret_acceleration"),
                consecutive_down_days = _ii("consecutive_down_days"),
                close_position        = _fi("close_position"),
                ema_alignment_score   = _ii("ema_alignment_score"),
                trend_duration_days   = _ii("trend_duration_days"),
                bist100_trend_5d      = _fi("bist100_trend_5d"),
                vix_regime            = _ii("vix_regime"),
                usdtry_change_5d      = _fi("usdtry_change_5d"),
                market_regime         = _ii("market_regime"),
                rs_vs_bist100         = _fi("rs_vs_bist100"),
                sector_rel_strength_5d = _fi("sector_rel_strength_5d"),
                ml_schema_version      = FEATURE_SCHEMA_VERSION,
            ))

    if not rows:
        return

    db = SessionLocal()
    try:
        symbols = list({r.symbol    for r in rows})
        dates   = list({r.scan_date for r in rows})
        p_names = list({r.profile_name for r in rows})
        
        # Clean up existing records for these symbols/dates/profiles to allow idempotent re-runs
        db.query(ScanScore).filter(
            ScanScore.symbol.in_(symbols),
            ScanScore.scan_date.in_(dates),
            ScanScore.profile_name.in_(p_names)
        ).delete(synchronize_session=False)
        
        db.bulk_save_objects(rows)
        db.commit()
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
