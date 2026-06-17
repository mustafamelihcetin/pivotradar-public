# backend/app/features/admin/diagnostics.py
"""
Sistem Tanılama Merkezi.

14 bağımsız check, ThreadPoolExecutor ile paralel çalışır.
Her check kendi DB session'ını açar — SQLAlchemy thread-safety.

Gruplar: ML · Altyapı · Veri · Uygulama · Ağ
"""
from __future__ import annotations

import os
import time
import datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.time_utils import now_utc, isoformat_z


# ── DB session factory ────────────────────────────────────────────────────────
def _db_session():
    from app.core.database import SessionLocal
    return SessionLocal()


# ── Güvenli check sarmalayıcı ─────────────────────────────────────────────────
def _run(name: str, group: str, fn) -> Dict[str, Any]:
    t0 = time.monotonic()
    try:
        result = fn()
        ms = round((time.monotonic() - t0) * 1000)
        return {
            "name":    name,
            "group":   group,
            "status":  result.get("status", "ok"),
            "message": result.get("message", ""),
            "details": result.get("details"),
            "ms":      ms,
        }
    except Exception as exc:
        ms = round((time.monotonic() - t0) * 1000)
        return {
            "name":    name,
            "group":   group,
            "status":  "fail",
            "message": f"İstisna: {exc}",
            "details": {"error": str(exc)},
            "ms":      ms,
        }


# ── Model path çözümleyici ───────────────────────────────────────────────────
def _find_model_path() -> tuple:
    """
    Eğitilmiş modeli mutlak path olarak bulur.
    Öncelik: /app/models/ → cwd/models/ → assets/ (bundled fallback)
    """
    candidates = [
        Path("/app/models/ml_latest.joblib"),
        Path(os.getcwd()) / "models" / "ml_latest.joblib",
        Path("/app/assets/models/ml_latest.joblib"),
        Path(os.getcwd()) / "assets" / "models" / "ml_latest.joblib",
    ]
    for p in candidates:
        if p.exists():
            meta = p.parent / (p.name + ".meta.json")
            return p.resolve(), (meta.resolve() if meta.exists() else None)
    return None, None


# ── A: Altyapı ───────────────────────────────────────────────────────────────

def _check_database() -> Dict:
    from sqlalchemy import text
    from app.features.scanner.models import ScanScore, SymbolDataCache
    db = _db_session()
    try:
        t0 = time.monotonic()
        db.execute(text("SELECT 1"))
        lat = (time.monotonic() - t0) * 1000
        scan_count  = db.query(ScanScore).count()
        cache_count = db.query(SymbolDataCache).count()
        status = "ok" if lat < 100 else ("warning" if lat < 300 else "fail")
        return {
            "status":  status,
            "message": f"Bağlantı başarılı. Sorgu: {lat:.1f}ms. "
                       f"scan_scores: {scan_count:,}, cache: {cache_count:,} satır.",
            "details": {"latency_ms": round(lat, 2), "scan_rows": scan_count, "cache_rows": cache_count},
        }
    finally:
        db.close()


def _check_db_locks() -> Dict:
    from sqlalchemy import text
    db = _db_session()
    try:
        stale  = db.execute(text("SELECT COUNT(*) FROM system_locks WHERE expires_at < NOW()")).scalar() or 0
        active = db.execute(text("SELECT COUNT(*) FROM system_locks WHERE expires_at >= NOW()")).scalar() or 0
        if stale > 0:
            return {
                "status":  "warning",
                "message": f"{stale} süresi dolmuş kilit var. {active} aktif kilit.",
                "details": {"stale_locks": stale, "active_locks": active},
            }
        return {
            "status":  "ok",
            "message": f"Süresi dolmuş kilit yok. {active} aktif kilit.",
            "details": {"stale_locks": 0, "active_locks": active},
        }
    finally:
        db.close()


