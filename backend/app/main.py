# backend/app/main.py
import os
import sys
import uuid
import mimetypes
import logging
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.staticfiles import StaticFiles as StarletteStaticFiles
from starlette.types import Scope, Receive, Send

from .core import settings

# Configure structured logging FIRST — router imports (especially admin/_shared.py)
# add a log handler to root logger; configure_json_logging must run before them
# so it doesn't wipe the _AdminLogHandler that was added during import.
from .core.logging_config import configure_json_logging
_env = os.getenv("ENVIRONMENT", "production")
configure_json_logging(env=_env)
logger = logging.getLogger(__name__)

from .core.bootstrap import bootstrap_app
from .features.scanner.router import router as scanner_router
from .features.charts.router import router as charts_router
from .features.dashboard.router import router as dashboard_router
from .features.backtest.router import router as backtest_router
from .features.users.router import router as users_router
from .features.admin.router import router as admin_router
from .features.support.router import router as support_router
from .features.seo.router import router as seo_router
from .features.news.router import router as news_router
from .features.market.router import router as market_router
from .core.time_utils import isoformat_z
logger.info("PIVOTRADAR v4.2.5 - ENGINE INITIALIZING...")

# Sentry error monitoring
_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        import logging as _logging
        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=_env,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
                LoggingIntegration(level=_logging.ERROR, event_level=_logging.ERROR),
            ],
            traces_sample_rate=0.05,
            send_default_pii=False,
        )
        logger.info("Sentry error monitoring: active (environment=%s)", _env)
    except ImportError:
        logger.warning("sentry-sdk not installed; skipping Sentry init")
elif _env == "production":
    # Production'da SENTRY_DSN olmadan çalışmak demek hataların sessizce kaybolması demek.
    # .env dosyasına SENTRY_DSN ekle: sentry.io → Free plan → DSN kopyala.
    logger.critical(
        "SENTRY_DSN ayarlanmamış! Production hatalarını göremezsiniz. "
        "sentry.io → ücretsiz hesap aç → DSN'i .env'e ekle."
    )

app = FastAPI(title="PivotRadar API", version="4.2.5")

# Initialize Application via Bootstrap
bootstrap_app(app)

# MIME Tiplerini Manuel Olarak Tamamla
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('font/woff2', '.woff2')

# --- Middlewares ---

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # CSP — sadece HTML sayfalarına
    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://challenges.cloudflare.com https://accounts.google.com https://static.cloudflareinsights.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: https: https://lh3.googleusercontent.com; "
            "connect-src 'self' https://api.polygon.io https://query1.finance.yahoo.com https://www.googleapis.com https://static.cloudflareinsights.com; "
            "frame-src https://challenges.cloudflare.com https://accounts.google.com; "
            "object-src 'none'; "
            "base-uri 'self';"
        )

    # HSTS — sadece gerçek domain'lerde
    _host = request.url.hostname or ""
    _is_ip = all(c.isdigit() or c == "." for c in _host)
    if _is_ip:
        response.headers["Strict-Transport-Security"] = "max-age=0"
    elif _host not in ("localhost", "127.0.0.1", "0.0.0.0") and not _host.startswith("192.168."):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

@app.middleware("http")
async def log_requests(request: Request, call_next):
    rid = getattr(request.state, "request_id", "-")
    logger.info(f"[{rid}] {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"[{rid}] → {response.status_code}")
    # Forward any rate-limit headers set by limiters
    rl_headers = getattr(request.state, "rate_limit_headers", {})
    for k, v in rl_headers.items():
        response.headers[k] = v
    return response

# DDOS Protection: Unified DB-Backed Global Limiter (P0.1)
from fastapi.responses import JSONResponse

@app.middleware("http")
async def ddos_protection_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        # Whitelist streaming and charts from global limiter
        if request.url.path in ("/api/progress/stream", "/api/chart"):
            return await call_next(request)
        try:
            from .core.rate_limit import global_limiter
            global_limiter(request)
        except Exception as e:
            if getattr(e, "status_code", None) == 429:
                return JSONResponse(
                    status_code=429,
                    content={"detail": getattr(e, "detail", "Çok fazla istek.")}
                )
            logger.error(f"Global Rate Limiter Error: {e}")
            
    return await call_next(request)

@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if response.status_code < 400:
        if path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.endswith((".png", ".jpg", ".svg", ".ico", ".woff2")):
            response.headers["Cache-Control"] = "public, max-age=86400"
    else:
        response.headers["Cache-Control"] = "no-store"
    return response

# CORS
# Production'da localhost origin'leri kesinlikle dahil edilmez — XSS riski.
# CORS_ORIGINS env ile tam liste override edilebilir; CORS_EXTRA_ORIGINS ile ek domain eklenebilir.
_cors_env   = os.getenv("CORS_ORIGINS", "")
_cors_extra = [o.strip() for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]
_is_production = _env == "production"

_PROD_ORIGINS = [
    "https://pivot-radar.com",
    "https://www.pivot-radar.com",
    "https://pivotradar.net",
]
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8051",
    "http://127.0.0.1:8051",
]

