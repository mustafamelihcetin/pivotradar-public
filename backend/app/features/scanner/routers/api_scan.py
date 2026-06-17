# backend/app/features/scanner/routers/api_scan.py
import re
import time
import threading
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
from app.features.users.router import get_current_user, get_current_user_optional
from app.core.database import SessionLocal
from app.core.rate_limit import analyze_rate_limit
from ..logic.queue_manager import push_to_scan_queue
from ..logic.state import STATE_LOCK, STOP_EVENT, ACTIVE

router = APIRouter()

_SAFE_PROFILE_RE = re.compile(r'^[\w\sÀ-ɏ]{1,64}$')

# Profile bazlı analyze cache
_ANALYZE_CACHE: dict = {}          # key → {ts, data_time, data}
_ANALYZE_CACHE_TTL   = 900         # saniye — 15 dakika (scan arası süresinden az değil)
_ANALYZE_CACHE_MAX   = 20          # en fazla unique key (memory leak önlemi)
_ANALYZE_INFLIGHT: dict = {}       # key → threading.Event (thundering herd önlemi)
_ANALYZE_CACHE_LOCK  = threading.Lock()


def _analyze_cache_key(profile_name: str, top_n: int, overrides: Optional[dict]) -> str:
    import hashlib, json
    ov = json.dumps(overrides or {}, sort_keys=True)
    raw = f"{profile_name}:{top_n}:{ov}"
    return hashlib.md5(raw.encode()).hexdigest()


def _current_data_time() -> str:
    """Sunucudaki son tarama veri zamanını döner — cache invalidation için.

    DB'den SymbolDataCache.scanned_at okur: progress.json'dan bağımsız,
    IDLE reset'ten etkilenmeyen stabil bir kaynak. Bu sayede warm_analyze_cache()
    tarafından doldurulan cache girişleri kullanıcı istekleriyle aynı anahtarı
    paylaşır.
    """
    try:
        from ..models import SymbolDataCache
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            latest = db.query(SymbolDataCache).order_by(
                SymbolDataCache.scanned_at.desc()
            ).first()
            if latest and latest.scanned_at:
                return str(latest.scanned_at.isoformat())
        finally:
            db.close()
    except Exception:
        pass
    return ""


_ALL_PROFILES = [
    "Güvenli Liman", "Agresif Atak", "Dönüş Uzmanı",
    "Trend Avcısı", "Değer Kaşifi", "Anlık Fırsatçı", "Kırılım Dedektörü",
]


def _db_cache_get(profile_name: str, batch_id: str) -> Optional[dict]:
    """DB'deki profile_score_cache tablosundan sonuç döner (L2 cache).
    Mevcut batch yoksa (warm henüz bitmemiş) en güncel geçerli sonucu fallback olarak döner.
    """
    import json as _json
    try:
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text
            row = db.execute(_text(
                "SELECT result_json FROM profile_score_cache "
                "WHERE profile_name = :p AND batch_id = :b AND overrides_hash = '' "
                "  AND expires_at > NOW() "
                "ORDER BY computed_at DESC LIMIT 1"
            ), {"p": profile_name, "b": batch_id}).fetchone()
            if row:
                return _json.loads(row[0])
            # Fallback: warm henüz bitmemişse önceki geçerli cache'i kullan
            row = db.execute(_text(
                "SELECT result_json FROM profile_score_cache "
                "WHERE profile_name = :p AND overrides_hash = '' "
                "  AND expires_at > NOW() "
                "ORDER BY computed_at DESC LIMIT 1"
            ), {"p": profile_name}).fetchone()
            if row:
                logger.info("DB cache fallback (prev batch) for profile: %s", profile_name)
                return _json.loads(row[0])
        finally:
            db.close()
    except Exception as e:
        logger.debug("DB cache get failed: %s", e)
    return None


