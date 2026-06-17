# backend/app/core/logging_config.py
"""
JSON yapılandırılmış loglama.

Her log satırı şu alanları içerir:
  ts, level, logger, msg, + varsa: user_id, endpoint, latency_ms, status_code
"""
import json
import logging
import time
from typing import Any, Dict


class JsonFormatter(logging.Formatter):
    """Standart log kayıtlarını tek satır JSON'a çevirir."""

    def format(self, record: logging.LogRecord) -> str:
        log: Dict[str, Any] = {
            "ts":     self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":  record.levelname,
            "logger": record.name,
            "msg":    record.getMessage(),
        }
        # Extra alanlar (request middleware tarafından eklenir)
        for key in ("user_id", "endpoint", "method", "latency_ms", "status_code", "ip"):
            val = getattr(record, key, None)
            if val is not None:
                log[key] = val

        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)

        return json.dumps(log, ensure_ascii=False)


def configure_json_logging(env: str = "production") -> None:
    """
    Root logger'ı JSON formatlayıcıyla yapılandırır.
    Development ortamında okunabilir format kullanılır.
    """
    root = logging.getLogger()

    # Mevcut handler'ları temizle (basicConfig'den gelenler)
    for h in root.handlers[:]:
        root.removeHandler(h)

    handler = logging.StreamHandler()

    if env in ("production", "prod"):
        handler.setFormatter(JsonFormatter())
    else:
        fmt = logging.Formatter(
            "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
            datefmt="%H:%M:%S",
        )
        handler.setFormatter(fmt)

    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Gürültülü kütüphaneleri kapat
    for noisy in ("yfinance", "urllib3", "httpx", "httpcore", "apscheduler"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