def _check_redis() -> Dict:
    from app.core.redis_client import get_redis, is_available
    if not is_available():
        return {
            "status":  "warning",
            "message": "Redis yok — in-memory fallback aktif. JTI blacklist ve rate limiter devre dışı.",
            "details": {"available": False},
        }
    r = get_redis()
    t0 = time.monotonic()
    r.ping()
    lat = (time.monotonic() - t0) * 1000
    key = "_diag_rw_test"
    r.set(key, "1", ex=5)
    ok = r.get(key) == "1"
    r.delete(key)
    return {
        "status":  "ok" if ok else "warning",
        "message": f"Redis bağlı. Ping: {lat:.1f}ms. R/W: {'OK' if ok else 'BAŞARISIZ'}.",
        "details": {"latency_ms": round(lat, 2), "rw_ok": ok},
    }


def _check_system_resources() -> Dict:
    import psutil
    mem  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu  = psutil.cpu_percent(interval=0.3)
    swap = psutil.swap_memory()

    issues, status = [], "ok"
    if mem.percent  >= 90: issues.append(f"RAM kritik %{mem.percent:.0f}");  status = "fail"
    elif mem.percent >= 80: issues.append(f"RAM yüksek %{mem.percent:.0f}"); status = "warning"
    if disk.percent >= 90: issues.append(f"Disk kritik %{disk.percent:.0f}"); status = "fail"
    elif disk.percent >= 80: issues.append(f"Disk dolu %{disk.percent:.0f}"); status = "warning"
    if cpu          >= 95: issues.append(f"CPU kritik %{cpu:.0f}");          status = "fail"
    elif cpu        >= 80: issues.append(f"CPU yüksek %{cpu:.0f}");          status = "warning"

    base = (f"RAM %{mem.percent:.0f} ({mem.used/1e9:.1f}/{mem.total/1e9:.1f} GB), "
            f"Disk %{disk.percent:.0f} ({disk.free/1e9:.1f} GB boş), CPU %{cpu:.0f}")
    return {
        "status":  status,
        "message": (" | ".join(issues) + " — " + base) if issues else base,
        "details": {
            "ram_pct":      round(mem.percent, 1),
            "ram_used_gb":  round(mem.used   / 1e9, 2),
            "ram_total_gb": round(mem.total  / 1e9, 2),
            "disk_pct":     round(disk.percent, 1),
            "disk_free_gb": round(disk.free  / 1e9, 1),
            "cpu_pct":      round(cpu, 1),
            "swap_pct":     round(swap.percent, 1),
        },
    }


# ── B: Veri ──────────────────────────────────────────────────────────────────

def _check_cache_freshness() -> Dict:
    from app.features.scanner.models import SymbolDataCache
    db = _db_session()
    try:
        row = db.query(SymbolDataCache).order_by(SymbolDataCache.scanned_at.desc()).first()
        if not row:
            return {"status": "fail", "message": "SymbolDataCache boş — hiç tarama yapılmamış.", "details": {"count": 0}}
        now    = dt.datetime.now(dt.timezone.utc)
        sc_at  = row.scanned_at
        if sc_at.tzinfo is None:
            sc_at = sc_at.replace(tzinfo=dt.timezone.utc)
        age_h  = (now - sc_at).total_seconds() / 3600
        count  = db.query(SymbolDataCache).count()
        st     = "fail" if age_h > 48 else ("warning" if age_h > 26 else "ok")
        label  = "Kritik eski" if st == "fail" else ("Eski" if st == "warning" else "Taze")
        return {
            "status":  st,
            "message": f"{label} — son güncelleme {age_h:.1f} saat önce. Toplam: {count:,} sembol.",
            "details": {"age_hours": round(age_h, 1), "symbol_count": count},
        }
    finally:
        db.close()


def _check_profile_cache() -> Dict:
    from sqlalchemy import text
    db = _db_session()
    try:
        try:
            from app.features.scanner.routers.api_scan import _ALL_PROFILES
        except ImportError:
            return {"status": "ok", "message": "Profil listesi yüklenemedi — atlandı."}
        rows    = db.execute(text("SELECT profile_name FROM profile_score_cache WHERE expires_at > NOW()")).fetchall()
        cached  = {r[0] for r in rows}
        missing = [p for p in _ALL_PROFILES if p not in cached]
        total   = len(_ALL_PROFILES)
        if not missing:
            return {"status": "ok", "message": f"Tüm {total} profil cache'te mevcut.", "details": {"cached": total, "missing": 0}}
        return {
            "status":  "warning",
            "message": f"{len(missing)}/{total} profil cache'te yok: {', '.join(missing[:4])}{'…' if len(missing) > 4 else ''}",
            "details": {"cached": total - len(missing), "missing": len(missing)},
        }
    finally:
        db.close()


