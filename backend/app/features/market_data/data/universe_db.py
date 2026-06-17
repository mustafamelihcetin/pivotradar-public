# -*- coding: utf-8 -*-
"""
core/universe_db.py

Deterministic, offline-first universe provider.
Reads from local EOD index (data/eod/index.json) to provide reliable symbol universe
without dependency on Yahoo screener or external APIs.

Index format:
{
  "generated_at": "2026-02-05T20:00:00Z",
  "symbols": {
    "THYAO": {
      "last_bar_time": "2026-02-04",
      "bars_count": 240,
      "file_size_kb": 18,
      "quality": "ok"
    }
  }
}
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
from app.core.time_utils import now_utc, isoformat_z

# --- Path resolution ---
_APP_DIR = Path(__file__).resolve().parents[1]
_EOD_DIR = _APP_DIR / "data" / "eod"
_INDEX_PATH = _EOD_DIR / "index.json"


def _safe_print(msg: str) -> None:
    import logging as _log
    _log.getLogger(__name__).debug("%s", msg)


def build_index_from_eod(index_path: Optional[Path] = None) -> Dict:
    """
    Scans data/eod/*.parquet files and generates index metadata.
    
    Returns:
        Dict with structure: {"generated_at": ..., "symbols": {...}}
    """
    if index_path is None:
        index_path = _INDEX_PATH
    
    index_path.parent.mkdir(parents=True, exist_ok=True)
    
    if not _EOD_DIR.exists():
        _safe_print(f"[universe_db] EOD dir not found: {_EOD_DIR}")
        return {"generated_at": isoformat_z(now_utc()), "symbols": {}}
    
    symbols_meta = {}
    
    for p in _EOD_DIR.glob("*.parquet"):
        try:
            # Extract symbol from filename
            sym = p.stem.upper()
            if sym.endswith(".IS"):
                sym = sym[:-3]
            
            # Read parquet metadata
            df = pd.read_parquet(p)
            
            if df.empty or "Close" not in df.columns:
                continue
            
            # Get last bar time
            if isinstance(df.index, pd.DatetimeIndex):
                last_bar = df.index.max()
                last_bar_time = last_bar.strftime("%Y-%m-%d")
            else:
                last_bar_time = "unknown"
            
            bars_count = len(df)
            file_size_kb = int(p.stat().st_size / 1024)
            
            # Quality assessment
            if bars_count >= 180:
                quality = "ok"
            elif bars_count >= 60:
                quality = "partial"
            else:
                quality = "sparse"
            
            symbols_meta[sym] = {
                "last_bar_time": last_bar_time,
                "bars_count": bars_count,
                "file_size_kb": file_size_kb,
                "quality": quality
            }
        
        except Exception as e:
            _safe_print(f"[universe_db] Skip {p.name}: {e}")
            continue
    
    index_data = {
        "generated_at": isoformat_z(now_utc()),
        "symbols": symbols_meta
    }
    
    # Write index
    try:
        index_path.write_text(json.dumps(index_data, ensure_ascii=False, indent=2), encoding="utf-8")
        _safe_print(f"[universe_db] Index written: {index_path} ({len(symbols_meta)} symbols)")
    except Exception as e:
        _safe_print(f"[universe_db] Index write failed: {e}")
    
    return index_data


def load_eod_index(index_path: Optional[Path] = None, auto_build: bool = False) -> Optional[Dict]:
    """
    Loads EOD index from disk.
    
    Args:
        index_path: Path to index.json (default: data/eod/index.json)
        auto_build: If True and index missing, generates from parquet files
    
    Returns:
        Index dict or None if not found
    """
    if index_path is None:
        index_path = _INDEX_PATH
    
    if not index_path.exists():
        if auto_build:
            _safe_print("[universe_db] Index not found, auto-building...")
            return build_index_from_eod(index_path)
        return None
    
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        _safe_print(f"[universe_db] Index read failed: {e}")
        if auto_build:
            _safe_print("[universe_db] Rebuilding index...")
            return build_index_from_eod(index_path)
        return None


def get_active_symbols(
    min_bars: int = 30,
    max_age_days: int = 7,
    limit: Optional[int] = None,
    index_path: Optional[Path] = None
) -> List[str]:
    """
    Returns deterministic list of active symbols from EOD index.
    
    Args:
        min_bars: Minimum bar count required (default: 30)
        max_age_days: Maximum age in days for last_bar_time (default: 7)
        limit: Maximum number of symbols to return (default: None = no limit)
        index_path: Path to index.json
    
    Returns:
        Sorted list of symbol strings
    """
    index = load_eod_index(index_path, auto_build=False)
    
    if not index or "symbols" not in index:
        _safe_print("[universe_db] No index available")
        return []
    
    symbols_meta = index["symbols"]
    if not symbols_meta:
        return []
    
    # Filter by criteria
    active = []
    cutoff_date = (now_utc().replace(tzinfo=None) - timedelta(days=max_age_days)).strftime("%Y-%m-%d")
    
    for sym, meta in symbols_meta.items():
        bars = meta.get("bars_count", 0)
        last_bar = meta.get("last_bar_time", "1900-01-01")
        quality = meta.get("quality", "unknown")
        
        # Apply filters
        if bars < min_bars:
            continue
        if last_bar < cutoff_date:
            continue
        if quality == "sparse":
            continue
        
        active.append((sym, last_bar, bars, quality))
    
    # Sort by: quality (ok > partial), then recency, then bar count
    quality_rank = {"ok": 1, "partial": 2, "unknown": 3}
    active.sort(key=lambda x: (quality_rank.get(x[3], 99), x[1], -x[2]), reverse=True)
    
    # Extract symbols
    result = [sym for sym, _, _, _ in active]
    
    # Apply limit
    if limit and len(result) > limit:
        result = result[:limit]
    
    _safe_print(f"[universe_db] Active symbols: {len(result)} (filtered from {len(symbols_meta)})")
    
    return result


def get_universe_df(
    min_bars: int = 30,
    max_age_days: int = 7,
    limit: Optional[int] = None
) -> pd.DataFrame:
    """
    Returns universe as DataFrame with 'symbol' column.
    
    Args:
        min_bars: Minimum bar count
        max_age_days: Maximum age in days
        limit: Max symbols to return
    
    Returns:
        DataFrame with 'symbol' column
    """
    symbols = get_active_symbols(min_bars, max_age_days, limit)
    return pd.DataFrame({"symbol": symbols})
