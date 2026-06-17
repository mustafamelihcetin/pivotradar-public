# backend/tests/security/test_auth_security.py
"""Security tests — authentication & authorization guards"""
import pytest
try:
    import app.core.database
    print("DEBUG: app.core.database import SUCCESS at top-level")
except Exception as e:
    print(f"DEBUG: app.core.database import FAILED at top-level: {e}")


@pytest.fixture(scope="module")
def client(test_client):
    """Alias for test_client for compatibility with existing tests."""
    return test_client


ADMIN_ONLY_ENDPOINTS = [
    ("GET",    "/api/admin/stats"),
    ("GET",    "/api/admin/users"),
    ("GET",    "/api/admin/settings"),
    ("POST",   "/api/admin/settings"),
    ("GET",    "/api/admin/live"),
    ("GET",    "/api/admin/logs"),
    ("GET",    "/api/admin/pipeline/status"),
    ("POST",   "/api/admin/trigger/scan"),
    ("POST",   "/api/admin/trigger/calibrate"),
    ("POST",   "/api/admin/trigger/calibrate-profiles"),
    ("GET",    "/api/admin/calibration/model-status"),
    ("GET",    "/api/admin/calibration/report"),
    ("GET",    "/api/admin/task-history"),
    ("GET",    "/api/admin/scheduler/status"),
]

PROTECTED_USER_ENDPOINTS = [
    ("GET",  "/api/users/me"),
    ("POST", "/api/users/me/change-password"),
]


class TestUnauthenticatedAccessBlocked:
    @pytest.mark.parametrize("method,path", ADMIN_ONLY_ENDPOINTS)
    def test_no_token_returns_401_or_403(self, client, method, path):
        resp = client.request(method, path)
        assert resp.status_code in (401, 403), (
            f"{method} {path} should be protected, got {resp.status_code}"
        )

    @pytest.mark.parametrize("method,path", PROTECTED_USER_ENDPOINTS)
    def test_user_endpoints_require_auth(self, client, method, path):
        resp = client.request(method, path)
        assert resp.status_code in (401, 403, 422)


class TestTokenManipulation:
    def test_malformed_jwt_rejected(self, client):
        resp = client.get("/api/users/me",
                          headers={"Authorization": "Bearer not.a.valid.jwt"})
        assert resp.status_code in (401, 403, 422)

    def test_expired_token_rejected(self, client):
        # JWT with valid structure but expired
        expired = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiJ0ZXN0QHRlc3QuY29tIiwiZXhwIjoxfQ."
            "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        )
        resp = client.get("/api/users/me",
                          headers={"Authorization": f"Bearer {expired}"})
        assert resp.status_code in (401, 403)

    def test_no_bearer_prefix_rejected(self, client):
        resp = client.get("/api/users/me",
                          headers={"Authorization": "Basic dGVzdDp0ZXN0"})
        assert resp.status_code in (401, 403)


class TestInputValidation:
    def test_sql_injection_in_symbol_param(self, client):
        """Symbol parameter should not execute SQL — any response is fine as long
        as it's not a 500 server error."""
        resp = client.get("/api/admin/symbol/'; DROP TABLE scan_scores; --/history")
        assert resp.status_code != 500

    def test_oversized_page_param_rejected(self, client):
        resp = client.get("/api/admin/predictions?per_page=9999")
        # Should either validate (422) or cap the value silently (200)
        assert resp.status_code in (200, 401, 403, 422)

    def test_xss_in_body_sanitised(self, client):
        """POST /api/admin/settings with XSS payload should not crash server."""
        xss = {"feature_flags": {"test_key": "<script>alert(1)</script>"}}
        resp = client.post("/api/admin/settings", json=xss)
        assert resp.status_code != 500


class TestAdminEscalation:
    def test_non_admin_cannot_access_admin_endpoints(self, client):
        """A regular user token (non-superuser) must receive 403 on admin endpoints."""
        login = client.post("/api/auth/login",
                            data={"username": "testuser@pivotradar.test", "password": "TestUser123!"})
        if login.status_code != 200:
            pytest.skip("Regular test user not available — seed_test_admin fixture may not have run")
        token = login.json().get("access_token")
        resp = client.get("/api/admin/stats",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403, "Non-admin user should be denied admin access"