_cors_origins = (
    ["*"] if _cors_env.strip() == "*"
    else [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else (
        [*_PROD_ORIGINS, *_cors_extra]
        if _is_production
        else [*_PROD_ORIGINS, *_DEV_ORIGINS, *_cors_extra]
    )
)
# K-2: Üretimde wildcard CORS + credentials → CSRF riski. Hard reject.
if _is_production and "*" in _cors_origins:
    raise RuntimeError(
        "CORS_ORIGINS='*' üretim ortamında allow_credentials=True ile kullanılamaz. "
        "CSRF saldırısına açık yapılandırma reddedildi."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Feature Routers — mounted under both /api/v1/ (canonical) and /api/ (legacy)
# The /api/ mounts are kept for backward compatibility; new clients should use /api/v1/.
_V1 = "/api/v1"
_V0 = "/api"

for _prefix, _v1 in ((_V1, True), (_V0, False)):
    _schema = _v1  # legacy /api/ mounts hidden from OpenAPI docs
    app.include_router(scanner_router,   prefix=_prefix,             tags=["Scanner"]   if _v1 else [], include_in_schema=_schema)
    app.include_router(charts_router,    prefix=_prefix,             tags=["Charts"]    if _v1 else [], include_in_schema=_schema)
    app.include_router(dashboard_router, prefix=_prefix,             tags=["Dashboard"] if _v1 else [], include_in_schema=_schema)
    app.include_router(backtest_router,  prefix=_prefix,             tags=["Backtest"]  if _v1 else [], include_in_schema=_schema)
    app.include_router(users_router,     prefix=_prefix,             tags=["Users"]     if _v1 else [], include_in_schema=_schema)
    app.include_router(support_router,   prefix=_prefix,             tags=["Support"]   if _v1 else [], include_in_schema=_schema)
    app.include_router(admin_router,     prefix=f"{_prefix}/admin",  tags=["Admin"]     if _v1 else [], include_in_schema=_schema)
    app.include_router(seo_router,       prefix=f"{_prefix}/seo",    tags=["SEO"]       if _v1 else [], include_in_schema=_schema)
    app.include_router(news_router,      prefix=_prefix,             tags=["News"]      if _v1 else [], include_in_schema=_schema)
    app.include_router(market_router,    prefix=_prefix,             tags=["Market"]    if _v1 else [], include_in_schema=_schema)

# ── /api/health — Kapsamlı sistem sağlık kontrolü ──────────────────────────────
@app.get("/api/health", tags=["System"])
async def health_check():
    """
    Lightweight: DB + Redis ping + cached self-heal raporu döner.
    Monitoring sistemleri (Uptime Kuma, Prometheus) için tasarlandı.
    overall=healthy → HTTP 200 | overall=degraded → HTTP 200 (alarm içeriği ile)
    """
    from .core.self_heal import get_cached_health, _check_db, _check_redis, _check_disk
    cached = get_cached_health()

    # Her istekte taze DB/Redis ping yap (hafif, <10ms)
    db_status    = _check_db()
    redis_status = _check_redis()
    disk         = cached.get("last_runtime", {}).get("disk") or _check_disk()

    overall = "healthy"
    if db_status.startswith("error") or (isinstance(disk, dict) and disk.get("status") == "critical"):
        overall = "degraded"

    return JSONResponse(
        status_code=200,
        content={
            "overall":   overall,
            "version":   "4.2.5",
            "db":        db_status,
            "redis":     redis_status,
            "disk":      disk,
            "last_heal": cached.get("last_startup", {}).get("timestamp"),
            "ml_models": cached.get("last_startup", {}).get("ml_models", {}),
        }
    )


# A-2: Prometheus /metrics endpoint — Grafana/Prometheus uyumlu ham text formatı.
# prometheus_client paketi olmadan çalışır; basit gauge formatı yeterlidir.
@app.get("/metrics", tags=["System"], include_in_schema=False)
async def prometheus_metrics():
    """
    Prometheus text format (exposition format v0.0.4).
    Güvenli: sadece metrik isimler ve sayısal değerler; kullanıcı verisi yok.
    """
    from fastapi.responses import PlainTextResponse
    from .core.self_heal import get_cached_health, _check_db, _check_redis, _check_disk, _check_memory
    import time as _time

    lines: list[str] = []
    ts = int(_time.time() * 1000)

    def gauge(name: str, value: float, help_text: str = "", labels: dict | None = None) -> None:
        lbl = ""
        if labels:
            lbl = "{" + ",".join(f'{k}="{v}"' for k, v in labels.items()) + "}"
        if help_text:
            lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} gauge")
        lines.append(f"{name}{lbl} {value} {ts}")

    # DB sağlığı
    db_ok = 1.0 if _check_db() == "ok" else 0.0
    gauge("pivotradar_db_up", db_ok, "DB bağlantısı (1=ok, 0=hata)")

    # Redis sağlığı
    redis_status = _check_redis()
    redis_ok = 1.0 if redis_status == "ok" else (0.5 if redis_status == "unavailable" else 0.0)
    gauge("pivotradar_redis_up", redis_ok, "Redis bağlantısı (1=ok, 0.5=devre dışı, 0=hata)")

    # Disk
    disk = _check_disk()
    gauge("pivotradar_disk_free_pct", float(disk.get("free_pct", 0)), "Boş disk yüzdesi")
    gauge("pivotradar_disk_free_mb", float(disk.get("free_mb", 0)), "Boş disk MB")

    # Bellek
    mem = _check_memory()
    gauge("pivotradar_memory_used_pct", float(mem.get("used_pct", 0)), "Kullanılan bellek yüzdesi")
    gauge("pivotradar_memory_available_mb", float(mem.get("available_mb", 0)), "Kullanılabilir bellek MB")

    # Tarayıcı ve ML istatistikleri
    try:
        from .core.database import SessionLocal as _SL
        from .features.scanner.models import ScanScore
        from sqlalchemy import func as _func
        _db = _SL()
        try:
            total_scans = _db.query(_func.count(ScanScore.id)).scalar() or 0
            evaluated   = _db.query(_func.count(ScanScore.id)).filter(ScanScore.evaluated_at.isnot(None)).scalar() or 0
            gauge("pivotradar_scan_scores_total", float(total_scans), "Toplam tarama skoru sayısı")
            gauge("pivotradar_scan_scores_evaluated", float(evaluated), "Değerlendirilmiş tarama skoru sayısı")
        finally:
            _db.close()
    except Exception:
        pass

    # Scheduler job sayısı
    try:
        from .core.scheduler import scheduler_manager
        job_count = len(scheduler_manager.scheduler.get_jobs()) if scheduler_manager.scheduler else 0
        gauge("pivotradar_scheduler_jobs", float(job_count), "Aktif scheduler iş sayısı")
    except Exception:
        pass

    # Business metrics (scanner, ML, cache)
    try:
        from .core.metrics import get_all as _get_metrics, get_cache_hit_rate
        m = _get_metrics()
        for k, v in m["counters"].items():
            gauge(f"pivotradar_{k}", v)
        for k, v in m["gauges"].items():
            gauge(f"pivotradar_{k}", v)
        cr = get_cache_hit_rate()
        if cr is not None:
            gauge("pivotradar_cache_hit_rate", cr, "Cache hit oranı (0-1)")
    except Exception:
        pass

    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")


# D.2 — RFC 7807 Problem Details for HTTP APIs
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    _titles = {
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity",
        429: "Too Many Requests", 500: "Internal Server Error",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type":     f"/errors/{exc.status_code}",
            "title":    _titles.get(exc.status_code, "Error"),
            "status":   exc.status_code,
            "detail":   exc.detail,
            "instance": str(request.url),
        },
        headers=getattr(exc, "headers", None) or {},
    )

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    logger.error(f"CRASH: {request.method} {request.url}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "type":   "/errors/500",
            "title":  "Internal Server Error",
            "status": 500,
            "detail": traceback.format_exc() if settings.APP_ENV != "production" else "Sunucu hatası. Lütfen daha sonra tekrar deneyin.",
            "instance": str(request.url),
        },
    )

