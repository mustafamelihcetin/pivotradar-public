import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.core.time_utils import now_utc


class DataQuality:
    """Typed constants for MarketDataBundle.quality_flag — never use raw strings."""
    VALID      = "VALID"       # Fresh, confirmed data from primary source
    STALE      = "STALE"       # >48h old; safe for charts, excluded from scoring
    RECONCILED = "RECONCILED"  # Hybrid: stale history stitched with CF Worker live bar
    INCOMPLETE = "INCOMPLETE"  # No usable data — empty DataFrame


class MarketDataBundle:
    """
    Standardized container for market data with provenance and quality metadata.
    Ensures charts and scoring engines use identical, traceable datasets.
    """
    def __init__(
        self,
        symbol: str,
        df: pd.DataFrame,
        source: str,
        resolved_symbol: str,
        fetched_at: datetime = None,
        is_stale: bool = False,
        source_priority: int = 10,
        stale_seconds: int = 0,
        quality_flag: str = "VALID",
        reconciled: bool = False,
        metadata: Dict[str, Any] = None
    ):
        self.symbol = symbol
        self.df = df # Standardized OHLCV
        self.source = source # e.g. "YF", "LOCAL_PARQUET", "CF_WORKER"
        self.resolved_symbol = resolved_symbol
        self.fetched_at = fetched_at or now_utc()
        self.is_stale = is_stale
        self.source_priority = source_priority
        self.stale_seconds = stale_seconds
        self.quality_flag = quality_flag
        self.reconciled = reconciled
        self.metadata = metadata or {}

    @property
    def last_close(self) -> float:
        if self.df.empty:
            return 0.0
        return float(self.df["Close"].iloc[-1])

    @property
    def last_timestamp(self) -> Optional[datetime]:
        if self.df.empty:
            return None
        return self.df.index[-1]

def normalize_df_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Veri çerçevesini (DataFrame) standart Open, High, Low, Close, Volume formatına dönüştürür."""
    if df is None or df.empty:
        return pd.DataFrame()
        
    df = df.copy()
    # Flatten MultiIndex columns if any
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [
            "_".join([str(c) for c in col]).strip() 
            if isinstance(col, tuple) else str(col) 
            for col in df.columns.values
        ]
    
    df.columns = [str(c).strip().lower() for c in df.columns]
    lowermap = {c: orig for c, orig in zip(df.columns, df.columns)}

    def _pick_one(names: List[str]) -> Optional[str]:
        # 1. Exact match (case-insensitive)
        for c in df.columns:
            if c.lower() in names:
                return c
        
        # 2. Contains match (e.g. 'volume' in 'Volume_THYAO.IS')
        for c in df.columns:
            cl = c.lower()
            for nm in names:
                if nm in cl and len(nm) > 2: # avoid too short matches like 'v'
                    return c
        
        # 3. Fallback for common abbreviations if not found
        return None

    cols = {
        "Open": _pick_one(["open", "o", "açılış", "acilis"]),
        "High": _pick_one(["high", "h", "yüksek", "yuksek"]),
        "Low": _pick_one(["low", "l", "düşük", "dusuk"]),
        "Close": _pick_one(["close", "c", "son", "fiyat", "kapanış", "kapanis", "adj close", "adj_close", "adjusted close"]),
        "Volume": _pick_one(["volume", "vol", "v", "hacim", "volm", "hacimlot", "lot"])
    }

    keep_cols = {v: k for k, v in cols.items() if v}
    if not keep_cols:
        return pd.DataFrame()

    out = df[list(keep_cols.keys())].rename(columns=keep_cols)
    
    if "Volume" not in out.columns:
        out["Volume"] = 0.0

    for c in ["Open", "High", "Low", "Close", "Volume"]:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
            
    if "Close" in out.columns:
        return out.dropna(subset=["Close"])
    return out

def ensure_datetime_index(df: pd.DataFrame) -> pd.DataFrame:
    """Index'in datetime formatında olmasını sağlar."""
    if df is None or df.empty:
        return df
        
    if not isinstance(df.index, pd.DatetimeIndex):
        # Tarih sütunu ara
        for col in df.columns:
            if "date" in str(col).lower() or "tarih" in str(col).lower():
                df = df.set_index(pd.to_datetime(df[col]))
                break
        else:
            # Varsa mevcut index'i çevir
            try:
                df.index = pd.to_datetime(df.index)
            except Exception:
                pass
    return df
    
def compute_rsi_wilder(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Standard Wilder's RSI calculation (identical to TradingView/Finance standard).
    Uses Alpha = 1/N.
    """
    if series is None or len(series) < period:
        return pd.Series(index=series.index if series is not None else [], data=np.nan)
        
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    
    # Wilder's Smoothing: ewm(alpha=1/N, adjust=False)
    # adjust=False is critical for the recursive nature of Wilder's
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi

def compute_atr_wilder(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Standard Average True Range (ATR) using Wilder's Smoothing.
    """
    if df is None or df.empty or len(df) < period:
        return pd.Series(index=df.index if df is not None else [], data=np.nan)
        
    # High-Low, High-PrevClose, Low-PrevClose
    h = df["High"]
    l = df["Low"]
    pc = df["Close"].shift(1)
    
    tr = pd.concat([
        h - l,
        (h - pc).abs(),
        (l - pc).abs()
    ], axis=1).max(axis=1)
    
    # Wilder's Smoothing for ATR
    atr = tr.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    return atr