# ── C: ML ────────────────────────────────────────────────────────────────────

def _check_ml_model_file() -> Dict:
    from app.features.scoring.ml.constants import FEATURE_SCHEMA_VERSION, MIN_VAL_AUC, MAX_ECE
    import json

    model_path, meta_path = _find_model_path()
    if model_path is None:
        return {
            "status":  "fail",
            "message": "ml_latest.joblib bulunamadı — sistem kural tabanlı modda çalışıyor.",
            "details": {"searched": "models/ ve assets/models/"},
        }

    age_h   = (time.time() - model_path.stat().st_mtime) / 3600
    size_mb = model_path.stat().st_size / 1e6
    details: Dict[str, Any] = {
        "path":    str(model_path),
        "age_h":   round(age_h, 1),
        "size_mb": round(size_mb, 2),
        "meta_ok": meta_path is not None,
    }

    issues, status = [], "ok"

    if meta_path is None:
        issues.append("meta.json eksik"); status = "warning"
    else:
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            schema_ver = meta.get("feature_schema_version")
            auc        = meta.get("val_auc")
            ece        = meta.get("val_ece")
            n_train    = meta.get("n_train", 0)
            details.update({
                "schema_version":  schema_ver,
                "current_schema":  FEATURE_SCHEMA_VERSION,
                "val_auc":         auc,
                "val_ece":         ece,
                "n_train":         n_train,
            })
            if schema_ver is not None and schema_ver != FEATURE_SCHEMA_VERSION:
                issues.append(f"Schema V{schema_ver} ≠ mevcut V{FEATURE_SCHEMA_VERSION}")
                status = "warning"
            if auc is not None and auc < MIN_VAL_AUC:
                issues.append(f"AUC {auc:.3f} < eşik {MIN_VAL_AUC}")
                if status == "ok": status = "warning"
            if ece is not None and ece > MAX_ECE:
                issues.append(f"Olasılık sapması {ece:.3f} > eşik {MAX_ECE}")
                if status == "ok": status = "warning"
        except Exception as e:
            issues.append(f"meta.json okunamadı: {e}"); status = "warning"

    if age_h > 168:
        issues.append(f"Model {int(age_h/24)} gündür güncellenmemiş")
        if status == "ok": status = "warning"

    parts = [f"Model bulundu ({size_mb:.1f} MB, {age_h:.0f} sa önce eğitilmiş)"]
    if issues: parts.append("Sorunlar: " + "; ".join(issues))
    return {"status": status, "message": " — ".join(parts), "details": details}


def _check_ml_in_memory() -> Dict:
    cached = None
    try:
        from app.features.scoring.ml.ml_calib import _CACHED, _CACHE_LOCK
        with _CACHE_LOCK:
            cached = _CACHED
    except Exception:
        try:
            from app.features.scoring.ml.ml_calib import _CACHED as cached  # type: ignore[no-redef]
        except Exception:
            pass

    if cached is None:
        try:
            from app.features.scoring.ml.ml_calib import _MODEL_PATH
            file_exists = os.path.exists(_MODEL_PATH)
        except Exception:
            file_exists = False
        if not file_exists:
            return {
                "status":  "warning",
                "message": "Kalibrasyon dosyası (ml_isotonic.json) yok — kalibrasyon henüz yapılmamış.",
                "details": {"cached": False, "file_exists": False},
            }
        return {
            "status":  "ok",
            "message": "Kalibrasyon dosyası mevcut; lazy yükleme bekliyor — ilk tahmin isteğinde aktif olur.",
            "details": {"cached": False, "file_exists": True},
        }

    n = getattr(cached, "n_samples", None) or getattr(cached, "n", None)
    return {
        "status":  "ok",
        "message": f"Kalibrasyon modeli memory'de aktif.{f' {n:,} örnek.' if n else ''}",
        "details": {"cached": True, "n_samples": n},
    }


