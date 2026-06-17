# backend/app/features/backtest/walk_forward.py
"""
Walk-Forward Signal Validation

Monthly windowed out-of-sample validation against historical scan_scores.

Metrics:
  - precision         = win_rate (target_hit / evaluated)
  - recall            = directional accuracy proxy
  - f1                = harmonic mean
  - directional_acc   = fraction of correct directional calls
  - sharpe_analog     = annualized Sharpe using monthly returns
  - sharpe_slippage   = Sharpe after 0.1% round-trip slippage
  - max_drawdown      = peak-to-trough on cumulative returns
  - drift_score       = recent 2-window vs baseline precision delta
  - stability         = std of per-window precision (lower = more stable)
  - is_oos_gap        = in-sample vs out-of-sample precision gap
  - p_value           = binomial test (win_rate > 0.5)
  - benchmark_alpha   = strategy avg_return minus XU100 period return
  - survivorship_note = count of symbols scanned but never evaluated
"""
import datetime
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.features.scanner.models import ScanScore
from app.core.time_utils import now_utc, isoformat_z

# BIST maliyet modeli — brüt getiriden düşülen gerçek alım-satım maliyeti
# Komisyon (alım): ~0.08% | Komisyon (satım): ~0.08% | Spread: ~0.10%
BIST_COMMISSION_BUY    = 0.0008  # %0.08 alım komisyonu
BIST_COMMISSION_SELL   = 0.0008  # %0.08 satım komisyonu
BIST_SPREAD            = 0.0010  # %0.10 ortalama spread (orta-büyük hisse)
BIST_ROUND_TRIP_COST   = BIST_COMMISSION_BUY + BIST_COMMISSION_SELL + BIST_SPREAD  # %0.26
SLIPPAGE_PCT           = BIST_ROUND_TRIP_COST  # geriye dönük uyumluluk için alias

MIN_SAMPLES_PER_WINDOW = 30
MIN_TOTAL_SAMPLES      = 100
DRIFT_ALERT_THRESHOLD  = 0.10


def _month_key(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m")


def _safe_div(num: float, denom: float, default: float = 0.0) -> float:
    return round(num / denom, 4) if denom > 0 else default


def _f1(precision: float, recall: float) -> float:
    s = precision + recall
    return round(2 * precision * recall / s, 4) if s > 0 else 0.0


def _max_drawdown(returns: List[float]) -> float:
    """Peak-to-trough drawdown on cumulative equity curve."""
    if not returns:
        return 0.0
    equity = [1.0]
    for r in returns:
        equity.append(equity[-1] * (1 + r / 100))
    peak = equity[0]
    max_dd = 0.0
    for e in equity:
        if e > peak:
            peak = e
        dd = (peak - e) / peak
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4)


def _sharpe(returns: List[float], annualize_factor: float = 12.0) -> float:
    if len(returns) < 2:
        return 0.0
    avg = sum(returns) / len(returns)
    std = math.sqrt(sum((x - avg) ** 2 for x in returns) / len(returns))
    return round((avg / std) * math.sqrt(annualize_factor), 3) if std > 0 else 0.0


def _fetch_xu100_period_return(lookback_months: int) -> Optional[float]:
    """Fetch XU100 return for the lookback period. Returns None on failure."""
    try:
        import yfinance as yf
        cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=lookback_months * 31)
        ticker = yf.Ticker("XU100.IS")
        hist = ticker.history(start=cutoff.strftime("%Y-%m-%d"), auto_adjust=True)
        if hist is None or hist.empty or len(hist) < 2:
            return None
        start_price = float(hist["Close"].iloc[0])
        end_price = float(hist["Close"].iloc[-1])
        if start_price <= 0:
            return None
        return round((end_price - start_price) / start_price * 100, 2)
    except Exception:
        return None


