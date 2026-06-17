# backend/app/core/settings.py
import logging
import os
import sys
from pathlib import Path

# Proje Kok Dizini
if getattr(sys, "frozen", False):
    PROJECT_ROOT = Path(sys._MEIPASS).resolve()
else:
    # "app/core" -> "app" -> repo root
    APP_ROOT = Path(__file__).parent.parent.resolve()  # /app/app in Docker
    # In Docker: backend/ is copied to /app/, so APP_ROOT=/app/app, repo root=/app
    # Detect Docker: if /app exists as working directory use it directly
    _workdir = Path("/app")
    if _workdir.exists() and (APP_ROOT.parent == _workdir or str(APP_ROOT).startswith("/app")):
        PROJECT_ROOT = _workdir  # Docker: /app
    else:
        PROJECT_ROOT = APP_ROOT.parent.parent  # local dev: repo root
        if str(PROJECT_ROOT).endswith("backend"):
            PROJECT_ROOT = PROJECT_ROOT.parent

# Dizin Yapilandirmasi
RUNTIME_DIR = (PROJECT_ROOT / "data" / "runtime").resolve()
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

EOD_DIR = (PROJECT_ROOT / "data" / "eod").resolve()
STATIC_DIR = (PROJECT_ROOT / "static").resolve()

# Dosya Yollari
PROGRESS_FILE = RUNTIME_DIR / "progress.json"
RESULTS_FILE = RUNTIME_DIR / "results.json"
META_FILE = RUNTIME_DIR / "meta.json"
UI_STATE_FILE = RUNTIME_DIR / "ui_state.json"

# API Ayarlari
HOST = os.getenv("PIVOTRADAR_HOST", "0.0.0.0")
PORT = int(os.getenv("PIVOTRADAR_PORT", 8051))

# Cloudflare Worker Proxy
CF_WORKER_URL = os.getenv("CF_WORKER_URL", "").rstrip("/")

# Authentication
APP_ENV = os.getenv("PIVOTRADAR_ENV", "development").lower()
_secret_env = os.getenv("SECRET_KEY", "")
if not _secret_env:
    if APP_ENV == "production":
        raise RuntimeError("SECRET_KEY env degiskeni production ortaminda zorunludur.")

    import secrets as _secrets

    _secret_env = _secrets.token_hex(32)
    logging.getLogger(__name__).warning(
        "SECRET_KEY env degiskeni tanimli degil. Gecici bir anahtar uretildi; "
        "production ortaminda .env dosyasina SECRET_KEY ekleyin."
    )
SECRET_KEY = _secret_env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30

# K-4: TOTP secret şifreleme anahtarı (Fernet). 32-byte base64 değer.
# Üretimde: TOTP_ENCRYPTION_KEY env değişkeni ayarlanmalı.
# Eksikse: development modunda geçici anahtar türetilir (production'da hata verir).
_totp_key_env = os.getenv("TOTP_ENCRYPTION_KEY", "")
if not _totp_key_env:
    if APP_ENV == "production":
        raise RuntimeError("TOTP_ENCRYPTION_KEY env değişkeni production ortamında zorunludur.")
    import base64 as _b64
    _totp_key_env = _b64.urlsafe_b64encode(b"pivotradar-dev-totp-key-00000000").decode()
    logging.getLogger(__name__).warning(
        "TOTP_ENCRYPTION_KEY tanımlı değil. Geçici anahtar kullanılıyor; production'da .env'e ekleyin."
    )
TOTP_ENCRYPTION_KEY: str = _totp_key_env

# K-5b: Yedek şifrelemesi için ayrı anahtar. TOTP anahtarından bağımsız tutulur.
# Üretimde: BACKUP_ENCRYPTION_KEY env değişkeni ayrı bir Fernet key olarak ayarlanmalı.
_backup_key_env = os.getenv("BACKUP_ENCRYPTION_KEY", "")
if not _backup_key_env:
    _backup_key_env = _totp_key_env  # geriye dönük uyumluluk: ayrı key atanana kadar TOTP key kullan
    logging.getLogger(__name__).debug(
        "BACKUP_ENCRYPTION_KEY tanımlı değil; TOTP_ENCRYPTION_KEY fallback aktif."
    )
BACKUP_ENCRYPTION_KEY: str = _backup_key_env

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# Cloudflare Turnstile
TURNSTILE_SITE_KEY = os.getenv("TURNSTILE_SITE_KEY", "")
TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")
TURNSTILE_ENABLED = os.getenv("TURNSTILE_ENABLED", "False").lower() == "true"
if TURNSTILE_ENABLED and (not TURNSTILE_SITE_KEY or not TURNSTILE_SECRET_KEY):
    logging.getLogger(__name__).warning(
        "TURNSTILE_ENABLED aktif ama Turnstile anahtarlari eksik; Turnstile devre disi birakildi."
    )
    TURNSTILE_ENABLED = False

# SMTP Settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "info@pivotradar.net")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "info@pivotradar.net")
APP_URL = os.getenv("APP_URL", "https://pivot-radar.com")