def _check_ml_inference() -> Dict:
    from app.features.scoring.ml.ai_score import MLScorer, ModelLoadError

    model_path, _ = _find_model_path()
    if model_path is None:
        return {"status": "warning", "message": "Model yok — inference testi atlandı.", "details": {"skipped": True}}

    try:
        t0     = time.monotonic()
        scorer = MLScorer(str(model_path))
        load_ms = (time.monotonic() - t0) * 1000

        from app.features.scoring.ml.constants import RETRAIN_FEATURES
        sample = {f: 0.5 for f in RETRAIN_FEATURES}
        sample.update({"rsi14_x": 55.0, "atr_pct": 2.0, "vol_ratio20": 1.2, "ret_1d": 0.5,
                        "pattern_score": 70.0, "trend": 0.7, "momentum": 0.4})

        t1     = time.monotonic()
        prob   = float(scorer.score(sample))
        inf_ms = (time.monotonic() - t1) * 1000

        # Ham prob 0–1 aralığında olmalı
        prob_ok = 0.0 <= prob <= 1.0
        return {
            "status":  "ok" if prob_ok else "warning",
            "message": (f"Inference başarılı. Yükleme: {load_ms:.0f}ms, Tahmin: {inf_ms:.1f}ms. "
                        f"Örnek çıktı: {prob:.4f}{'  ⚠ beklenen 0–1 aralığı dışı' if not prob_ok else ''}"),
            "details": {
                "load_ms":   round(load_ms, 1),
                "infer_ms":  round(inf_ms,  2),
                "prob_out":  round(prob,     4),
                "prob_valid": prob_ok,
                "features":  len(RETRAIN_FEATURES),
            },
        }
    except ModelLoadError as e:
        return {"status": "fail",    "message": f"MLScorer yüklenemedi: {e}",  "details": {"error": str(e)}}
    except Exception as e:
        return {"status": "fail",    "message": f"Inference hatası: {e}",       "details": {"error": str(e)}}


# ── D: Uygulama ──────────────────────────────────────────────────────────────

def _check_scheduler() -> Dict:
    from app.core.scheduler import scheduler_manager
    if not scheduler_manager.scheduler.running:
        return {"status": "fail", "message": "APScheduler çalışmıyor — zamanlanmış görevler devre dışı!", "details": {"running": False}}
    jobs      = scheduler_manager.get_jobs_info()
    auto_scan = next((j for j in jobs if j["id"] == "auto_scan"), None)
    if not auto_scan:
        return {"status": "warning", "message": f"Scheduler aktif ({len(jobs)} job) ama auto_scan bulunamadı.", "details": {"running": True, "job_count": len(jobs)}}
    next_run = auto_scan.get("next_run_time") or "—"
    return {
        "status":  "ok",
        "message": f"Scheduler aktif. {len(jobs)} job. auto_scan sonraki: {next_run}",
        "details": {"running": True, "job_count": len(jobs), "auto_scan_next": next_run},
    }


def _check_scanner_stuck() -> Dict:
    from app.features.scanner.logic.state import ACTIVE, STATE_LOCK
    with STATE_LOCK:
        started_at = ACTIVE.get("started_at")
        user_email = ACTIVE.get("user_email")

    if started_at is None:
        return {"status": "ok", "message": "Aktif tarama yok — bekleme modunda.", "details": {"active": False}}

    elapsed_m = round((time.time() - started_at) / 60, 1)
    if elapsed_m > 60:
        return {"status": "fail",    "message": f"Tarama {elapsed_m} dk sürüyor ({user_email or '?'}) — takılmış olabilir!", "details": {"active": True, "elapsed_min": elapsed_m}}
    if elapsed_m > 20:
        return {"status": "warning", "message": f"Tarama {elapsed_m} dk sürüyor ({user_email or '?'}) — uzun ama normal sınırda.", "details": {"active": True, "elapsed_min": elapsed_m}}
    return {"status": "ok", "message": f"Tarama devam ediyor ({elapsed_m} dk, {user_email or '?'}).", "details": {"active": True, "elapsed_min": elapsed_m}}