# Cache header enjekte eden StaticFiles wrapper
class CachedStaticFiles(StarletteStaticFiles):
    def __init__(self, *args, max_age: int = 300, **kwargs):
        super().__init__(*args, **kwargs)
        self._cache_header = f"public, max-age={max_age}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_cache(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"cache-control"] = self._cache_header.encode()
                message = {**message, "headers": list(headers.items())}
            await send(message)
        await super().__call__(scope, receive, send_with_cache)

# Statik Dosyalar
if settings.STATIC_DIR.exists():
    react_dir = settings.STATIC_DIR / "react"
    if react_dir.exists():
        if (react_dir / "assets").exists():
            app.mount("/assets", CachedStaticFiles(directory=str(react_dir / "assets")), name="react_assets")
        app.mount("/static", StaticFiles(directory=str(settings.STATIC_DIR)), name="static_core")
        logos_dir = settings.STATIC_DIR / "logos"
        logos_dir.mkdir(exist_ok=True)
        app.mount("/logos", CachedStaticFiles(directory=str(logos_dir)), name="logos")

@app.get("/health")
async def health_check():
    import asyncio
    checks: dict = {}

    # DB — 2s timeout to prevent health check from hanging load balancers
    async def _check_db():
        from app.core.database import SessionLocal as _SL
        _db = _SL()
        try:
            _db.execute(__import__("sqlalchemy").text("SELECT 1"))
        finally:
            _db.close()

    try:
        await asyncio.wait_for(_check_db(), timeout=2.0)
        checks["db"] = "ok"
    except asyncio.TimeoutError:
        checks["db"] = "error: timeout"
    except Exception as _e:
        checks["db"] = f"error: {_e}"

    # Scheduler
    try:
        from app.core.scheduler import scheduler_manager
        checks["scheduler"] = "running" if scheduler_manager.scheduler.running else "stopped"
    except Exception:
        checks["scheduler"] = "unknown"

    # ML model
    try:
        from app.features.scoring.ml.ml_calib import _CACHED
        checks["ml_model"] = "loaded" if _CACHED is not None else "not_loaded"
    except Exception:
        checks["ml_model"] = "unknown"

    # Son scan zamanı
    try:
        from app.features.scanner.logic.progress import read_progress_raw
        prog = read_progress_raw()
        checks["last_scan_state"] = prog.get("state", "unknown") if prog else "unknown"
    except Exception:
        checks["last_scan_state"] = "unknown"

    # Circuit breakers
    try:
        from app.core.circuit_breaker import get_all_statuses
        checks["circuit_breakers"] = get_all_statuses()
    except Exception:
        checks["circuit_breakers"] = []

    # Data sources availability
    data_sources = {}
    try:
        import yfinance as _yf
        data_sources["yfinance"] = "available"
    except ImportError:
        data_sources["yfinance"] = "unavailable"
    try:
        cf_url = getattr(settings, "CF_WORKER_URL", "")
        data_sources["cf_worker"] = "configured" if cf_url else "not_configured"
    except Exception:
        data_sources["cf_worker"] = "unknown"

    # Business metrics: son tarama ve backup
    try:
        from app.core.metrics import get_last_scan_minutes_ago, get_last_backup_hours_ago, get_cache_hit_rate
        scan_ago = get_last_scan_minutes_ago()
        backup_ago = get_last_backup_hours_ago()
        checks["last_scan_minutes_ago"] = scan_ago
        checks["last_backup_hours_ago"] = backup_ago
        checks["cache_hit_rate"] = get_cache_hit_rate()
        if backup_ago is not None and backup_ago > 48:
            checks["backup_warning"] = f"Son backup {backup_ago:.1f} saat önce — 48h eşiği aşıldı"
    except Exception:
        pass

    overall = "healthy" if checks.get("db") == "ok" else "degraded"
    return {
        "status":       overall,
        "pid":          os.getpid(),
        "timestamp":    isoformat_z(),
        "checks":       checks,
        "data_sources": data_sources,
    }