def _db_cache_set(profile_name: str, batch_id: str, response: dict) -> None:
    """Hesaplanan profil sonucunu DB'ye yazar (L2 cache). Restart ve cross-worker safe."""
    import json as _json
    try:
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text
            result_json = _json.dumps(response, ensure_ascii=False, default=str)
            db.execute(_text("""
                INSERT INTO profile_score_cache
                    (profile_name, batch_id, top_n, overrides_hash, computed_at, expires_at, result_json)
                VALUES
                    (:p, :b, 1000, '', NOW(), NOW() + INTERVAL '26 hours', :rj)
                ON CONFLICT (profile_name, batch_id, top_n, overrides_hash)
                DO UPDATE SET result_json = EXCLUDED.result_json,
                              computed_at = EXCLUDED.computed_at,
                              expires_at  = EXCLUDED.expires_at
            """), {"p": profile_name, "b": batch_id, "rj": result_json})
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("DB cache set failed for %s: %s", profile_name, e)


def warm_analyze_cache() -> None:
    """Scan bittikten sonra arka planda tüm profiller için analyze cache'ini ısıtır.
    fcntl file lock ile çok-worker ortamında sadece bir worker çalıştırır.
    Sonuçlar hem in-memory (L1) hem DB'ye (L2) yazılır — restart ve cross-worker safe.
    """
    import threading, fcntl
    def _warm():
        lock_path = "/tmp/.analyze_warm.lock"
        try:
            lock_fd = open(lock_path, "w")
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, OSError):
            return  # Başka worker zaten ısıtıyor
        try:
            from ..user_scorer import score_for_user, get_latest_batch_id
            db = SessionLocal()
            data_time = _current_data_time()
            try:
                batch_id = get_latest_batch_id(db)
                for prof in _ALL_PROFILES:
                    try:
                        cache_key = _analyze_cache_key(prof, 1000, None)
                        with _ANALYZE_CACHE_LOCK:
                            existing = _ANALYZE_CACHE.get(cache_key)
                            if existing and existing["data_time"] == data_time and \
                                    (time.monotonic() - existing["ts"]) < _ANALYZE_CACHE_TTL:
                                continue
                        results, meta = score_for_user(db, profile_name=prof, top_n=1000)
                        response = {
                            "results": results, "cache_meta": meta,
                            "data_freshness": meta.get("data_freshness"),
                            "ml_warning": meta.get("ml_warning"),
                            "qrs_warning": meta.get("qrs_warning"),
                            "refresh_triggered": False,
                        }
                        # L1: in-memory cache
                        with _ANALYZE_CACHE_LOCK:
                            _ANALYZE_CACHE[cache_key] = {"ts": time.monotonic(), "data_time": data_time, "data": response}
                        # L2: DB cache — survives restarts, shared across workers
                        if batch_id:
                            _db_cache_set(prof, batch_id, response)
                        logger.info("Cache warmed: %s", prof)
                    except Exception as e:
                        logger.warning("Cache warm failed for %s: %s", prof, e)
            finally:
                db.close()
        finally:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                lock_fd.close()
            except Exception:
                pass
    threading.Thread(target=_warm, daemon=True, name="analyze-cache-warmer").start()


def flush_analyze_cache(symbol: str = None, pattern_name: str = None) -> None:
    """L1 önbelleği (in-memory) temizler. symbol+pattern_name verilirse
    L2 (profile_score_cache) içindeki o sembolün değerini yerinde günceller —
    tüm cache'i silmez, dolayısıyla /analyze endpoint'i yavaşlamaz."""
    with _ANALYZE_CACHE_LOCK:
        _ANALYZE_CACHE.clear()
    if symbol and pattern_name:
        try:
            import json as _jj
            from app.core.database import SessionLocal
            from sqlalchemy import text as _text
            _db = SessionLocal()
            try:
                rows = _db.execute(_text(
                    "SELECT id, result_json FROM profile_score_cache WHERE expires_at > NOW()"
                )).fetchall()
                for row in rows:
                    try:
                        rj = _jj.loads(row[1])
                        updated = False
                        for item in rj.get("results", []):
                            if item.get("symbol") == symbol.upper():
                                item["pattern_name"] = pattern_name
                                updated = True
                                break
                        if updated:
                            _db.execute(_text(
                                "UPDATE profile_score_cache SET result_json = :rj WHERE id = :id"
                            ), {"rj": _jj.dumps(rj, ensure_ascii=False, default=str), "id": row[0]})
                    except Exception:
                        pass
                _db.commit()
            finally:
                _db.close()
        except Exception:
            pass


