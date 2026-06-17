# PivotRadar

**BIST stock scanner and ML scoring platform — built from scratch, running in production.**

PivotRadar scans all actively traded stocks on Borsa Istanbul, applies a multi-profile rules engine (PRISM), and feeds the results into a calibrated machine learning model to produce a composite opportunity score for each symbol. The entire pipeline — from raw OHLCV ingestion through signal persistence, model training, and frontend delivery — runs as a self-contained Docker stack.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React + Vite SPA                     │
│         (served as static files by FastAPI)              │
└────────────────────────┬────────────────────────────────┘
                         │ REST / JSON
┌────────────────────────▼────────────────────────────────┐
│               FastAPI  (Gunicorn + Uvicorn)              │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Scanner    │  │  ML Pipeline │  │  Auth / Users  │  │
│  │  Engine     │  │  (PRISM)     │  │  (JWT + OAuth) │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘  │
│         │                │                               │
│  ┌──────▼──────┐  ┌──────▼───────┐                      │
│  │  APScheduler│  │  MLflow      │                      │
│  │  (cron jobs)│  │  (tracking)  │                      │
│  └─────────────┘  └──────────────┘                      │
└──────────────────────────┬──────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     PostgreSQL          Redis           MLflow DB
     (scan_scores,     (rate limit,     (SQLite,
      users, models)    cache)          experiment runs)
```

**Single deployable unit.** Everything ships in one Docker Compose file: the app, the database, Redis, MLflow, and a daily backup sidecar.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic |
| ML | scikit-learn — `HistGradientBoostingClassifier` + Platt calibration |
| Experiment tracking | MLflow |
| Frontend | React 18, Vite, Tailwind CSS |
| Database | PostgreSQL 16 |
| Cache / Rate limiting | Redis 7 |
| Container | Docker, Docker Compose |
| Process manager | Gunicorn + Uvicorn workers |
| Auth | JWT, Google OAuth2, TOTP (2FA), Cloudflare Turnstile |
| CI | GitHub Actions |

---

## ML Pipeline

The scoring model (`HistGradientBoostingClassifier` wrapped in `CalibratedClassifierCV`) is trained on historical scan records labeled by subsequent price outcome. The pipeline uses **33 features** across five versioned feature sets:

| Feature group | Examples |
|---|---|
| Core technical | RSI 14, ATR %, EMA gaps, volume ratio, body/range % |
| Momentum | EMA5−EMA20 delta, breakout strength, pattern score |
| Volatility | Bollinger Band width %, Keltner Channel squeeze |
| Oscillators | MACD histogram, Stochastic K, ADX 14 |
| Macro / regime | BIST-100 5d trend, USD/TRY 5d change, VIX regime |
| Relative strength | Stock vs BIST-100 5d return, sector relative strength |
| Context | Profile encoding, pattern type ordinal, pattern age (bars) |

Feature schema is versioned (`FEATURE_SCHEMA_VERSION`). Models with a mismatched schema version are automatically rejected at inference time, preventing silent training/inference skew.

Training produces a `.joblib` bundle stored in `models/`. MLflow tracks every run (AUC, log-loss, score distribution percentiles). The model is retrained on a rolling labeled dataset as new scan outcomes are confirmed.

---

## PRISM Signal Engine

PRISM (multi-**P**rofile **R**isk-adjusted **I**nference & **S**coring **M**odel) evaluates each symbol under multiple trading profiles simultaneously:

| Profile | Focus |
|---|---|
| Güvenli Liman | Low volatility, high quality threshold |
| Trend Avcısı | Strong directional momentum |
| Değer Kaşifi | Fundamental value signals |
| Dönüş Uzmanı | Reversal / mean-reversion setups |
| Agresif Büyüme | High-risk, high-reward breakouts |

Each profile produces its own QRS score (0–100), target price, stop price, and risk/reward ratio. The ML model score is blended with the rule score using a configurable weight (default: `PR_W_RULE=0.6`, `PR_W_ML=0.4`).

---

## Project Structure

```
pivotradar/
├── backend/
│   ├── app/
│   │   ├── core/              # Settings, database, scheduler, auth cache
│   │   ├── features/
│   │   │   ├── scanner/       # Engine pipeline, persistence, worker
│   │   │   │   ├── _engine_pipeline.py   # Core scan logic
│   │   │   │   ├── logic/persistence.py  # scan_scores DB writer
│   │   │   │   └── logic/worker.py       # APScheduler job
│   │   │   ├── scoring/
│   │   │   │   └── ml/        # Training, inference, calibration, constants
│   │   │   ├── admin/         # Admin panel API (routers split by domain)
│   │   │   ├── backtest/      # Strategy replay engine
│   │   │   ├── charts/        # OHLCV + pattern overlay
│   │   │   ├── market_data/   # Yahoo Finance client, universe management
│   │   │   └── users/         # JWT auth, registration, 2FA
│   │   └── shared/
│   │       ├── feature_builder.py   # Computes bb_width_pct, MACD, ADX, etc.
│   │       └── indicators/          # Momentum, volatility, volume helpers
│   ├── migrations/            # Alembic migration versions
│   └── tests/                 # 38 unit + 21 integration / security tests
├── frontend/
│   ├── src/
│   │   ├── features/          # Feature-sliced: auth, scanner, dashboard, etc.
│   │   ├── pages/             # Route-level page components
│   │   ├── core/              # Layout, API client, sidebar
│   │   └── store/             # Zustand auth store
│   └── vite.config.js
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── hotfix.ps1                 # Deploy & operations script
└── deploy.config.example.ps1  # Server config template (copy → deploy.config.ps1)
```

---

## Getting Started

### Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local frontend development only)
- Python 3.11+ (for local backend development only)

### 1. Clone and configure

```bash
git clone https://github.com/mustafamelihcetin/pivotradar-public.git
cd pivotradar-public
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, SECRET_KEY at minimum
```

Generate a secure `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Start the stack