_SITEMAP_CACHE: dict = {"xml": None, "date": None}

@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    from fastapi.responses import Response
    from datetime import date

    today = date.today().isoformat()

    # Aynı günde gelen isteklerde XML'i yeniden üretme
    if _SITEMAP_CACHE["xml"] and _SITEMAP_CACHE["date"] == today:
        return Response(
            content=_SITEMAP_CACHE["xml"],
            media_type="application/xml",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    BASE = "https://pivot-radar.com"

    STATIC_PAGES = [
        ("/",              "1.0", "daily"),
        ("/terminal",      "1.0", "daily"),
        ("/market",        "0.8", "daily"),
        ("/news",          "0.8", "daily"),
        ("/tools",         "0.8", "weekly"),
        ("/portfolio",     "0.6", "weekly"),
        ("/backtest",      "0.6", "monthly"),
        ("/hisse-merkezi", "0.7", "weekly"),
        ("/about",         "0.5", "monthly"),
        ("/support",       "0.4", "monthly"),
        ("/help",          "0.4", "monthly"),
        ("/legal",         "0.3", "monthly"),
    ]

    # BIST sembollerini CSV'den oku — DB'ye bağlanmaya gerek yok
    symbols: list[str] = []
    try:
        import csv
        from pathlib import Path as _Path
        _csv = _Path(__file__).parent / "features" / "market_data" / "assets" / "universe" / "bist_all.csv"
        if _csv.exists():
            with open(_csv, encoding="utf-8") as f:
                symbols = [row["symbol"].strip() for row in csv.DictReader(f) if row.get("symbol")]
    except Exception:
        pass

    urls = []
    for path, priority, freq in STATIC_PAGES:
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE}{path}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>{freq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
        )

    for sym in symbols:
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE}/terminal/{sym}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>daily</changefreq>\n"
            f"    <priority>0.9</priority>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )

    _SITEMAP_CACHE["xml"]  = xml
    _SITEMAP_CACHE["date"] = today
    return Response(content=xml, media_type="application/xml",
                    headers={"Cache-Control": "public, max-age=3600"})