class StartPayload(BaseModel):
    profile_name:   str            = Field(default="Güvenli Liman")
    max_symbols:    int            = Field(default=1000, ge=1, le=2000)
    expert_mode:    bool           = Field(default=False)
    prefilter_top_n: Optional[int] = Field(default=None, alias="top_n", ge=1, le=1000)
    vol_min:        Optional[float] = Field(default=None)
    rsi_min:        Optional[float] = Field(default=None)
    overrides:      Optional[dict]  = Field(default_factory=dict, alias="expert_overrides")

    model_config = {"populate_by_name": True}

    @field_validator("profile_name")
    @classmethod
    def validate_profile_name(cls, v: str) -> str:
        if not _SAFE_PROFILE_RE.match(v):
            raise ValueError("Geçersiz profil adı")
        return v

    @field_validator("overrides")
    @classmethod
    def validate_overrides(cls, v: Optional[dict]) -> Optional[dict]:
        if v is None:
            return {}
        _ALLOWED_OVERRIDE_KEYS = {"rsi_weight", "vol_weight", "ema_weight", "atr_weight", "momentum_weight"}
        for key, val in v.items():
            if key not in _ALLOWED_OVERRIDE_KEYS:
                raise ValueError(f"Geçersiz override anahtarı: {key}")
            try:
                fval = float(val)
            except (TypeError, ValueError):
                raise ValueError(f"Override değeri sayısal olmalı: {key}={val}")
            if not (0.0 <= fval <= 5.0):
                raise ValueError(f"Override değeri 0-5 aralığında olmalı: {key}={fval}")
        return v


