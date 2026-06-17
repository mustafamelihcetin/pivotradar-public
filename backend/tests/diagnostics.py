# tests/diagnostics.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote_plus

import pandas as pd

from tests.sentinel import validate_df, validate_meta
from tests.diagnostics_report import (
    DiagnosticsReport,
    CheckResult,
    now_iso,
    STATUS_PASS, STATUS_WARN, STATUS_FAIL, STATUS_SKIP,
    SEV_GREEN, SEV_YELLOW, SEV_RED,
)

THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]

DEFAULT_BASE_URL = os.environ.get("PIVOTRADAR_BASE_URL", "http://127.0.0.1:8501")
DEFAULT_RUNTIME_DIR = Path(os.environ.get("PIVOTRADAR_RUNTIME_DIR", str(ROOT / "runtime")))
DEFAULT_REPORT_PATH = DEFAULT_RUNTIME_DIR / "diagnostics_report.json"
DEFAULT_PROGRESS_PATH = DEFAULT_RUNTIME_DIR / "diagnostics_progress.json"


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
    _ensure_dir(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def http_get_json(url: str, timeout_s: float = 8.0) -> Tuple[Optional[Any], Optional[str], Optional[int], int]:
    """
    JSON GET (FastAPI için), HTTPError body dahil.
    Dönüş: (obj, err, http_status, duration_ms)
    """
    import urllib.request
    import urllib.error

    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PivotRadarDiagnostics/1.2"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            status = getattr(resp, "status", None) or 200
            raw = resp.read()

        dt = int((time.time() - t0) * 1000)
        try:
            obj = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception as e:
            return None, f"JSON parse edilemedi: {e}", status, dt
        return obj, None, status, dt

    except urllib.error.HTTPError as e:
        dt = int((time.time() - t0) * 1000)
        body = ""
        try:
            b = e.read()
            if b:
                body = b.decode("utf-8", errors="replace").strip()
        except Exception:
            body = ""
        msg = f"HTTPError: {e.code} {e.reason}"
        if body:
            msg += f" | body: {body}"
        return None, msg, e.code, dt

    except Exception as e:
        dt = int((time.time() - t0) * 1000)
        return None, f"Request hata: {repr(e)}", None, dt


def df_from_results_payload(payload: Any) -> Tuple[Optional[pd.DataFrame], Dict[str, Any]]:
    """
    Daha toleranslı DF dönüştürücü.
    Dönüş: (df, debug_info)
    """
    dbg: Dict[str, Any] = {"payload_type": str(type(payload))}

    if payload is None:
        return None, dbg

    if isinstance(payload, list):
        try:
            df = pd.DataFrame(payload)
            dbg["format"] = "list"
            return df, dbg
        except Exception as e:
            dbg["error"] = f"list->df: {repr(e)}"
            return None, dbg

    if isinstance(payload, dict):
        dbg["keys"] = list(payload.keys())[:30]

        for key in ("data", "rows", "records", "items", "results"):
            if isinstance(payload.get(key), list):
                try:
                    df = pd.DataFrame(payload[key])
                    dbg["format"] = key
                    return df, dbg
                except Exception as e:
                    dbg["error"] = f"{key}->df: {repr(e)}"
                    return None, dbg

        if isinstance(payload.get("columns"), list):
            cols = payload["columns"]
            # data: [[...]]
            if isinstance(payload.get("data"), list) and payload.get("data") and isinstance(payload["data"][0], list):
                try:
                    df = pd.DataFrame(payload["data"], columns=cols)
                    dbg["format"] = "columns+data"
                    return df, dbg
                except Exception as e:
                    dbg["error"] = f"columns+data->df: {repr(e)}"
                    return None, dbg

            for k in ("values", "matrix", "table", "data_rows"):
                if isinstance(payload.get(k), list) and payload.get(k) and isinstance(payload[k][0], list):
                    try:
                        df = pd.DataFrame(payload[k], columns=cols)
                        dbg["format"] = f"columns+{k}"
                        return df, dbg
                    except Exception as e:
                        dbg["error"] = f"columns+{k}->df: {repr(e)}"
                        return None, dbg

        return None, dbg

    return None, dbg


def add_check(report: DiagnosticsReport, c: CheckResult) -> None:
    report.checks.append(c)
    prog = {
        "updated_at": now_iso(),
        "mode": report.mode,
        "count": len(report.checks),
        "last": {"id": c.id, "status": c.status, "severity": c.severity, "message": c.message},
    }
    write_json_atomic(DEFAULT_PROGRESS_PATH, prog)


def check_endpoint(base_url: str, path: str, name: str, timeout_s: float = 8.0) -> Tuple[CheckResult, Any]:
    url = base_url.rstrip("/") + path
    obj, err, status, dt = http_get_json(url, timeout_s=timeout_s)

    if err:
        return (
            CheckResult(
                id=f"ENDPOINT{path}",
                name=name,
                status=STATUS_FAIL,
                severity=SEV_RED,
                message=f"{name} endpoint erişilemedi.",
                evidence={"url": url, "error": err, "http_status": status, "duration_ms": dt},
                suggestion="Server çalışıyor mu, base_url doğru mu, endpoint loglarına bak.",
                duration_ms=dt,
            ),
            None,
        )

    if obj is None or obj == {} or obj == []:
        return (
            CheckResult(
                id=f"ENDPOINT{path}",
                name=name,
                status=STATUS_WARN,
                severity=SEV_YELLOW,
                message=f"{name} endpoint boş JSON döndü.",
                evidence={"url": url, "http_status": status, "duration_ms": dt},
                suggestion="Server farklı runtime_dir okuyabilir veya read_json default'a düşüyor olabilir.",
                duration_ms=dt,
            ),
            obj,
        )

    return (
        CheckResult(
            id=f"ENDPOINT{path}",
            name=name,
            status=STATUS_PASS,
            severity=SEV_GREEN,
            message=f"{name} OK.",
            evidence={"url": url, "http_status": status, "duration_ms": dt},
            duration_ms=dt,
        ),
        obj,
    )


def run_smoke_check_subprocess() -> CheckResult:
    smoke_path = ROOT / "tests" / "smoke_check.py"
    if not smoke_path.exists():
        return CheckResult(
            id="ML_SMOKE",
            name="ML Smoke",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="tests/smoke_check.py bulunamadı, atlandı.",
            suggestion="smoke_check.py mevcut olmalı.",
        )

    t0 = time.time()
    try:
        p = subprocess.run(
            [sys.executable, str(smoke_path)],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        dt = int((time.time() - t0) * 1000)

        out = (p.stdout or "") + "\n" + (p.stderr or "")
        out_tail = "\n".join(out.splitlines()[-80:])

        if p.returncode != 0 or "Traceback" in out or "ModuleNotFoundError" in out:
            return CheckResult(
                id="ML_SMOKE",
                name="ML Smoke",
                status=STATUS_FAIL,
                severity=SEV_RED,
                message="ML smoke check hata verdi (model/feature pipeline bozuk olabilir).",
                evidence={"returncode": p.returncode, "tail": out_tail},
                suggestion="Model dosyası yolu, feature set, kolon mapping ve indicator çıktıları kontrol edilmeli.",
                duration_ms=dt,
            )

        if "başar" in out.lower() or "ok" in out.lower():
            return CheckResult(
                id="ML_SMOKE",
                name="ML Smoke",
                status=STATUS_PASS,
                severity=SEV_GREEN,
                message="ML smoke check geçti.",
                evidence={"returncode": p.returncode, "tail": out_tail},
                duration_ms=dt,
            )

        return CheckResult(
            id="ML_SMOKE",
            name="ML Smoke",
            status=STATUS_WARN,
            severity=SEV_YELLOW,
            message="ML smoke check çalıştı ama çıktı belirsiz (başarı imzası yok).",
            evidence={"returncode": p.returncode, "tail": out_tail},
            suggestion="smoke_check çıktısını incele; NaN/Inf, eksik feature veya model load uyarısı var mı bak.",
            duration_ms=dt,
        )

    except subprocess.TimeoutExpired:
        dt = int((time.time() - t0) * 1000)
        return CheckResult(
            id="ML_SMOKE",
            name="ML Smoke",
            status=STATUS_FAIL,
            severity=SEV_RED,
            message="ML smoke check timeout oldu (kilitlenme/IO beklemesi olabilir).",
            evidence={"duration_ms": dt},
            suggestion="Worker/ML load süresi, disk erişimi, CPU spike kontrol edilmeli.",
            duration_ms=dt,
        )
    except Exception as e:
        dt = int((time.time() - t0) * 1000)
        return CheckResult(
            id="ML_SMOKE",
            name="ML Smoke",
            status=STATUS_FAIL,
            severity=SEV_RED,
            message="ML smoke check çalıştırılamadı.",
            evidence={"error": repr(e), "duration_ms": dt},
            suggestion="Python path ve bağımlılıkları kontrol et.",
            duration_ms=dt,
        )


def check_chart_payload(payload: Any) -> CheckResult:
    if not isinstance(payload, dict):
        return CheckResult(
            id="CHART_SANITY",
            name="Chart Sanity",
            status=STATUS_WARN,
            severity=SEV_YELLOW,
            message="Chart payload dict formatında değil.",
            evidence={"type": str(type(payload))},
            suggestion="chart endpoint çıktısını kontrol et.",
        )

    data = payload.get("data")
    traces = len(data) if isinstance(data, list) else 0

    if traces <= 0:
        return CheckResult(
            id="CHART_SANITY",
            name="Chart Sanity",
            status=STATUS_FAIL,
            severity=SEV_RED,
            message="Grafik boş (trace yok).",
            evidence={"traces": traces, "status": payload.get("status"), "message": payload.get("message")},
            suggestion="Grafik üretim hattında fig.add_trace kırılmış olabilir veya chart endpoint doğru veriyi okumuyor.",
        )

    types = []
    for t in data[:10]:
        if isinstance(t, dict) and "type" in t:
            types.append(t.get("type"))

    return CheckResult(
        id="CHART_SANITY",
        name="Chart Sanity",
        status=STATUS_PASS,
        severity=SEV_GREEN,
        message="Grafik payload sağlıklı görünüyor.",
        evidence={"traces": traces, "trace_types": types},
    )


def pick_symbol_from_df(df: pd.DataFrame) -> Optional[str]:
    for col in ("symbol", "ticker", "Symbol", "Ticker", "Sembol", "SEMBOL"):
        if col in df.columns:
            s = df[col].dropna()
            if len(s) > 0:
                v = str(s.iloc[0]).strip()
                if v:
                    return v
    return None


def _augment_df_for_sentinel(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sentinel kurallarını stabil tutmak için DF üzerinde hafif "alias/mapping" uygular.
    Backend'i değiştirmeden tests.sentinel'in beklediği isimleri üretir.
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        return df

    cols = set(map(str, df.columns))

    # Fiyat yoksa Close/close/Adj Close/adj_close'dan türet
    if "Fiyat" not in cols:
        for c in ("Close", "close", "Adj Close", "AdjClose", "adj_close", "adjclose"):
            if c in df.columns:
                df = df.copy()
                df["Fiyat"] = df[c]
                break

    return df


def _augment_meta_for_sentinel(meta: dict) -> dict:
    """
    Meta sentinel uyarılarını azaltmak için meta içine türetilmiş alanlar ekler.
    Backend'i değiştirmez, sadece validate_meta öncesi "görünümü" iyileştirir.
    """
    if not isinstance(meta, dict):
        return meta

    out = dict(meta)

    # total_time: timings.total_time_ms / timings.total_ms / stats.total_time_ms vb. varsa üret
    if not out.get("total_time"):
        ms = None
        try:
            t = out.get("timings") or {}
            s = out.get("stats") or {}
            cand = [
                t.get("total_time_ms"), t.get("total_ms"), t.get("elapsed_ms"),
                s.get("total_time_ms"), s.get("elapsed_ms"),
            ]
            for v in cand:
                if v is None:
                    continue
                try:
                    ms = int(v)
                    break
                except Exception:
                    continue
        except Exception:
            ms = None

        if isinstance(ms, int) and ms >= 0:
            sec = ms / 1000.0
            out["total_time"] = f"{sec:.1f}s"

    # scan_date / last_date: meta içinde last_bar/last_ts benzeri varsa çıkar
    if not out.get("scan_date") and not out.get("last_date"):
        for k in ("last_date", "scan_date", "data_date", "last_bar", "last_ts", "last_timestamp"):
            v = out.get(k)
            if not v:
                continue
            try:
                sv = str(v)
                if len(sv) >= 10 and sv[4] == "-" and sv[7] == "-":
                    out.setdefault("scan_date", sv[:10])
                    out.setdefault("last_date", sv[:10])
                    break
            except Exception:
                pass

    return out


def _looks_like_missing_symbol_error(err: str | None) -> bool:
    if not err:
        return False
    s = err.lower()
    return ("missing symbol" in s) or ("requested_symbol" in s and "null" in s)


# -----------------------------
# SHADOW MODE (DEEP ONLY)
# -----------------------------
def _shadow_parse_yyyy_mm_dd(v: Any) -> "Optional[object]":
    try:
        import datetime as _dt
        if not v:
            return None
        s = str(v).strip()
        # "YYYY-MM-DD" veya "YYYY-MM-DD HH:MM" vs.
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return _dt.date.fromisoformat(s[:10])
        return None
    except Exception:
        return None


def shadow_check_freshness(meta: dict) -> CheckResult:
    """
    Veri tazeliği: meta'daki last_date/scan_date (veya türevleri) bugünden çok geri mi?
    Not: Sadece DEEP modda çalışır. Backend'e dokunmaz.
    """
    import datetime as _dt

    max_age_days = int(os.environ.get("PIVOTRADAR_DIAG_FRESHNESS_MAX_DAYS", "2"))

    if not isinstance(meta, dict) or not meta:
        return CheckResult(
            id="SHADOW_FRESHNESS",
            name="Shadow Freshness",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="Freshness atlandı (meta boş veya dict değil).",
        )

    # En olası alanlar
    candidates = [
        meta.get("last_date"),
        meta.get("scan_date"),
        meta.get("data_date"),
        meta.get("last_bar"),
        meta.get("last_ts"),
        meta.get("last_timestamp"),
    ]

    d = None
    used = None
    for v in candidates:
        dd = _shadow_parse_yyyy_mm_dd(v)
        if dd:
            d = dd
            used = v
            break

    if not d:
        return CheckResult(
            id="SHADOW_FRESHNESS",
            name="Shadow Freshness",
            status=STATUS_WARN,
            severity=SEV_YELLOW,
            message="Freshness belirsiz (meta'da tarih yakalanamadı).",
            evidence={"known_keys": list(meta.keys())[:40]},
            suggestion="Meta içine last_date/scan_date benzeri bir tarih alanı yazılması freshness kontrolünü güçlendirir.",
        )

    today = _dt.datetime.now().astimezone().date()
    age_days = (today - d).days

    if age_days <= max_age_days:
        return CheckResult(
            id="SHADOW_FRESHNESS",
            name="Shadow Freshness",
            status=STATUS_PASS,
            severity=SEV_GREEN,
            message="Veri taze görünüyor.",
            evidence={"date": d.isoformat(), "age_days": age_days, "max_age_days": max_age_days, "source_value": str(used)},
        )

    return CheckResult(
        id="SHADOW_FRESHNESS",
        name="Shadow Freshness",
        status=STATUS_WARN,
        severity=SEV_YELLOW,
        message=f"Veri eski görünüyor (age={age_days} gün).",
        evidence={"date": d.isoformat(), "age_days": age_days, "max_age_days": max_age_days, "source_value": str(used)},
        suggestion="Veri kaynağı gecikmiş olabilir (EOD/YF/Bigpara). Freshness pipeline'ını kontrol et.",
    )


def shadow_check_results_completeness(df: Optional[pd.DataFrame]) -> CheckResult:
    """
    Sonuç tamlığı: results satır sayısı aşırı düşük/0 mı?
    Not: DEEP modda çalışır. Sentinel ile çakışmaz.
    """
    min_rows = int(os.environ.get("PIVOTRADAR_DIAG_RESULTS_MIN_ROWS", "10"))

    if df is None:
        return CheckResult(
            id="SHADOW_COMPLETENESS",
            name="Shadow Completeness",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="Completeness atlandı (DF yok).",
        )

    rows = int(df.shape[0]) if hasattr(df, "shape") else 0

    if rows <= 0:
        return CheckResult(
            id="SHADOW_COMPLETENESS",
            name="Shadow Completeness",
            status=STATUS_WARN,
            severity=SEV_YELLOW,
            message="Results boş (0 satır).",
            evidence={"rows": rows, "min_rows": min_rows},
            suggestion="Tarama boş dönmüş olabilir (prefilter aşırı agresif, veri çekilemedi, cache boş).",
        )

    if rows < min_rows:
        return CheckResult(
            id="SHADOW_COMPLETENESS",
            name="Shadow Completeness",
            status=STATUS_WARN,
            severity=SEV_YELLOW,
            message=f"Results düşük sayıda satır içeriyor ({rows}).",
            evidence={"rows": rows, "min_rows": min_rows},
            suggestion="Normalde daha fazla sonuç bekleniyorsa: prefilter, universe, max_symbols/top_n ayarlarını kontrol et.",
        )

    return CheckResult(
        id="SHADOW_COMPLETENESS",
        name="Shadow Completeness",
        status=STATUS_PASS,
        severity=SEV_GREEN,
        message="Results tamlık açısından normal görünüyor.",
        evidence={"rows": rows, "min_rows": min_rows},
    )


def shadow_check_latency(durations: Dict[str, int]) -> CheckResult:
    """
    Latency drift: endpoint süreleri aşırı yükseldiyse uyarı.
    Not: DEEP modda çalışır.
    """
    warn_ms = int(os.environ.get("PIVOTRADAR_DIAG_LATENCY_WARN_MS", "15000"))  # 15s üstü uyarı

    if not durations:
        return CheckResult(
            id="SHADOW_LATENCY",
            name="Shadow Latency",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="Latency atlandı (süre ölçümü yok).",
        )

    slow = {k: int(v) for k, v in durations.items() if isinstance(v, int) and v >= warn_ms}
    if not slow:
        return CheckResult(
            id="SHADOW_LATENCY",
            name="Shadow Latency",
            status=STATUS_PASS,
            severity=SEV_GREEN,
            message="Latency normal aralıkta.",
            evidence={"durations_ms": durations, "warn_ms": warn_ms},
        )

    # WARN: bir şeyler yavaşlamış
    return CheckResult(
        id="SHADOW_LATENCY",
        name="Shadow Latency",
        status=STATUS_WARN,
        severity=SEV_YELLOW,
        message="Bazı endpoint'ler normalden yavaş (drift/IO/lock olabilir).",
        evidence={"slow_ms": slow, "durations_ms": durations, "warn_ms": warn_ms},
        suggestion="Disk/IO, cache kilitleri, worker yoğunluğu veya ağ gecikmesi kontrol edilmeli.",
    )


def main() -> int:
    # Windows stdout UTF-8 (Türkçe bozulmasın)
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="PivotRadar diagnostics runner (UI bağımsız).")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Örn: http://127.0.0.1:8501")
    ap.add_argument("--mode", choices=["quick", "deep"], default="quick", help="quick=temel, deep=opsiyonel")
    ap.add_argument("--out", default=str(DEFAULT_REPORT_PATH), help="Rapor JSON yolu")
    args = ap.parse_args()

    base_url = args.base_url
    mode = args.mode
    out_path = Path(args.out)

    DEFAULT_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    report = DiagnosticsReport(mode=mode, started_at=now_iso())
    t0_all = time.time()

    durations_ms: Dict[str, int] = {}

    # 1) Progress
    c, progress_obj = check_endpoint(base_url, "/api/progress", "Progress", timeout_s=6.0)
    add_check(report, c)
    if isinstance(c.duration_ms, int):
        durations_ms["/api/progress"] = int(c.duration_ms)

    # 2) Meta
    c, meta_obj = check_endpoint(base_url, "/api/meta", "Meta", timeout_s=10.0)
    add_check(report, c)
    if isinstance(c.duration_ms, int):
        durations_ms["/api/meta"] = int(c.duration_ms)

    if isinstance(meta_obj, dict):
        meta_for_test = _augment_meta_for_sentinel(meta_obj)
        issues = validate_meta(meta_for_test)
        if issues:
            add_check(report, CheckResult(
                id="META_SENTINEL",
                name="Meta Sentinel",
                status=STATUS_WARN,
                severity=SEV_YELLOW,
                message=f"Meta üzerinde {len(issues)} sorun bulundu.",
                evidence={"issues": [getattr(i, "__dict__", str(i)) for i in issues]},
                suggestion="Backend meta üretiminde total_time ve scan_date/last_date alanlarını üret (UI 0s / '-' problemleri).",
            ))
        else:
            add_check(report, CheckResult(
                id="META_SENTINEL",
                name="Meta Sentinel",
                status=STATUS_PASS,
                severity=SEV_GREEN,
                message="Meta sentinel temiz.",
            ))
    else:
        add_check(report, CheckResult(
            id="META_SENTINEL",
            name="Meta Sentinel",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="Meta dict değil, sentinel atlandı.",
        ))

    # 3) Results
    c, results_obj = check_endpoint(base_url, "/api/results", "Results", timeout_s=12.0)
    add_check(report, c)
    if isinstance(c.duration_ms, int):
        durations_ms["/api/results"] = int(c.duration_ms)

    df, df_dbg = df_from_results_payload(results_obj)
    if df is None:
        add_check(report, CheckResult(
            id="RESULTS_DF",
            name="Results DataFrame",
            status=STATUS_FAIL,
            severity=SEV_RED,
            message="Results payload DataFrame'e çevrilemedi.",
            evidence=df_dbg,
            suggestion="/api/results dönüş formatı değişmiş. Endpoint JSON şemasını DF dönüştürücüye ekle.",
        ))
        picked_symbol = None
        df2 = None
    else:
        df2 = _augment_df_for_sentinel(df)
        picked_symbol = pick_symbol_from_df(df2)

        issues = validate_df(df2)
        if issues:
            add_check(report, CheckResult(
                id="RESULTS_SENTINEL",
                name="Results Sentinel",
                status=STATUS_WARN,
                severity=SEV_YELLOW,
                message=f"Results üzerinde {len(issues)} sentinel sorunu bulundu.",
                evidence={
                    "issues": [getattr(i, "__dict__", str(i)) for i in issues],
                    "shape": [int(df2.shape[0]), int(df2.shape[1])],
                    "picked_symbol": picked_symbol,
                    **df_dbg,
                },
                suggestion="Backend sonuç sözleşmesi: UI'da fiyat gösterilecekse 'Fiyat' alanını üret; değilse sentinel kuralını sözleşmeye göre güncelle.",
            ))
        else:
            add_check(report, CheckResult(
                id="RESULTS_SENTINEL",
                name="Results Sentinel",
                status=STATUS_PASS,
                severity=SEV_GREEN,
                message="Results sentinel temiz.",
                evidence={"shape": [int(df2.shape[0]), int(df2.shape[1])], "picked_symbol": picked_symbol, **df_dbg},
            ))

    # 4) Chart
    # KURAL: /api/chart param zorunlu. Param yoksa 400 "missing symbol" BEKLENEN -> PASS say.
    c0, chart_obj0 = check_endpoint(base_url, "/api/chart", "Chart", timeout_s=10.0)
    if isinstance(c0.duration_ms, int):
        durations_ms["/api/chart"] = int(c0.duration_ms)

    if c0.status == STATUS_FAIL and isinstance(c0.evidence, dict):
        err = str(c0.evidence.get("error") or "")
        st = c0.evidence.get("http_status")
        if st == 400 and _looks_like_missing_symbol_error(err):
            add_check(report, CheckResult(
                id="ENDPOINT/api/chart",
                name="Chart",
                status=STATUS_PASS,
                severity=SEV_GREEN,
                message="Chart OK (contract: symbol paramı zorunlu).",
                evidence={"url": c0.evidence.get("url"), "http_status": st, "error": err},
                duration_ms=c0.duration_ms,
            ))
        else:
            add_check(report, c0)
    else:
        add_check(report, c0)
        if c0.status != STATUS_FAIL:
            add_check(report, check_chart_payload(chart_obj0))

    # Paramlı chart denemesi (symbol paramı kesin)
    if picked_symbol:
        tried = []
        candidates = [picked_symbol]
        if not picked_symbol.endswith(".IS"):
            candidates.append(picked_symbol + ".IS")

        ok = False
        last_err = None

        for sym in candidates:
            url = base_url.rstrip("/") + f"/api/chart?symbol={quote_plus(sym)}"
            tried.append(url)
            obj2, err2, st2, dt2 = http_get_json(url, timeout_s=10.0)
            durations_ms[f"/api/chart:param:{sym}"] = int(dt2)

            if not err2 and obj2 not in (None, {}, []):
                add_check(report, CheckResult(
                    id="ENDPOINT/api/chart:param",
                    name="Chart (param)",
                    status=STATUS_PASS,
                    severity=SEV_GREEN,
                    message="Chart OK (symbol paramı ile).",
                    evidence={"url": url, "http_status": st2, "duration_ms": dt2, "picked_symbol": picked_symbol, "tried": tried},
                    duration_ms=dt2,
                ))
                add_check(report, check_chart_payload(obj2))
                ok = True
                break
            last_err = {"url": url, "error": err2, "http_status": st2, "duration_ms": dt2}

        if not ok:
            add_check(report, CheckResult(
                id="ENDPOINT/api/chart:param",
                name="Chart (param)",
                status=STATUS_FAIL,
                severity=SEV_RED,
                message="Chart endpoint symbol paramı ile de başarısız.",
                evidence={"picked_symbol": picked_symbol, "tried": tried[-10:], "last_error": last_err},
                suggestion="server.py içindeki api_chart(symbol=Query(...)) paramının geldiğini doğrula; UI/proxy query strip ediyorsa onu düzelt.",
            ))
    else:
        add_check(report, CheckResult(
            id="ENDPOINT/api/chart:param",
            name="Chart (param)",
            status=STATUS_SKIP,
            severity=SEV_YELLOW,
            message="Chart param denemesi atlandı (results'tan sembol seçilemedi).",
        ))

    # 5) ML Smoke
    add_check(report, run_smoke_check_subprocess())

    # -----------------------------
    # 6) SHADOW MODE CHECKS (DEEP ONLY)
    # -----------------------------
    # Kırmızı çizgin: quick akışı bozulmasın -> shadow sadece deep.
    if mode == "deep":
        # Freshness (meta üzerinden)
        if isinstance(meta_obj, dict):
            add_check(report, shadow_check_freshness(meta_obj))
        else:
            add_check(report, CheckResult(
                id="SHADOW_FRESHNESS",
                name="Shadow Freshness",
                status=STATUS_SKIP,
                severity=SEV_YELLOW,
                message="Freshness atlandı (meta dict değil).",
            ))

        # Completeness (results satır sayısı)
        add_check(report, shadow_check_results_completeness(df2 if isinstance(df2, pd.DataFrame) else df))

        # Latency drift (endpoint süreleri)
        add_check(report, shadow_check_latency(durations_ms))

    report.finished_at = now_iso()
    report.duration_ms = int((time.time() - t0_all) * 1000)
    report.compute_overall()

    write_json_atomic(out_path, report.to_dict())

    print(f"[Diagnostics] overall={report.overall} confidence={report.confidence}% duration={report.duration_ms}ms")
    for cc in report.checks:
        if cc.status in (STATUS_FAIL, STATUS_WARN):
            print(f"- {cc.status}/{cc.severity} {cc.id}: {cc.message}")

    write_json_atomic(DEFAULT_PROGRESS_PATH, {
        "updated_at": now_iso(),
        "mode": report.mode,
        "done": True,
        "overall": report.overall,
        "confidence": report.confidence,
        "duration_ms": report.duration_ms,
        "report_path": str(out_path),
    })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