_BOT_AGENTS = (
    "googlebot", "bingbot", "yandexbot", "duckduckbot", "baiduspider",
    "facebookexternalhit", "twitterbot", "linkedinbot", "whatsapp",
    "slurp", "teoma", "sogou", "exabot", "ia_archiver", "rogerbot",
    "msnbot", "archive.org_bot", "semrushbot", "ahrefsbot", "mj12bot",
)

_BIST_NAMES_SEO: dict = {}

def _load_bist_names_seo() -> dict:
    global _BIST_NAMES_SEO
    if _BIST_NAMES_SEO:
        return _BIST_NAMES_SEO
    try:
        from pathlib import Path as _P
        import json as _json
        f = _P(__file__).parent / "features" / "market_data" / "assets" / "universe" / "bist_names.json"
        if f.exists():
            _BIST_NAMES_SEO = _json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        pass
    return _BIST_NAMES_SEO


def _bot_prerender(path: str) -> str | None:
    """Arama motoru botları için hafif ama dolu bir HTML sayfası üretir."""
    import html as _html
    names = _load_bist_names_seo()

    # /terminal/THYAO
    if path.startswith("terminal/") and len(path) > 9:
        symbol = path[9:].strip("/").upper()
        if not symbol or len(symbol) > 8:
            return None
        company = names.get(symbol, symbol)
        title   = f"{symbol} Hisse Analizi — {_html.escape(company)} | PivotRadar"
        desc    = (
            f"{symbol} ({_html.escape(company)}) hissesi için canlı teknik analiz, "
            f"QRS skoru, ML tahminleri ve formasyon tespiti. "
            f"PivotRadar ile anlık BIST verisi ve yapay zeka destekli analiz."
        )
        h1 = f"{symbol} — {_html.escape(company)} Teknik Analiz"
        body = f"""
        <h1>{h1}</h1>
        <p>{desc}</p>
        <ul>
          <li>Sembol: {symbol}</li>
          <li>Şirket: {_html.escape(company)}</li>
          <li>Platform: PivotRadar BIST Analiz Terminali</li>
          <li>İçerik: QRS skoru, RSI, MACD, Bollinger, ML tahmini</li>
        </ul>
        <p><a href="https://pivot-radar.com/terminal/{symbol}">
          {symbol} canlı analizi için tıklayın</a></p>
        """
    elif path in ("", "terminal", "market", "news", "tools", "portfolio",
                  "backtest", "pricing", "legal", "legal/terms", "legal/privacy",
                  "legal/cookies", "help", "support"):
        page_map = {
            "":              ("PivotRadar | BIST Yapay Zeka Analiz Terminali",
                              "500+ BIST hissesini ML skoru, QRS puanı ve teknik göstergelerle analiz eden profesyonel quant terminali."),
            "terminal":      ("BIST Terminal — Yapay Zeka Hisse Tarama | PivotRadar",
                              "500+ BIST hissesini QRS skoru, RSI, MACD ve ML tahminleriyle anlık tara."),
            "market":        ("Piyasa Durumu — BIST Sektör Analizi | PivotRadar",
                              "Günlük BIST sektör bazlı performans, yükselen/düşen hisseler ve piyasa genişliği."),
            "news":          ("BIST Haber Akışı — KAP Bildirimleri | PivotRadar",
                              "Borsa İstanbul şirket haberleri, KAP bildirimleri ve piyasa gelişmeleri."),
            "tools":         ("Yatırım Araçları — Pozisyon ve K/Z Hesaplayıcı | PivotRadar",
                              "Pozisyon büyüklüğü ve kâr/zarar hesaplama araçları. Ücretsiz, tarayıcıda çalışır."),
            "portfolio":     ("Portföy Takibi | PivotRadar",
                              "BIST hisselerinizi anlık fiyat ve QRS skorlarıyla takip edin."),
            "backtest":      ("Backtest Motoru — Strateji Geçmiş Testi | PivotRadar",
                              "BIST hisseleri üzerinde teknik stratejilerinizi geçmiş verilerle test edin."),
            "pricing":       ("Üyelik Planları | PivotRadar",
                              "PivotRadar üyelik planları ve profesyonel özellikler."),
            "legal":         ("Yasal Uyarı & Gizlilik | PivotRadar",
                              "PivotRadar yasal uyarı, gizlilik politikası ve kullanım koşulları."),
            "legal/terms":   ("Kullanım Koşulları | PivotRadar",
                              "PivotRadar kullanım koşulları ve hizmet şartları."),
            "legal/privacy": ("Gizlilik Politikası | PivotRadar",
                              "PivotRadar kişisel veri işleme ve gizlilik politikası. KVKK uyumlu."),
            "legal/cookies": ("Çerez Politikası | PivotRadar",
                              "PivotRadar çerez kullanımı, türleri ve çerez politikası."),
            "help":          ("Yardım Merkezi | PivotRadar",
                              "PivotRadar kullanım kılavuzu, SSS ve destek."),
            "support":       ("Destek | PivotRadar",
                              "PivotRadar teknik destek ve iletişim."),
        }
        title, desc = page_map.get(path, page_map[""])
        h1 = title.split("|")[0].strip()
        body = f"<h1>{_html.escape(h1)}</h1><p>{_html.escape(desc)}</p>"
    else:
        return None

    canonical = f"https://pivot-radar.com/{path}"
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>{_html.escape(title)}</title>
  <meta name="description" content="{_html.escape(desc)}">
  <link rel="canonical" href="{canonical}">
  <meta property="og:title" content="{_html.escape(title)}">
  <meta property="og:description" content="{_html.escape(desc)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:type" content="website">
  <meta name="robots" content="index, follow">