def _compute_window_metrics(rows: List[ScanScore]) -> Dict[str, Any]:
    n = len(rows)
    if n == 0:
        return {"n": 0, "skipped": True, "reason": "no_data"}

    dir_rows = [r for r in rows if r.directional_hit is not None]
    dir_hits = sum(1 for r in dir_rows if r.directional_hit)
    directional_acc = _safe_div(dir_hits, len(dir_rows))

    hit_rows = [r for r in rows if r.target_hit is not None]
    if len(hit_rows) < MIN_SAMPLES_PER_WINDOW:
        return {
            "n": n,
            "skipped": True,
            "reason": f"insufficient_evaluated ({len(hit_rows)}/{MIN_SAMPLES_PER_WINDOW})",
        }

    n_hit = sum(1 for r in hit_rows if r.target_hit)
    n_miss = len(hit_rows) - n_hit
    if min(n_hit, n_miss) == 0:
        return {"n": n, "n_evaluated": len(hit_rows), "skipped": True, "reason": "single_class"}

    precision = _safe_div(n_hit, len(hit_rows))
    recall    = directional_acc

    raw_returns  = [r.actual_return_pct for r in hit_rows if r.actual_return_pct is not None]
    # Net returns: brüt getiri − BIST komisyon ve spread maliyeti
    net_cost_pct = BIST_ROUND_TRIP_COST * 100  # yüzde cinsinden
    net_returns  = [r - net_cost_pct for r in raw_returns]

    avg_ret      = sum(raw_returns) / len(raw_returns) if raw_returns else 0.0
    avg_ret_net  = sum(net_returns) / len(net_returns) if net_returns else 0.0

    return {
        "n":               n,
        "n_evaluated":     len(hit_rows),
        "n_hits":          n_hit,
        "n_miss":          n_miss,
        "precision":       precision,
        "recall":          recall,
        "f1":              _f1(precision, recall),
        "directional_acc": directional_acc,
        "avg_return_pct":  round(avg_ret, 3),
        "avg_return_net":  round(avg_ret_net, 3),
        "avg_return_slip": round(avg_ret_net, 3),  # uyumluluk
        "bist_cost_pct":   round(net_cost_pct, 3),
        "sharpe_analog":   _sharpe(raw_returns),
        "sharpe_net":      _sharpe(net_returns),
        "sharpe_slippage": _sharpe(net_returns),   # uyumluluk
        "max_drawdown":    _max_drawdown(raw_returns),
        "max_drawdown_net": _max_drawdown(net_returns),
        "class_balance":   round(_safe_div(min(n_hit, n_miss), len(hit_rows)), 3),
        "skipped":         False,
    }


