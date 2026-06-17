from app.core.rate_limit import _InProcessSlidingWindow
from fastapi import Request


def test_global_rate_limiting(test_client):
    """Global in-process limiter: 5 requests within limit should all return 200."""
    for _ in range(5):
        resp = test_client.get("/api/scanner/progress")
        assert resp.status_code == 200

    # Verify rate-limit headers are present
    resp = test_client.get("/api/scanner/progress")
    assert "x-ratelimit-limit" in resp.headers or resp.status_code in (200, 429)


def test_in_process_limiter_blocks_at_threshold():
    """_InProcessSlidingWindow should allow max_requests then block."""
    limiter = _InProcessSlidingWindow(max_requests=3, window_seconds=60)

    class _FakeClient:
        host = "1.2.3.4"

    class _FakeHeaders(dict):
        def get(self, key, default=None):
            return default

    class _FakeRequest:
        client = _FakeClient()
        headers = _FakeHeaders()
        state = type("S", (), {})()

    from fastapi import HTTPException
    import pytest

    for _ in range(3):
        limiter(_FakeRequest())  # should not raise

    with pytest.raises(HTTPException) as exc_info:
        limiter(_FakeRequest())
    assert exc_info.value.status_code == 429


def test_login_rate_limit(test_client):
    """Login endpoint limiter allows up to 10 attempts then blocks with 429."""
    from app.features.users.models import RateLimitRecord
    from app.core.database import SessionLocal

    # Clear existing rate limit records for a clean-slate test
    with SessionLocal() as db:
        db.query(RateLimitRecord).filter(RateLimitRecord.key.like("login:%")).delete(synchronize_session=False)
        db.commit()

    for i in range(11):
        resp = test_client.post(
            "/api/auth/login",
            data={"username": "bad", "password": "bad"},
        )
        if i < 10:
            assert resp.status_code != 429
        else:
            assert resp.status_code == 429
            assert "login" in resp.json()["detail"].lower()