def _check_analyze_cache() -> Dict:
    try:
        from app.features.scanner.routers.api_scan import _ANALYZE_CACHE, _ANALYZE_CACHE_TTL, _ANALYZE_CACHE_LOCK
        with _ANALYZE_CACHE_LOCK:
            total = len(_ANALYZE_CACHE)
            nm    = time.monotonic()
            valid = sum(1 for v in _ANALYZE_CACHE.values() if (nm - v["ts"]) < _ANALYZE_CACHE_TTL)
            stale = total - valid
    except Exception as e:
        return {"status": "warning", "message": f"L1 cache okunamadı: {e}"}

    if total == 0:
        # Sadece restart/yükleme sonrası normaldir — warning değil
        return {
            "status":  "ok",
            "message": "L1 cache henüz boş — ilk analiz isteğinde dolacak.",
            "details": {"total": 0, "valid": 0, "stale": 0},
        }
    if valid == 0:
        return {
            "status":  "warning",
            "message": f"L1 cache: {total} giriş var ama tümü bayat (TTL {_ANALYZE_CACHE_TTL}s).",
            "details": {"total": total, "valid": 0, "stale": stale},
        }
    return {
        "status":  "ok",
        "message": f"L1 cache: {valid}/{total} giriş geçerli, {stale} bayat.",
        "details": {"total": total, "valid": valid, "stale": stale, "ttl_s": _ANALYZE_CACHE_TTL},
    }


def _check_prediction_pipeline() -> Dict:
    from sqlalchemy import func
    from app.features.scanner.models import ScanScore
    db = _db_session()
    try:
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)
        cutoff_naive = cutoff.replace(tzinfo=None)

        evaluated = db.query(func.count(ScanScore.id)).filter(
            ScanScore.hit_status.isnot(None),
            ScanScore.evaluated_at >= cutoff_naive,
        ).scalar() or 0

        if evaluated == 0:
            return {
                "status":  "warning",
                "message": "Son 7 günde değerlendirilmiş tahmin yok — pipeline işlemiyor veya vade dolmadı.",
                "details": {"evaluated_7d": 0},
            }

        hits = db.query(func.count(ScanScore.id)).filter(
            ScanScore.hit_status == "target_hit",
            ScanScore.evaluated_at >= cutoff_naive,
        ).scalar() or 0
        hit_rate = round(hits / evaluated * 100, 1)

        dir_total = db.query(func.count(ScanScore.id)).filter(
            ScanScore.directional_hit.isnot(None),
            ScanScore.evaluated_at >= cutoff_naive,
        ).scalar() or 0
        dir_hits = db.query(func.count(ScanScore.id)).filter(
            ScanScore.directional_hit == True,
            ScanScore.evaluated_at >= cutoff_naive,
        ).scalar() or 0
        dir_rate = round(dir_hits / dir_total * 100, 1) if dir_total > 0 else None

        # Yön %50+ veya isabet %20+ → ok; ikisi de düşükse → warning
        status = "ok" if (dir_rate is not None and dir_rate >= 50) or hit_rate >= 20 else "warning"

        return {
            "status":  status,
            "message": (
                f"Son 7 günde {evaluated:,} değerlendirme. İsabet: %{hit_rate}."
                + (f" Yön: %{dir_rate}." if dir_rate is not None else " Yön verisi yok.")
            ),
            "details": {
                "evaluated_7d":     evaluated,
                "hits":             hits,
                "hit_rate_pct":     hit_rate,
                "dir_hit_rate_pct": dir_rate,
            },
        }
    finally:
        db.close()


# ── E: Ağ ────────────────────────────────────────────────────────────────────

