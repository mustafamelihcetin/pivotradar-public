# backend/tests/unit/test_core_utils.py
"""Unit tests — core utilities: circuit breaker, rate limiter, validators"""
import time
import pytest
from unittest.mock import MagicMock


# ── Circuit Breaker ───────────────────────────────────────────────────────────
class TestCircuitBreaker:
    def _make_cb(self, **kwargs):
        import uuid
        from app.core.circuit_breaker import CircuitBreaker
        return CircuitBreaker(name=f"test_cb_{uuid.uuid4().hex[:8]}", **kwargs)

    def test_initial_state_is_closed(self, db_session):
        from app.core.circuit_breaker import CBState
        cb = self._make_cb(failure_threshold=3)
        assert cb.state == CBState.CLOSED

    def test_opens_after_threshold_failures(self, db_session):
        from app.core.circuit_breaker import CBState, CircuitOpenError
        cb = self._make_cb(failure_threshold=3, recovery_timeout=9999)
        for _ in range(3):
            try:
                with cb:
                    raise ValueError("simulated failure")
            except ValueError:
                pass
            except CircuitOpenError:
                pass
        assert cb.state == CBState.OPEN

    def test_blocks_when_open(self, db_session):
        from app.core.circuit_breaker import CBState, CircuitOpenError
        cb = self._make_cb(failure_threshold=1, recovery_timeout=9999)
        try:
            with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        assert cb.state == CBState.OPEN
        with pytest.raises(CircuitOpenError):
            with cb:
                pass

    def test_half_open_after_timeout(self, db_session):
        from app.core.circuit_breaker import CBState
        cb = self._make_cb(failure_threshold=1, recovery_timeout=0.01)
        try:
            with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        time.sleep(0.05)
        # Trigger state check
        try:
            with cb:
                pass  # success → CLOSED
        except Exception:
            pass
        assert cb.state in (CBState.CLOSED, CBState.HALF_OPEN)

    def test_get_status_structure(self, db_session):
        cb = self._make_cb(failure_threshold=3)
        status = cb.get_status()
        assert "name" in status
        assert "state" in status
        assert "failure_count" in status
        assert status["failure_count"] == 0


# ── Per-Endpoint Rate Limiter ─────────────────────────────────────────────────
class TestEndpointRateLimiter:
    def _make_request(self, ip="1.2.3.4"):
        req = MagicMock()
        req.headers = {}
        req.client.host = ip
        return req

    def test_allows_within_limit(self, db_session):
        from app.core.rate_limit import _EndpointLimiter
        limiter = _EndpointLimiter(max_requests=5, window_seconds=60)
        req = self._make_request()
        for _ in range(5):
            limiter.check(req, db_session)  # should not raise

    def test_blocks_over_limit(self, db_session):
        from app.core.rate_limit import _EndpointLimiter
        from fastapi import HTTPException
        limiter = _EndpointLimiter(max_requests=3, window_seconds=60)
        req = self._make_request()
        for _ in range(3):
            limiter.check(req, db_session)
        with pytest.raises(HTTPException) as exc_info:
            limiter.check(req, db_session)
        assert exc_info.value.status_code == 429

    def test_different_ips_are_independent(self, db_session):
        from app.core.rate_limit import _EndpointLimiter
        limiter = _EndpointLimiter(max_requests=2, window_seconds=60)
        req1 = self._make_request("1.1.1.1")
        req2 = self._make_request("2.2.2.2")
        for _ in range(2):
            limiter.check(req1, db_session)
            limiter.check(req2, db_session)  # should not raise for req2

    def test_x_forwarded_for_used(self, db_session):
        from app.core.rate_limit import _EndpointLimiter
        from fastapi import HTTPException
        limiter = _EndpointLimiter(max_requests=1, window_seconds=60)
        req = MagicMock()
        req.headers = {"X-Forwarded-For": "10.0.0.1, 192.168.1.1"}
        req.client.host = "127.0.0.1"
        limiter.check(req, db_session)  # first — ok
        with pytest.raises(HTTPException):
            limiter.check(req, db_session)  # second — blocked on 10.0.0.1


# ── Symbol Validator ──────────────────────────────────────────────────────────
class TestSymbolValidator:
    def test_valid_symbols(self, db_session):
        from app.shared.utils.validators import validate_symbol
        assert validate_symbol("AKBNK") == "AKBNK"
        assert validate_symbol("akbnk") == "AKBNK"
        assert validate_symbol("AKBNK.IS") == "AKBNK"
        assert validate_symbol("XU100") == "XU100"
        assert validate_symbol("A1") == "A1"

    def test_invalid_symbols(self, db_session):
        from fastapi import HTTPException
        from app.shared.utils.validators import validate_symbol
        with pytest.raises(HTTPException):
            validate_symbol("../../etc/passwd")
        with pytest.raises(HTTPException):
            validate_symbol("A" * 11)
        with pytest.raises(HTTPException):
            validate_symbol("A")
        with pytest.raises(HTTPException):
            validate_symbol("AKBNK; DROP TABLE users")

    def test_valid_periods(self, db_session):
        from app.shared.utils.validators import validate_period
        for p in ("1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "MAX"):
            assert validate_period(p) == p

    def test_invalid_period(self, db_session):
        from fastapi import HTTPException
        from app.shared.utils.validators import validate_period
        with pytest.raises(HTTPException):
            validate_period("10Y")
        with pytest.raises(HTTPException):
            validate_period("; DROP TABLE")