@router.post("/scan/analyze")
def api_analyze(
    request: Request,
    payload: StartPayload,
):
    from ..user_scorer import score_for_user, get_latest_batch_id
    import traceback
    from app.core.database import SessionLocal

    # top_n'i response slice için sakla; cache key her zaman 1000 kullan
    # Bu sayede warm cache (top_n=1000) ile kullanıcı istekleri aynı key'i paylaşır.
    resp_top_n = payload.prefilter_top_n or 500
    cache_key  = _analyze_cache_key(payload.profile_name, 1000, payload.overrides)
    data_time  = _current_data_time()

    def _slice_response(resp: dict) -> dict:
        if resp_top_n < 1000 and isinstance(resp.get("results"), list):
            import copy
            resp = copy.copy(resp)
            resp["results"] = resp["results"][:resp_top_n]
        return resp

    # 1. L1: in-memory cache hit
    with _ANALYZE_CACHE_LOCK:
        cached = _ANALYZE_CACHE.get(cache_key)
        if cached and cached["data_time"] == data_time and (time.monotonic() - cached["ts"]) < _ANALYZE_CACHE_TTL:
            return _slice_response(cached["data"])

        # 2. Thundering herd — aynı key için hesaplama zaten sürüyorsa bekle
        if cache_key in _ANALYZE_INFLIGHT:
            evt = _ANALYZE_INFLIGHT[cache_key]
        else:
            evt = threading.Event()
            _ANALYZE_INFLIGHT[cache_key] = evt
            evt = None  # bu thread hesaplıyor

    if evt is not None:
        evt.wait(timeout=45)
        with _ANALYZE_CACHE_LOCK:
            cached = _ANALYZE_CACHE.get(cache_key)
            if cached:
                return _slice_response(cached["data"])
        # bekledik ama sonuç gelmedi — kendimiz hesaplayacağız (fallback)

    # 3. L2: DB cache — override yoksa warm sonucunu kullan
    if not payload.overrides:
        try:
            _db = SessionLocal()
            try:
                batch_id = get_latest_batch_id(_db)
            finally:
                _db.close()
            if batch_id:
                db_hit = _db_cache_get(payload.profile_name, batch_id)
                if db_hit:
                    with _ANALYZE_CACHE_LOCK:
                        if len(_ANALYZE_CACHE) >= _ANALYZE_CACHE_MAX:
                            oldest = min(_ANALYZE_CACHE, key=lambda k: _ANALYZE_CACHE[k]["ts"])
                            del _ANALYZE_CACHE[oldest]
                        _ANALYZE_CACHE[cache_key] = {"ts": time.monotonic(), "data_time": data_time, "data": db_hit}
                        inflight_evt = _ANALYZE_INFLIGHT.pop(cache_key, None)
                    if inflight_evt:
                        inflight_evt.set()
                    logger.info("DB cache hit for profile: %s", payload.profile_name)
                    return _slice_response(db_hit)
        except Exception as e:
            logger.debug("DB cache lookup error: %s", e)

    db = None
    try:
        db = SessionLocal()
        # Her zaman top_n=1000 hesapla — cache key ile uyumlu, slice response'da yapılır
        results, meta = score_for_user(
            db,
            profile_name=payload.profile_name,
            expert_overrides=payload.overrides,
            top_n=1000,
        )
        # Sonuç özeti — tabloda ne göründüğünü log'a yaz
        try:
            _pat_rows = [
                (r["symbol"], r.get("pattern_name") or "", r.get("secondary_pattern_name") or "",
                 float(r.get("pattern_score") or 0), float(r.get("yzdsh") or 0))
                for r in results
                if r.get("pattern_name") and r["pattern_name"] not in ("Formasyon Yok", "NONE", "")
            ]
            _sec_rows = [(sym, p, s) for sym, p, s, _, _ in _pat_rows if s and s not in ("Formasyon Yok", "NONE", "")]
            logger.info(
                "[ANALYZE] profil=%-20s toplam=%-4d formasyon=%-3d ikincil=%d",
                payload.profile_name, len(results), len(_pat_rows), len(_sec_rows)
            )
            if _pat_rows:
                top15 = sorted(_pat_rows, key=lambda x: x[4], reverse=True)[:15]
                logger.info("[ANALYZE] ── En yüksek QRS'li formasyonlar ──")
                for sym, p, s, sc, q in top15:
                    sec = f"  +[{s}]" if s and s not in ("Formasyon Yok", "NONE", "") else ""
                    logger.info("  %-8s | %-28s | QRS=%3.0f | PUAN=%.2f%s", sym, p, q, sc, sec)
            if _sec_rows:
                logger.info("[ANALYZE] ── İkincil formasyon olan hisseler ──")
                for sym, p, s in _sec_rows:
                    logger.info("  %-8s | BİRİNCİL: %-22s | İKİNCİL: %s", sym, p, s)
        except Exception:
            pass
        response = {
            "results":           results,
            "cache_meta":        meta,
            "data_freshness":    meta.get("data_freshness"),
            "ml_warning":        meta.get("ml_warning"),
            "qrs_warning":       meta.get("qrs_warning"),
            "refresh_triggered": False,
        }
        with _ANALYZE_CACHE_LOCK:
            # Memory leak önlemi — max key sayısı aşılırsa en eskiyi sil
            if len(_ANALYZE_CACHE) >= _ANALYZE_CACHE_MAX:
                oldest = min(_ANALYZE_CACHE, key=lambda k: _ANALYZE_CACHE[k]["ts"])
                del _ANALYZE_CACHE[oldest]
            _ANALYZE_CACHE[cache_key] = {"ts": time.monotonic(), "data_time": data_time, "data": response}
            inflight_evt = _ANALYZE_INFLIGHT.pop(cache_key, None)
        if inflight_evt:
            inflight_evt.set()
        # L2: DB cache — cross-worker paylaşımı (overrides yoksa)
        if not payload.overrides:
            try:
                _batch_id = get_latest_batch_id(db)
                if _batch_id:
                    _db_cache_set(payload.profile_name, _batch_id, response)
            except Exception:
                pass
        return _slice_response(response)
    except Exception as e:
        logger.error("api_analyze failed: %s", e, exc_info=True)
        # Inflight key temizle — yoksa sonraki istekler 45s bekler, sonuç alamaz
        with _ANALYZE_CACHE_LOCK:
            inflight_evt = _ANALYZE_INFLIGHT.pop(cache_key, None)
        if inflight_evt:
            inflight_evt.set()
        return {
            "results": [],
            "cache_meta": {
                "available": False,
                "error": f"Analiz başlatılamadı: {str(e)}",
            },
            "data_freshness": None,
            "ml_warning": None,
            "qrs_warning": None,
            "refresh_triggered": False
        }
    finally:
        if db:
            db.close()