def _check_market_data_connectivity() -> Dict:
    import requests as req
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    t0 = time.monotonic()
    try:
        r    = req.get("https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL", headers=headers, timeout=6)
        lat  = (time.monotonic() - t0) * 1000
        code = r.status_code
    except Exception as e:
        lat = (time.monotonic() - t0) * 1000
        return {"status": "fail", "message": f"Yahoo Finance erişilemiyor: {e}", "details": {"latency_ms": round(lat, 1), "error": str(e)}}

    if code == 200:
        return {"status": "ok",      "message": f"Yahoo Finance erişilebilir. Gecikme: {lat:.0f}ms.", "details": {"latency_ms": round(lat, 1), "status_code": code}}
    if code == 429:
        return {"status": "warning", "message": f"Yahoo rate limiti (429) — internet var, tarama yavaşlayabilir.", "details": {"latency_ms": round(lat, 1), "status_code": code}}
    return {"status": "warning", "message": f"Yahoo beklenmedik yanıt: HTTP {code}. Gecikme: {lat:.0f}ms.", "details": {"latency_ms": round(lat, 1), "status_code": code}}


# ── Ana fonksiyon — paralel çalışma ─────────────────────────────────────────

# Sıra önemli: frontend bu sırayla gruplar
_CHECK_DEFS = [
    # (name, group, fn)
    ("ML Model Dosyası",       "ML",       _check_ml_model_file),
    ("ML Bellek Durumu",       "ML",       _check_ml_in_memory),
    ("ML Inference Testi",     "ML",       _check_ml_inference),
    ("Veritabanı Bağlantısı",  "Altyapı",  _check_database),
    ("Veritabanı Kilitleri",   "Altyapı",  _check_db_locks),
    ("Redis Önbelleği",        "Altyapı",  _check_redis),
    ("Sistem Kaynakları",      "Altyapı",  _check_system_resources),
    ("Cache Tazeliği",         "Veri",     _check_cache_freshness),
    ("Profil Cache Kapsamı",   "Veri",     _check_profile_cache),
    ("Scheduler Sağlığı",      "Uygulama", _check_scheduler),
    ("Tarama Takılma Testi",   "Uygulama", _check_scanner_stuck),
    ("Analiz Cache (L1)",      "Uygulama", _check_analyze_cache),
    ("Tahmin Pipeline",        "Uygulama", _check_prediction_pipeline),
    ("Piyasa Veri Bağlantısı", "Ağ",       _check_market_data_connectivity),
]


def run_system_diagnostics(_db: Optional[Session] = None) -> Dict[str, Any]:
    """
    14 check'i ThreadPoolExecutor ile paralel çalıştırır.
    Her check kendi DB session'ını açar; _db parametresi artık sadece compat için.
    """
    t_start = time.monotonic()

    # Sıralı indeks koruması için dict
    result_map: Dict[str, Dict] = {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        future_to_name = {
            pool.submit(_run, name, group, fn): name
            for name, group, fn in _CHECK_DEFS
        }
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                result_map[name] = future.result()
            except Exception as exc:
                result_map[name] = {
                    "name":    name,
                    "group":   next((g for n, g, _ in _CHECK_DEFS if n == name), "?"),
                    "status":  "fail",
                    "message": f"Thread hatası: {exc}",
                    "details": None,
                    "ms":      0,
                }

    # Tanımlı sırayla yeniden diz
    checks = [result_map[name] for name, _, _ in _CHECK_DEFS if name in result_map]

    total_ms   = round((time.monotonic() - t_start) * 1000)
    has_fail   = any(c["status"] in ("fail", "error") for c in checks)
    has_warn   = any(c["status"] == "warning"          for c in checks)
    overall    = "critical" if has_fail else ("warning" if has_warn else "healthy")

    return {
        "timestamp":  isoformat_z(now_utc()),
        "overall":    overall,
        "status":     overall,
        "total_ms":   total_ms,
        "checks":     checks,
        "summary": {
            "ok":      sum(1 for c in checks if c["status"] in ("ok", "pass")),
            "warning": sum(1 for c in checks if c["status"] == "warning"),
            "fail":    sum(1 for c in checks if c["status"] in ("fail", "error")),
            "total":   len(checks),
        },
    }
