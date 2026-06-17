# tests/sentinel.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


@dataclass
class SentinelIssue:
    code: str
    message: str
    details: Dict[str, Any]


def validate_df(df: pd.DataFrame | None) -> List[SentinelIssue]:
    issues: List[SentinelIssue] = []
    if df is None:
        issues.append(SentinelIssue("DF_NONE", "Sonuç dataframe None geldi.", {}))
        return issues
    if not isinstance(df, pd.DataFrame):
        issues.append(SentinelIssue("DF_TYPE", f"Sonuç dataframe tipi beklenmiyor: {type(df)}", {}))
        return issues
    if df.empty:
        issues.append(SentinelIssue("DF_EMPTY", "Sonuç dataframe boş.", {}))
        return issues

    cols = [str(c) for c in df.columns]
    if "Sembol" not in cols:
        issues.append(SentinelIssue("DF_NO_SYMBOL", "Dataframe içinde 'Sembol' kolonu yok.", {"columns": cols[:50]}))

    if "Fiyat" in cols:
        s = df["Fiyat"]
        # None/NaN yoğunluğu
        null_ratio = float(pd.isna(s).mean())
        # object ise None görünümleri
        if s.dtype == object:
            none_like = int((s.astype(str).str.lower().isin(["none", "nan", "null", ""])).sum())
        else:
            none_like = 0
        if null_ratio > 0.25:
            issues.append(SentinelIssue(
                "PRICE_NULL_HIGH",
                "Fiyat kolonunda boş değer oranı yüksek.",
                {"null_ratio": round(null_ratio, 3), "dtype": str(s.dtype), "none_like": none_like},
            ))
    else:
        issues.append(SentinelIssue("DF_NO_PRICE", "Dataframe içinde 'Fiyat' kolonu yok (Close->Fiyat mapping eksik olabilir).", {"columns": cols[:50]}))

    # kritik skor kolonları
    for c in ["YZDSH", "ML", "RuleScore", "Teknik Puan", "Kırılım Gücü"]:
        if c in cols:
            s = pd.to_numeric(df[c], errors="coerce")
            if float(pd.isna(s).mean()) > 0.50:
                issues.append(SentinelIssue("SCORE_NAN", f"'{c}' kolonunda NaN oranı yüksek.", {"col": c}))

    return issues


def validate_meta(meta: Dict[str, Any] | None) -> List[SentinelIssue]:
    issues: List[SentinelIssue] = []
    meta = dict(meta or {})
    total_time = meta.get("total_time")
    if total_time is None:
        issues.append(SentinelIssue("META_NO_TOTAL_TIME", "meta.total_time yok (0s / '-' sorunu).", {"keys": list(meta.keys())[:50]}))
    else:
        try:
            tt = float(total_time)
            if tt <= 0.0:
                issues.append(SentinelIssue("META_TOTAL_TIME_ZERO", "meta.total_time 0 veya negatif.", {"total_time": total_time}))
        except Exception:
            issues.append(SentinelIssue("META_TOTAL_TIME_BAD", "meta.total_time sayıya çevrilemiyor.", {"total_time": total_time}))

    scan_date = meta.get("scan_date") or meta.get("last_date")
    if not scan_date:
        issues.append(SentinelIssue("META_NO_DATE", "meta.scan_date / meta.last_date boş (Veri Tarihi '-' sorunu).", {"keys": list(meta.keys())[:50]}))

    return issues


def validate_state(ss: Dict[str, Any]) -> List[SentinelIssue]:
    issues: List[SentinelIssue] = []
    pr_state = ss.get("_pr_state", "IDLE")
    scan_running = bool(ss.get("_scan_running", False))
    scan_req = ss.get("_scan_requested_at")
    scan_started = ss.get("_scan_started_at")

    if scan_running and not scan_req and not scan_started and pr_state != "SCANNING":
        issues.append(SentinelIssue(
            "STATE_STUCK_FLAG",
            "_scan_running True ama request/started yok. Sidebar 'Tarama çalışıyor' takılabilir.",
            {"_pr_state": pr_state, "_scan_running": scan_running, "_scan_requested_at": scan_req, "_scan_started_at": scan_started},
        ))

    if pr_state == "SCANNING" and not scan_running:
        issues.append(SentinelIssue(
            "STATE_INCONSISTENT",
            "_pr_state=SCANNING ama _scan_running False.",
            {"_pr_state": pr_state, "_scan_running": scan_running},
        ))

    return issues