def run_walk_forward(
    db: Session,
    profile_name: Optional[str] = None,
    lookback_months: int = 12,
    include_benchmark: bool = False,
) -> Dict[str, Any]:
    cutoff = now_utc().replace(tzinfo=None) - datetime.timedelta(days=lookback_months * 31)

    q = db.query(ScanScore).filter(ScanScore.scanned_at >= cutoff)
    if profile_name:
        q = q.filter(ScanScore.profile_name == profile_name)
    rows = q.all()

    if len(rows) < MIN_TOTAL_SAMPLES:
        return {
            "status":  "insufficient_data",
            "message": f"Yeterli veri yok: {len(rows)} kayıt, minimum {MIN_TOTAL_SAMPLES}.",
            "windows": [],
            "aggregate": {},
        }

    # Survivorship bias note: symbols scanned but never evaluated
    all_symbols  = {r.symbol for r in rows if hasattr(r, "symbol") and r.symbol}
    eval_symbols = {r.symbol for r in rows if hasattr(r, "symbol") and r.symbol and r.target_hit is not None}
    never_evaluated = len(all_symbols - eval_symbols)

    by_month: Dict[str, List[ScanScore]] = defaultdict(list)
    for row in rows:
        key = _month_key(row.scanned_at)
        by_month[key].append(row)

    windows = []
    for month in sorted(by_month.keys()):
        metrics = _compute_window_metrics(by_month[month])
        windows.append({"month": month, **metrics})

    valid = [w for w in windows if not w.get("skipped")]
    if not valid:
        return {
            "status":  "no_valid_windows",
            "message": "Değerlendirilebilir pencere yok.",
            "windows": windows,
            "aggregate": {},
        }

    agg_precision  = sum(w["precision"]       for w in valid) / len(valid)
    agg_recall     = sum(w["recall"]          for w in valid) / len(valid)
    agg_dir_acc    = sum(w["directional_acc"] for w in valid) / len(valid)
    agg_sharpe     = sum(w["sharpe_analog"]   for w in valid) / len(valid)
    agg_sharpe_net = sum(w["sharpe_net"]      for w in valid) / len(valid)
    agg_sharpe_sl  = agg_sharpe_net  # uyumluluk
    agg_avg_ret    = sum(w["avg_return_pct"]  for w in valid) / len(valid)
    agg_avg_ret_net= sum(w["avg_return_net"]  for w in valid) / len(valid)
    agg_max_dd     = max((w["max_drawdown"]   for w in valid), default=0.0)
    agg_max_dd_net = max((w["max_drawdown_net"] for w in valid), default=0.0)
    total_evaluated = sum(w["n_evaluated"]    for w in valid)

    # Stability: std of per-window precision
    prec_vals = [w["precision"] for w in valid]
    stability = round(
        math.sqrt(sum((x - agg_precision) ** 2 for x in prec_vals) / len(prec_vals)), 4
    ) if len(prec_vals) > 1 else 0.0

    # In-sample / out-of-sample split (first 80% / last 20%)
    is_oos_gap = None
    if len(valid) >= 5:
        split    = max(1, int(len(valid) * 0.8))
        is_prec  = sum(w["precision"] for w in valid[:split]) / split
        oos_prec = sum(w["precision"] for w in valid[split:]) / max(len(valid) - split, 1)
        is_oos_gap = round(is_prec - oos_prec, 4)

    # Drift
    drift_alert = False
    drift_delta = None
    if len(valid) >= 4:
        recent_avg  = sum(w["precision"] for w in valid[-2:]) / 2
        base_avg    = sum(w["precision"] for w in valid[:-2]) / max(len(valid) - 2, 1)
        drift_delta = round(recent_avg - base_avg, 4)
        drift_alert = drift_delta < -DRIFT_ALERT_THRESHOLD

    # Statistical significance: binomial test (win_rate > 50%?)
    total_hits  = sum(w["n_hits"]      for w in valid)
    total_tries = sum(w["n_evaluated"] for w in valid)
    p_value = None
    if total_tries >= 30:
        try:
            from scipy.stats import binomtest
            p_value = round(binomtest(total_hits, total_tries, 0.5, alternative="greater").pvalue, 4)
        except Exception:
            try:
                from scipy.stats import binom_test  # type: ignore[import]
                p_value = round(binom_test(total_hits, total_tries, 0.5, alternative="greater"), 4)
            except Exception:
                pass

    # XU100 benchmark alpha
    benchmark_return = None
    alpha = None
    if include_benchmark:
        benchmark_return = _fetch_xu100_period_return(lookback_months)
        if benchmark_return is not None:
            alpha = round(agg_avg_ret - benchmark_return / lookback_months, 3)

    return {
        "status":          "ok",
        "profile":         profile_name or "all",
        "lookback_months": lookback_months,
        "total_scans":     len(rows),
        "total_evaluated": total_evaluated,
        "windows":         windows,
        "survivorship": {
            "total_symbols":    len(all_symbols),
            "evaluated_symbols": len(eval_symbols),
            "never_evaluated":   never_evaluated,
            "note": (
                f"{never_evaluated} sembol tarandı ama hiç değerlendirilmedi — "
                "bu semboller backtest'e dahil değil (survivorship bias kaynağı)."
                if never_evaluated > 0 else "Tüm semboller değerlendirildi."
            ),
        },
        "cost_model": {
            "commission_buy_pct":  round(BIST_COMMISSION_BUY * 100, 3),
            "commission_sell_pct": round(BIST_COMMISSION_SELL * 100, 3),
            "spread_pct":          round(BIST_SPREAD * 100, 3),
            "total_round_trip_pct": round(BIST_ROUND_TRIP_COST * 100, 3),
        },
        "aggregate": {
            "precision":               round(agg_precision, 4),
            "recall":                  round(agg_recall, 4),
            "f1":                      _f1(agg_precision, agg_recall),
            "directional_acc":         round(agg_dir_acc, 4),
            "sharpe_analog":           round(agg_sharpe, 3),
            "sharpe_net":              round(agg_sharpe_net, 3),
            "sharpe_slippage":         round(agg_sharpe_sl, 3),
            "avg_return_pct":          round(agg_avg_ret, 3),
            "avg_return_net":          round(agg_avg_ret_net, 3),
            "max_drawdown":            agg_max_dd,
            "max_drawdown_net":        agg_max_dd_net,
            "stability":               stability,
            "is_oos_gap":              is_oos_gap,
            "valid_windows":           len(valid),
            "total_windows":           len(windows),
            "p_value":                 p_value,
            "statistically_significant": (p_value is not None and p_value < 0.05),
            "benchmark_return_pct":    benchmark_return,
            "alpha":                   alpha,
        },
        "drift": {
            "alert":   drift_alert,
            "delta":   drift_delta,
            "message": (
                f"Uyarı: Son 2 ay precision {abs(drift_delta):.1%} düştü."
                if drift_alert else "Drift tespit edilmedi."
            ) if drift_delta is not None else "Yeterli pencere yok.",
        },
    }


def get_signal_quality_summary(db: Session) -> Dict[str, Any]:
    profiles_q = db.query(ScanScore.profile_name).distinct().all()
    profiles = [r[0] for r in profiles_q if r[0]]

    summary = []
    for profile in profiles:
        result = run_walk_forward(db, profile_name=profile, lookback_months=6)
        if result["status"] == "ok":
            agg = result["aggregate"]
            summary.append({
                "profile":         profile,
                "precision":       agg["precision"],
                "directional_acc": agg["directional_acc"],
                "sharpe_analog":   agg["sharpe_analog"],
                "sharpe_slippage": agg["sharpe_slippage"],
                "max_drawdown":    agg["max_drawdown"],
                "stability":       agg["stability"],
                "is_oos_gap":      agg.get("is_oos_gap"),
                "valid_windows":   agg["valid_windows"],
                "drift_alert":     result["drift"]["alert"],
                "p_significant":   agg.get("statistically_significant", False),
            })

    global_result = run_walk_forward(db, profile_name=None, lookback_months=6)
    return {
        "profiles":     summary,
        "global":       global_result.get("aggregate", {}),
        "global_drift": global_result.get("drift", {}),
        "generated_at": isoformat_z(now_utc()),
    }
