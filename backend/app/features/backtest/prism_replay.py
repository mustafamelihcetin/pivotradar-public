# backend/app/features/backtest/prism_replay.py
"""
PRISM Sinyal Replay Engine

Geçmişteki scan_scores kayıtlarını kullanarak, PRISM sinyallerini
kör takip etmiş olsaydın ne olurdu sorusunu simüle eder.

SPK UYARI: Bu modül eğitim amaçlı tarihsel simülasyondur.
Yatırım tavsiyesi değildir. Geçmiş performans geleceği garanti etmez.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional

import numpy as np


def run_prism_replay(
    db,
    qrs_threshold: float = 65.0,
    top_n: int = 5,
    initial_capital: float = 10_000.0,
    commission_pct: float = 0.0015,  # %0.15 round-trip half
) -> Dict[str, Any]:
    """
    Evaluate scan_scores geçmişine bakarak eşit ağırlıklı portföy simülasyonu yapar.
    Her scan_date grubunda QRS >= threshold koşulunu sağlayan top_n sinyal seçilir,
    actual_return_pct kullanılarak kompound getiri hesaplanır.
    """
    from app.features.scanner.models import ScanScore

    records = (
        db.query(ScanScore)
        .filter(
            ScanScore.qrs_score >= qrs_threshold,
            ScanScore.actual_return_pct.isnot(None),
            ScanScore.close_price.isnot(None),
            ScanScore.close_price > 0,
            ScanScore.scan_date.isnot(None),
        )
        .order_by(ScanScore.scan_date)
        .all()
    )

    if not records:
        return {
            "status": "no_data",
            "message": "Henüz değerlendirilmiş sinyal yok. Labeler job çalıştıkça veri birikecek.",
            "total_signals": 0,
        }

    # Group by scan_date
    by_date: Dict[date, List] = defaultdict(list)
    for r in records:
        by_date[r.scan_date].append(r)

    dates_sorted = sorted(by_date.keys())

    capital = initial_capital
    equity_curve: List[Dict] = [{"date": str(dates_sorted[0]), "equity": round(capital, 2)}]
    trades: List[Dict] = []
    total_signals = 0

    for scan_date in dates_sorted:
        day_signals = sorted(
            by_date[scan_date], key=lambda x: x.qrs_score or 0, reverse=True
        )[:top_n]

        if not day_signals:
            continue

        total_signals += len(day_signals)
        per_alloc = capital / len(day_signals)
        batch_gain = 0.0

        for sig in day_signals:
            raw_ret = (sig.actual_return_pct or 0.0) / 100.0
            # commission both entry and exit
            net_ret = (1 + raw_ret) * (1 - commission_pct) ** 2 - 1
            batch_gain += net_ret * per_alloc

            trades.append({
                "date":       str(scan_date),
                "symbol":     sig.symbol,
                "entry":      round(sig.close_price, 4),
                "qrs":        round(sig.qrs_score or 0, 1),
                "return_pct": round(sig.actual_return_pct or 0, 2),
                "hit_status": sig.hit_status or "—",
                "target_hit": bool(sig.target_hit),
            })

        capital += batch_gain
        capital = max(capital, 0.0)
        equity_curve.append({"date": str(scan_date), "equity": round(capital, 2)})

    if len(equity_curve) < 2:
        return {
            "status": "no_data",
            "message": "Simülasyon için yeterli tarihsel veri bulunamadı.",
            "total_signals": total_signals,
        }

    # ── Metrics ──────────────────────────────────────────────────────────────
    eq_vals    = [e["equity"] for e in equity_curve]
    final_eq   = eq_vals[-1]
    total_ret  = (final_eq - initial_capital) / initial_capital * 100

    # Drawdown series
    peak = initial_capital
    max_dd = 0.0
    drawdown_series: List[Dict] = []
    for e in equity_curve:
        v = e["equity"]
        if v > peak:
            peak = v
        dd = round((peak - v) / peak * 100, 2) if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
        drawdown_series.append({"date": e["date"], "dd": dd})

    n_periods = len(eq_vals) - 1
    years = max(n_periods / 52, 0.01)  # approximate: one batch ~ one week
    cagr  = round(((final_eq / initial_capital) ** (1.0 / years) - 1) * 100, 2)

    daily_rets = [(eq_vals[i] - eq_vals[i - 1]) / eq_vals[i - 1] for i in range(1, len(eq_vals)) if eq_vals[i - 1]]
    sharpe = 0.0
    if len(daily_rets) > 1:
        mu  = float(np.mean(daily_rets))
        std = float(np.std(daily_rets, ddof=1))
        sharpe = round((mu / std) * math.sqrt(52), 2) if std > 0 else 0.0

    wins      = [t for t in trades if t["return_pct"] > 0]
    win_rate  = round(len(wins) / len(trades) * 100, 1) if trades else 0.0
    rets      = [t["return_pct"] for t in trades]
    gross_win = sum(r for r in rets if r > 0)
    gross_los = abs(sum(r for r in rets if r < 0))
    pf        = round(gross_win / gross_los, 2) if gross_los > 0 else 0.0
    avg_ret   = round(float(np.mean(rets)), 2) if rets else 0.0

    # XU100 benchmark — best-effort
    benchmark_curve: List[Dict] = []
    try:
        import yfinance as yf
        date_set = {e["date"] for e in equity_curve}
        start_str = str(dates_sorted[0])
        xu = yf.download("XU100.IS", start=start_str, progress=False, auto_adjust=True)
        if not xu.empty:
            xu_c = xu["Close"].dropna()
            xu_c = xu_c[xu_c.index >= start_str]
            if len(xu_c) > 0:
                base = float(xu_c.iloc[0])
                benchmark_curve = [
                    {"date": str(d)[:10], "equity": round(float(v) / base * initial_capital, 2)}
                    for d, v in zip(xu_c.index, xu_c.values)
                    if str(d)[:10] in date_set
                ]
    except Exception:
        pass

    return {
        "status":          "ok",
        "equity_curve":    equity_curve,
        "benchmark_curve": benchmark_curve,
        "drawdown_series": drawdown_series,
        "trades":          sorted(trades, key=lambda t: t["date"], reverse=True)[:200],
        "metrics": {
            "total_return":    round(total_ret, 2),
            "cagr":            cagr,
            "max_drawdown":    round(max_dd, 2),
            "sharpe":          sharpe,
            "profit_factor":   pf,
            "win_rate":        win_rate,
            "num_signals":     total_signals,
            "avg_return":      avg_ret,
            "initial_capital": initial_capital,
            "final_capital":   round(final_eq, 2),
            "num_periods":     n_periods,
        },
        "params": {
            "qrs_threshold": qrs_threshold,
            "top_n":         top_n,
            "commission_pct": commission_pct,
        },
        "total_signals": total_signals,
    }