@router.post("/scan", response_model=Dict[str, Any])
def api_trigger_scan(payload: StartPayload, current_user: Any = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Yalnızca adminler manuel tarama başlatabilir.")

    db = SessionLocal()
    try:
        from app.features.admin.utils import get_system_setting, DEFAULT_SETTINGS
        cfg = get_system_setting(db, "scanner_config", DEFAULT_SETTINGS["scanner_config"])
        max_q = int(cfg.get("max_queue", 5))
        cd    = int(cfg.get("cooldown_sec", 120))
    finally:
        db.close()

    res = push_to_scan_queue(
        user_id=current_user.id,
        user_email=current_user.email,
        payload_dict=payload.model_dump(),
        max_queue=max_q,
        cooldown=cd
    )
    if res.get("ok"): return res
    raise HTTPException(status_code=400, detail=res.get("detail"))

@router.post("/scan/live-prices", response_model=Dict[str, Any])
def api_live_prices(payload: dict):
    """
    Seçili semboller için canlı fiyat verisi döner. 
    Dashboard'daki listenin toplu güncellenmesi için kullanılır.
    """
    raw = payload.get("symbols", [])
    if not raw or not isinstance(raw, list):
        return {}
    # Sanitize: only non-empty strings, max 30 chars each, no injection chars
    _safe_re = __import__("re").compile(r'^[A-Z0-9._\-]{1,30}$')
    symbols = [s for s in raw if isinstance(s, str) and _safe_re.match(s.upper())][:100]
    if not symbols:
        return {}
    try:
        from app.features.market_data.data.yf_client import get_live_close_many
        return get_live_close_many(symbols)
    except Exception as e:
        logger.warning("api_live_prices failed: %s", e)
        return {}

@router.get("/scan/cache-status")
def api_cache_status():
    """
    Piyasa veri önbelleğinin tazelik bilgisi.
    Frontend her 30 saniyede bir polling yapar — lightweight, DB erişimi yok.
    """
    from app.core.database import SessionLocal
    from app.features.scanner.models import SymbolDataCache, ScanScore
    db = SessionLocal()
    try:
        latest_cache = db.query(SymbolDataCache).order_by(
            SymbolDataCache.scanned_at.desc()
        ).first()
        latest_scan = db.query(ScanScore).order_by(
            ScanScore.scanned_at.desc()
        ).first()

        cache_data_time = None
        cache_scanned_at = None
        cache_symbol_count = 0
        if latest_cache:
            # scanned_at öncelikli: günlük bar data_time'ı gece yarısı UTC olduğundan
            # UI'da "00:00" gösterir. Gerçek tarama zamanı scanned_at'tir.
            if latest_cache.scanned_at:
                _sa = latest_cache.scanned_at.isoformat().replace("+00:00", "")
                cache_data_time = _sa if _sa.endswith("Z") else _sa + "Z"
            elif latest_cache.data_time:
                _dt = latest_cache.data_time.isoformat().replace("+00:00", "")
                cache_data_time = _dt if _dt.endswith("Z") else _dt + "Z"
            elif latest_cache.data_date:
                cache_data_time = latest_cache.data_date.isoformat()
            cache_scanned_at = latest_cache.scanned_at.isoformat() if latest_cache.scanned_at else None
            cache_symbol_count = db.query(SymbolDataCache).count()

        scan_scanned_at = latest_scan.scanned_at.isoformat() if latest_scan and latest_scan.scanned_at else None

        try:
            from app.core.market_hours import get_market_status
            market_status = get_market_status()
        except Exception:
            market_status = None

        return {
            "available":        latest_cache is not None,
            "data_time":        cache_data_time,
            "scanned_at":       cache_scanned_at,
            "symbol_count":     cache_symbol_count,
            "last_scan_at":     scan_scanned_at,
            "market_status":    market_status,
        }
    except Exception as e:
        logger.warning("cache-status failed: %s", e)
        return {"available": False, "data_time": None, "scanned_at": None, "symbol_count": 0, "last_scan_at": None, "market_status": None}
    finally:
        db.close()


@router.post("/scan/stop", response_model=Dict[str, Any])
def api_stop_scan(current_user: Any = Depends(get_current_user)):
    with STATE_LOCK:
        if ACTIVE["user_id"] == current_user.id or current_user.is_superuser:
            STOP_EVENT.set()
            return {"ok": True, "message": "Durdurma sinyali gönderildi."}
    raise HTTPException(status_code=403, detail="Yalnızca kendi taramanızı durdurabilirsiniz.")