```bash
docker compose up -d
```

This starts: PostgreSQL, Redis, MLflow, the app container, and the backup sidecar. Database schema is applied automatically on first boot via Alembic + runtime patch layer.

The app is available at `http://localhost` (port 80 by default, configurable via `HOST_PORT`).

### 3. Create the first admin user

```bash
docker exec -it pivot-radar-terminal python -c "
from app.core.database import SessionLocal
from app.features.users.models import User
from app.features.users.auth import get_password_hash
db = SessionLocal()
u = User(email='admin@example.com', hashed_password=get_password_hash('changeme'), is_superuser=True, is_active=True, is_verified=True)
db.add(u); db.commit(); print('Admin created.')
"
```

### 4. Local frontend development

```bash
cd frontend
npm install
npm run dev          # Vite dev server on :5173, proxies API to :8051
```

---

## Running Tests

```bash
# Unit tests (no database required)
docker compose run --rm pivot-radar-test

# Or locally with a running database
cd backend
pytest tests/unit/ -q

# Full integration suite
pytest tests/ -ra --tb=short
```

The test suite covers: auth flows, scanner engine, ML feature parity, admin endpoints, rate limiting, and 2FA.

---

## Deployment

The project ships with `hotfix.ps1`, a PowerShell operations script for deploying to a remote Linux server over SSH.

```powershell
# Copy and fill in your server details
cp deploy.config.example.ps1 deploy.config.ps1
# Edit deploy.config.ps1 with your SERVER_IP, SERVER_USER, SERVER_PATH

.\hotfix.ps1   # Interactive menu
.\hotfix.ps1 1 # Backend only  (~15s)
.\hotfix.ps1 2 # Frontend only (build + upload, ~1min)
.\hotfix.ps1 3 # Full deploy
.\hotfix.ps1 7 # Health check
```

The script builds the React bundle, packages backend code, transfers via SCP, extracts on the remote, and restarts the container — with live log tailing and HTTP health verification.

---

## Configuration Reference

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | Database password |
| `SECRET_KEY` | ✅ | JWT signing key (min 32 bytes) |
| `ENVIRONMENT` | ✅ | `production` / `development` / `test` |
| `SENTRY_DSN` | Recommended | Error tracking |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth login |
| `SMTP_HOST` | Optional | Email verification |
| `TURNSTILE_SITE_KEY` | Optional | Cloudflare bot protection |
| `VITE_API_BASE` | Optional | API base URL for frontend build |

See `.env.example` for the full list.

---

## Key Design Decisions

**No ORM magic for scan results.** The `persist_scan_results` function writes directly to `scan_scores` using `bulk_save_objects` after an explicit delete-then-insert for idempotent re-runs. This avoids upsert complexity across multi-profile result sets.

**Versioned feature schema.** A `FEATURE_SCHEMA_VERSION` integer is embedded in both the trained model metadata and each `scan_scores` row. The inference path rejects model files that don't match the current schema version, making it impossible to silently serve predictions from a stale model.

**Circuit breaker on external data.** All Yahoo Finance requests go through a `CircuitBreaker` with exponential backoff and configurable `max_backoff`. When the upstream is degraded, the scanner skips rather than stalls.

**Train/inference feature parity.** `feature_builder.py` is the single source of truth for derived features (Bollinger Band width, MACD histogram, ADX, Stochastic K, KC squeeze). Both training and inference call the same function — no duplication, no skew.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Disclaimer

PivotRadar is a technical analysis and data visualization tool. It does not constitute investment advice. All scan results and scores are for informational purposes only. Past signals do not guarantee future performance.
