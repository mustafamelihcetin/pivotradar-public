# backend/app/core/circuit_breaker.py
"""
Circuit Breaker — harici veri kaynaklarını korur.

Durumlar:
  CLOSED   → normal çalışma
  OPEN     → devre açık, istekler bloke edilir
  HALF_OPEN → test isteği gönderilir, başarılıysa CLOSED'a döner

Redis varsa state Redis'te saklanır — process restart'ta OPEN state korunur.
Redis yoksa: in-memory (önceki davranış).

Kullanım:
    cb = get_circuit_breaker("yfinance")
    with cb:
        df = yf.download(...)
"""
import time
import threading
import logging
from enum import Enum
from typing import Dict

logger = logging.getLogger("PivotRadar.CircuitBreaker")


class CBState(Enum):
    CLOSED    = "closed"
    OPEN      = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 120.0,
        success_threshold: int = 1,
        max_backoff: float = 3600.0,   # üstel geri çekilme üst sınırı (saniye)
    ):
        self.name              = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout  = recovery_timeout
        self.success_threshold = success_threshold
        self.max_backoff       = max_backoff

        self._state              = CBState.CLOSED
        self._failure_count      = 0
        self._success_count      = 0
        self._opened_at:  float  = 0.0
        self._open_cycles: int   = 0   # kaç kez OPEN→HALF_OPEN→OPEN döngüsü yaşandı
        self._current_timeout: float = recovery_timeout
        self._lock               = threading.Lock()

        self._load_from_redis()

    def _redis_key(self) -> str:
        return f"cb:{self.name}"

    def _load_from_redis(self) -> None:
        try:
            from .redis_client import redis_hgetall, is_available
            if not is_available():
                return
            data = redis_hgetall(self._redis_key())
            if not data:
                return
            state_val = data.get("state", "closed")
            self._state = CBState(state_val)
            self._failure_count = int(data.get("failure_count", 0))
            self._opened_at = float(data.get("opened_at", 0.0))
        except Exception as e:
            logger.debug("CB Redis load hata (%s): %s", self.name, e)

    def _save_to_redis(self) -> None:
        try:
            from .redis_client import redis_hset, redis_expire, is_available
            if not is_available():
                return
            redis_hset(self._redis_key(), {
                "state":         self._state.value,
                "failure_count": str(self._failure_count),
                "opened_at":     str(self._opened_at),
            })
            redis_expire(self._redis_key(), int(self.recovery_timeout * 3))
        except Exception as e:
            logger.debug("CB Redis save hata (%s): %s", self.name, e)

    @property
    def state(self) -> CBState:
        return self._state

    def _try_recover(self) -> None:
        if self._state == CBState.OPEN:
            if time.time() - self._opened_at >= self._current_timeout:
                self._state         = CBState.HALF_OPEN
                self._success_count = 0
                self._save_to_redis()
                logger.info(f"[CB:{self.name}] HALF_OPEN — test isteği gönderilecek")

    def __enter__(self):
        with self._lock:
            self._try_recover()
            if self._state == CBState.OPEN:
                raise CircuitOpenError(
                    f"[CB:{self.name}] Devre açık — "
                    f"{int(self._current_timeout - (time.time() - self._opened_at))}s kaldı"
                )
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        with self._lock:
            if exc_type is not None and not issubclass(exc_type, CircuitOpenError):
                self._on_failure()
            else:
                self._on_success()
        return False

    def _on_failure(self) -> None:
        self._failure_count += 1
        self._success_count = 0
        logger.warning(f"[CB:{self.name}] Hata #{self._failure_count}/{self.failure_threshold}")
        if self._failure_count >= self.failure_threshold:
            # Üstel geri çekilme: her açılış döngüsünde timeout iki katına çıkar (max_backoff'a kadar)
            if self._state == CBState.HALF_OPEN:
                # HALF_OPEN'da tekrar başarısız → önceki açılış döngüsü tamamlandı
                self._open_cycles += 1
                self._current_timeout = min(
                    self.max_backoff,
                    self.recovery_timeout * (2 ** self._open_cycles),
                )
                logger.warning(
                    f"[CB:{self.name}] Arka arkaya arıza #{self._open_cycles} — "
                    f"sonraki bekleme {self._current_timeout:.0f}s"
                )
            self._state     = CBState.OPEN
            self._opened_at = time.time()
            self._save_to_redis()
            logger.error(f"[CB:{self.name}] OPEN — {self._current_timeout:.0f}s devre dışı")

    def _on_success(self) -> None:
        if self._state == CBState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.success_threshold:
                self._state            = CBState.CLOSED
                self._failure_count    = 0
                self._open_cycles      = 0                    # başarı → sayacı sıfırla
                self._current_timeout  = self.recovery_timeout  # timeout'u sıfırla
                self._save_to_redis()
                logger.info(f"[CB:{self.name}] CLOSED — devre kapandı")
        elif self._state == CBState.CLOSED:
            self._failure_count = 0

    def get_status(self) -> dict:
        with self._lock:
            self._try_recover()
            remaining = max(0.0, self._current_timeout - (time.time() - self._opened_at))
            return {
                "name":                 self.name,
                "state":                self._state.value,
                "failure_count":        self._failure_count,
                "open_cycles":          self._open_cycles,
                "current_timeout_s":    self._current_timeout,
                "recovery_remaining_s": round(remaining, 1) if self._state == CBState.OPEN else 0,
            }


class CircuitOpenError(Exception):
    """Devre açıkken atılan istisna."""


# Singleton registry
_breakers: Dict[str, CircuitBreaker] = {}
_registry_lock = threading.Lock()


def get_circuit_breaker(name: str, **kwargs) -> CircuitBreaker:
    with _registry_lock:
        if name not in _breakers:
            _breakers[name] = CircuitBreaker(name=name, **kwargs)
        return _breakers[name]


def get_all_statuses() -> list:
    with _registry_lock:
        return [cb.get_status() for cb in _breakers.values()]
