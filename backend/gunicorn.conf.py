# backend/gunicorn.conf.py
bind             = "0.0.0.0:8051"
workers          = 2
worker_class     = "uvicorn.workers.UvicornWorker"
timeout          = 120
worker_tmp_dir   = "/tmp"
accesslog        = "-"
errorlog         = "-"
loglevel         = "info"
pidfile          = "/tmp/gunicorn.pid"   # /home/pivotuser arbiter socket hatasını önler

# Worker memory leak koruması: her worker N istekten sonra yeniden başlatılır
max_requests        = 1000
max_requests_jitter = 100   # ±100 istek rastgele jitter (thundering herd önler)

# Uygulama exception'larında worker exit (UvicornWorker ile çalışır)
# Böylece bozuk state biriken bir worker yerine temiz bir worker başlar
preload_app = False  # her worker kendi lifespan'ini başlatsın (APScheduler vs.)