</head>
<body>
  {body}
  <nav>
    <a href="https://pivot-radar.com/">Ana Sayfa</a> |
    <a href="https://pivot-radar.com/terminal">BIST Terminal</a> |
    <a href="https://pivot-radar.com/market">Piyasa</a> |
    <a href="https://pivot-radar.com/news">Haberler</a>
  </nav>
</body>
</html>"""


@app.get("/{rest_of_path:path}")
async def react_spa_catchall(rest_of_path: str, request: Request):
    react_dir = settings.STATIC_DIR / "react"
    if rest_of_path:
        if ".." in rest_of_path or rest_of_path.startswith("/"):
            return {"error": "Invalid path"}
        target_file = react_dir / rest_of_path
        if target_file.is_file():
            return FileResponse(target_file)

    if "." in rest_of_path and not rest_of_path.endswith(".html"):
        return {"error": "File Not Found", "path": rest_of_path}

    # Bot tespiti → pre-render HTML
    ua = (request.headers.get("user-agent") or "").lower()
    if any(bot in ua for bot in _BOT_AGENTS):
        html_content = _bot_prerender(rest_of_path)
        if html_content:
            return HTMLResponse(content=html_content, headers={"Cache-Control": "public, max-age=3600"})

    index_file = react_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file, media_type="text/html", headers={"Cache-Control": "no-cache"})
    return {"error": "Frontend Build Not Found", "path": rest_of_path}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
