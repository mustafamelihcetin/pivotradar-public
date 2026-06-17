# PivotRadar

BIST hisselerini tarayan, çok profilli kural motoru ve kalibreli makine öğrenmesi modeliyle fırsat skorlaması yapan full-stack bir analiz platformu. Sıfırdan tasarlanıp production'da çalışıyor.

---

## Mimari

```
┌─────────────────────────────────────────────────────────┐
│                     React + Vite SPA                     │
│         (FastAPI tarafından static dosya olarak sunulur) │
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
│  │ APScheduler │  │    MLflow    │                      │
│  │ (cron jobs) │  │  (tracking)  │                      │
│  └─────────────┘  └──────────────┘                      │
└──────────────────────────┬──────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     PostgreSQL          Redis           MLflow DB
     (scan_scores,     (rate limit,     (SQLite,
      users, models)    cache)          experiment runs)
```

Tek bir Docker Compose dosyasıyla ayağa kalkan bağımsız bir yığın: uygulama, veritabanı, Redis, MLflow ve günlük otomatik yedek servisi.

---

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic |
| ML | scikit-learn — `HistGradientBoostingClassifier` + Platt kalibrasyon |
| Deney takibi | MLflow |
| Frontend | React 18, Vite, Tailwind CSS |
| Veritabanı | PostgreSQL 16 |
| Cache / Rate limiting | Redis 7 |
| Container | Docker, Docker Compose |
| Process manager | Gunicorn + Uvicorn workers |
| Auth | JWT, Google OAuth2, TOTP (2FA), Cloudflare Turnstile |
| CI | GitHub Actions |

---

## ML Pipeline

Model, `HistGradientBoostingClassifier` + `CalibratedClassifierCV` (Platt) kombinasyonuyla oluşturulmuş. Etiketlenmiş tarama kayıtları üzerinde eğitiliyor; etiket kaynağı fiyat hareketi çıktısı. **33 özellik**, 5 versiyonlu feature grubunda organize edilmiş:

| Grup | Örnekler |
|---|---|
| Temel teknik | RSI 14, ATR %, EMA gap'leri, hacim oranı, body/range % |
| Momentum | EMA5−EMA20 deltası, kırılım gücü, formasyon skoru |
| Volatilite | Bollinger Band genişlik %, Keltner Channel sıkışması |
| Osilatörler | MACD histogram, Stochastic K, ADX 14 |
| Makro / rejim | BIST-100 5g trend, USD/TRY 5g değişim, VIX rejimi |
| Relatif güç | Hisse vs BIST-100 5g getiri, sektör relatif gücü |
| Bağlam | Profil encoding, formasyon tipi ordinal, formasyon yaşı (bar) |

Feature şeması versiyonlanmış (`FEATURE_SCHEMA_VERSION`). Şema sürümü uyumsuz modeller inference anında reddediliyor; training/inference skew'u kod düzeyinde imkânsız kılınıyor.

MLflow her eğitim çalışmasını izliyor: AUC, log-loss, skor dağılımı yüzdelikleri. Yeni tarama çıktıları etiketlendikçe model, kayan etiketli dataset üzerinde yeniden eğitiliyor.

---

## PRISM Sinyal Motoru

PRISM (**P**rofile-based **R**isk-adjusted **I**nference & **S**coring **M**odel), her sembolü aynı anda birden fazla işlem profiline göre değerlendiriyor:

| Profil | Odak |
|---|---|
| Güvenli Liman | Düşük volatilite, yüksek kalite eşiği |
| Trend Avcısı | Güçlü yönlü momentum |
| Değer Kaşifi | Temel değer sinyalleri |
| Dönüş Uzmanı | Reversal / ortalamaya dönüş kurulumları |
| Agresif Büyüme | Yüksek risk/yüksek getiri kırılımları |

Her profil kendi QRS skorunu (0–100), hedef fiyatı, stop fiyatını ve risk/ödül oranını üretiyor. ML skoru kural skoru ile ağırlıklı olarak harmanlıyor (`PR_W_RULE=0.6`, `PR_W_ML=0.4`).

---

## Proje Yapısı

```
pivotradar/
├── backend/
│   ├── app/
│   │   ├── core/              # Ayarlar, veritabanı, zamanlayıcı, auth cache
│   │   ├── features/
│   │   │   ├── scanner/       # Engine pipeline, persistence, worker
│   │   │   │   ├── _engine_pipeline.py   # Tarama çekirdeği
│   │   │   │   ├── logic/persistence.py  # scan_scores DB yazıcı
│   │   │   │   └── logic/worker.py       # APScheduler görevi
│   │   │   ├── scoring/
│   │   │   │   └── ml/        # Eğitim, inference, kalibrasyon, sabitler
│   │   │   ├── admin/         # Admin panel API (alan bazlı router'lar)
│   │   │   ├── backtest/      # Strateji replay motoru
│   │   │   ├── charts/        # OHLCV + formasyon overlay
│   │   │   ├── market_data/   # Yahoo Finance client, evren yönetimi
│   │   │   └── users/         # JWT auth, kayıt, 2FA
│   │   └── shared/
│   │       ├── feature_builder.py   # BB genişlik, MACD, ADX vb. hesaplar
│   │       └── indicators/          # Momentum, volatilite, hacim yardımcıları
│   ├── migrations/            # Alembic migrasyon versiyonları
│   └── tests/                 # 38 birim + 21 entegrasyon / güvenlik testi
├── frontend/
│   ├── src/
│   │   ├── features/          # Feature-sliced: auth, scanner, dashboard vb.
│   │   ├── pages/             # Route seviyesi sayfa bileşenleri
│   │   ├── core/              # Layout, API client, sidebar
│   │   └── store/             # Zustand auth store
│   └── vite.config.js
├── docker-compose.yml
├── Dockerfile
└── hotfix.ps1                 # Deploy ve operasyon scripti
```

---

## Öne Çıkan Tasarım Kararları

**Scan sonuçları için ORM bypass.** `persist_scan_results`, çok profilli sonuç setlerinde upsert karmaşıklığını önlemek için `bulk_save_objects` ile doğrudan sil+yaz stratejisi kullanıyor; idempotent re-run destekli.

**Versiyonlanmış feature şeması.** `FEATURE_SCHEMA_VERSION` hem model metadata'sına hem her `scan_scores` satırına yazılıyor. Eski şema versiyonlu modeller inference anında reddediliyor; sessiz skor üretimi önleniyor.

**Harici veri için circuit breaker.** Tüm Yahoo Finance istekleri exponential backoff ve `max_backoff` limiti olan `CircuitBreaker`'dan geçiyor. Upstream bozulduğunda tarayıcı beklemek yerine atlıyor.

**Training/inference özellik paritesi.** `feature_builder.py`, türetilmiş özellikler için (Bollinger Band genişliği, MACD histogram, ADX, Stochastic K, KC sıkışma) tek kaynak. Hem eğitim hem inference aynı fonksiyonu çağırıyor; duplikasyon ve skew yok.

---

## Lisans

MIT — bkz. [LICENSE](LICENSE).

---

## Yasal Uyarı

PivotRadar bir teknik analiz ve veri görselleştirme aracıdır. Yatırım tavsiyesi niteliği taşımaz. Tüm tarama sonuçları ve skorlar yalnızca bilgilendirme amaçlıdır.
