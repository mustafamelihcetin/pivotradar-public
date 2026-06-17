# backend/app/features/backtest/engine.py
"""
PivotRadar Backtest Engine v2.0
Simulates strategy profiles on historical OHLCV data.

Now supports:
1.  Profile-based strategy (Swing, Trend, Scalper, etc.) using rules_score.
2.  Classic RSI/EMA strategy.
3.  Accurate indicator calculation via pandas.
"""
import math
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional, Tuple
from app.features.market_data.service import MarketDataService
from app.features.scoring.yzdsh_rules import rules_score
from app.core.market_calendar import count_trading_days
from app.core.config_profiles import normalize_profile, PROFILE_BACKTEST_THRESHOLDS


def run_backtest(
    symbol: str,
    profile_name: Optional[str] = None,
    rsi_buy: float = 35.0,
    rsi_sell: float = 65.0,
    use_ema_filter: bool = True,
    use_bb_filter: bool = False,
    initial_capital: float = 10_000.0,
    commission_pct: float = 0.001,  # 0.1% round-trip half
) -> Dict[str, Any]:
    svc = MarketDataService()
    # Fetch at least 400 days to have enough for indicators
    bundle = svc.fetch_price_df(symbol.upper(), lookback_days=400)
    df = bundle.df if bundle else None
    resolved = bundle.resolved_symbol if hasattr(bundle, 'resolved_symbol') else symbol
    note = bundle.source if bundle else ""

    if df is None or df.empty:
        return {
            "status": "error",
            "message": (
                f"'{symbol}' için fiyat verisi bulunamadı. "
                "Hisse borsadan çıkarılmış olabilir (delisted), "
                "sembol yanlış yazılmış olabilir veya veri kaynağı geçici olarak yanıt vermiyor."
            )
        }

    if len(df) < 50:
        return {"status": "error", "message": f"Yeterli veri yok ({len(df)} gün, minimum 50 gün gerekli)"}

    # ── Indicator Calculation (Pandas) ───────────────────────────────────────
    close = pd.to_numeric(df["Close"], errors="coerce")
    high  = pd.to_numeric(df["High"], errors="coerce")
    low   = pd.to_numeric(df["Low"], errors="coerce")
    vol   = pd.to_numeric(df["Volume"], errors="coerce")

    # RSI
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = (100 - (100 / (1 + rs))).fillna(50)

    # EMAs
    ema5  = close.ewm(span=5, adjust=False).mean()
    ema20 = close.ewm(span=20, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()

    # ATR
    tr1 = (high - low).abs()
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()
    atr_pct = (atr / close * 100.0).fillna(2.0)

    # Volume Ratio
    v5  = vol.rolling(5).mean()
    v20 = vol.rolling(20).mean()
    vol_ratio = (v5 / v20).fillna(1.0)

    # Breakout
    h20 = high.rolling(20).max()
    h55 = high.rolling(55).max()
    breakout = ((close >= h20) | (close >= h55)).astype(float)

    # Bollinger Bands
    bb_mu = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    bb_upper = bb_mu + 2 * bb_std
    bb_lower = bb_mu - 2 * bb_std

    # Prepare for simulation
    dates = [str(d)[:10] for d in df.index]
    closes = close.tolist()
    n = len(dates)

    # ── Simulation ──────────────────────────────────────────────────────────
    capital   = initial_capital
    position  = 0.0
    entry_px  = 0.0
    entry_date = ""
    in_pos    = False
    trades: List[Dict] = []
    equity: List[Dict] = []

    # Use Profile if specified
    use_profile = bool(profile_name and profile_name.upper() != "CUSTOM")

    # Profile-specific entry/exit thresholds
    _pn_canonical = normalize_profile(profile_name or "") if use_profile else None
    _bt = PROFILE_BACKTEST_THRESHOLDS.get(_pn_canonical or "", {"entry": 65, "exit_qrs": 35, "exit_ema": True})
    _entry_qrs  = _bt["entry"]
    _exit_qrs   = _bt["exit_qrs"]
    _exit_ema   = _bt["exit_ema"]

    # We skip the first 60 bars to let indicators stabilize
    for i in range(60, n):
        px = closes[i]
        if not np.isfinite(px): continue

        # Current values
        r_now = rsi.iloc[i]
        e5    = ema5.iloc[i]
        e20   = ema20.iloc[i]
        e50   = ema50.iloc[i]
        bb_l  = bb_lower.iloc[i]

        e5_p  = ema5.iloc[i-1]
        e20_p = ema20.iloc[i-1]

        # Profile Scoring
        qrs = 50.0
        if use_profile:
            qrs = rules_score(
                rsi=r_now,
                ema_fast_over_slow=(e20 > e50), # Trend filter
                atr_pct=atr_pct.iloc[i],
                vol_ratio=vol_ratio.iloc[i],
                profile_name=profile_name,
                breakout=breakout.iloc[i]
            )

        # Entry signal
        if not in_pos:
            if use_profile:
                buy_signal = (qrs >= _entry_qrs)
            else:
                rsi_signal = (r_now < rsi_buy)
                ema_cross  = use_ema_filter and (e5_p <= e20_p and e5 > e20)
                bb_signal  = use_bb_filter and (bb_l is not None and px <= bb_l)
                buy_signal = rsi_signal and (ema_cross or not use_ema_filter or bb_signal)

            if buy_signal:
                cost       = px * (1 + commission_pct)
                position   = (capital * 0.98) / cost
                entry_px   = cost
                entry_date = dates[i]
                capital   -= position * cost
                in_pos     = True

        # Exit signal
        elif in_pos:
            if use_profile:
                ema_death = _exit_ema and (e5_p >= e20_p and e5 < e20)
                sell_signal = (qrs <= _exit_qrs) or ema_death
            else:
                rsi_exit  = (r_now > rsi_sell)
                ema_death = use_ema_filter and (e5_p >= e20_p and e5 < e20)
                sell_signal = rsi_exit or ema_death

            # Force exit on last day
            if sell_signal or i == n - 1:
                exit_px  = px * (1 - commission_pct)
                pnl_pct  = (exit_px - entry_px) / entry_px * 100
                capital += position * exit_px

                trades.append({
                    "entry_date":   entry_date,
                    "exit_date":    dates[i],
                    "entry_price":  round(entry_px, 4),
                    "exit_price":   round(exit_px, 4),
                    "pnl_pct":      round(pnl_pct, 2),
                    "holding_days": count_trading_days(df.index[dates.index(entry_date)].date(), df.index[i].date()) if entry_date in dates else 0,
                    "result":       "win" if pnl_pct >= 0 else "loss",
                })
                position   = 0.0
                in_pos     = False

        equity.append({
            "date":        dates[i],
            "equity":      round(capital + (position * px if in_pos else 0.0), 2),
            "in_position": in_pos,
            "qrs":         round(qrs, 1) if use_profile else None
        })

    # ── Metrics ─────────────────────────────────────────────────────────────
    eq_vals = [e["equity"] for e in equity]
    final_equity = eq_vals[-1] if eq_vals else initial_capital
    total_return_pct = (final_equity - initial_capital) / initial_capital * 100

    # Zero-trades explanation
    if not trades and use_profile:
        return {
            "status": "no_data",
            "symbol": resolved or symbol.upper(),
            "profile": profile_name or "Custom",
            "message": (
                f"'{profile_name}' profili 400 günlük veri içinde hiç giriş sinyali üretmedi. "
                f"Giriş eşiği: QRS ≥ {_entry_qrs}. "
                "Farklı bir profil deneyin veya RSI/EMA modunu kullanın."
            ),
        }
    if not trades:
        return {
            "status": "no_data",
            "symbol": resolved or symbol.upper(),
            "profile": "Custom RSI/EMA",
            "message": (
                f"RSI < {rsi_buy} koşulu 400 günlük veri içinde hiç oluşmadı "
                f"{'+ EMA 5/20 kesişim koşulu sağlanamadı' if use_ema_filter else ''}. "
                "RSI eşiğini yükseltin veya EMA filtresini devre dışı bırakın."
            ),
        }

    # Drawdown series + max drawdown
    peak = initial_capital
    max_dd = 0.0
    drawdown_series = []
    for e in equity:
        v = e["equity"]
        if v > peak:
            peak = v
        dd = round((peak - v) / peak * 100, 2) if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
        drawdown_series.append({"date": e["date"], "dd": dd})

    daily_rets = [(eq_vals[i] - eq_vals[i - 1]) / eq_vals[i - 1] for i in range(1, len(eq_vals)) if eq_vals[i - 1]]
    mu, std, sharpe = 0.0, 0.0, 0.0
    if len(daily_rets) > 1:
        mu  = np.mean(daily_rets)
        std = np.std(daily_rets, ddof=1)
        sharpe = round((mu / std) * math.sqrt(252), 2) if std > 0 else 0.0

    # CAGR
    trading_days = len(equity)
    years = max(trading_days / 252, 0.01)
    cagr = round(((final_equity / initial_capital) ** (1.0 / years) - 1) * 100, 2)

    wins     = [t for t in trades if t["result"] == "win"]
    win_rate = round(len(wins) / len(trades) * 100, 1) if trades else 0.0
    pnls     = [t["pnl_pct"] for t in trades]
    avg_hold = round(sum(t["holding_days"] for t in trades) / len(trades), 1) if trades else 0.0

    # Profit Factor
    gross_wins = sum(p for p in pnls if p > 0)
    gross_loss = abs(sum(p for p in pnls if p < 0))
    profit_factor = round(gross_wins / gross_loss, 2) if gross_loss > 0 else 0.0

    # XU100 benchmark — best-effort, silently skip on error
    benchmark_curve: List[Dict] = []
    try:
        import yfinance as yf
        date_set = {e["date"] for e in equity}
        start_str = dates[0] if dates else None
        if start_str:
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
        "status":           "ok",
        "symbol":           resolved or symbol.upper(),
        "note":             note or "",
        "profile":          profile_name or "Custom",
        "equity_curve":     equity,
        "benchmark_curve":  benchmark_curve,
        "drawdown_series":  drawdown_series,
        "trades":           trades[-100:],
        "metrics": {
            "total_return":    round(total_return_pct, 2),
            "cagr":            cagr,
            "max_drawdown":    round(max_dd, 2),
            "sharpe":          sharpe,
            "sortino":         round(float(mu / np.std([r for r in daily_rets if r < 0]) * math.sqrt(252)), 2) if any(r < 0 for r in daily_rets) else 0.0,
            "calmar":          round(total_return_pct / max_dd, 2) if max_dd > 0 else 0.0,
            "profit_factor":   profit_factor,
            "win_rate":        win_rate,
            "num_trades":      len(trades),
            "best_trade":      round(max(pnls), 2) if pnls else 0.0,
            "worst_trade":     round(min(pnls), 2) if pnls else 0.0,
            "avg_hold_days":   avg_hold,
            "initial_capital": initial_capital,
            "final_capital":   round(final_equity, 2),
        },
        "params": {
            "profile_name":    profile_name,
            "rsi_buy":         rsi_buy,
            "rsi_sell":        rsi_sell,
            "use_ema_filter":  use_ema_filter,
            "use_bb_filter":   use_bb_filter,
            "commission_pct":  commission_pct,
        },
    }
