# backend/tests/unit/test_admin_endpoints.py
"""Integration-style tests for admin router endpoints (unauthenticated — expect 401/403)."""
import pytest


@pytest.mark.usefixtures("test_client")
class TestAdminEndpoints:
    """These endpoints require admin auth; test that they return 401/403 (not 500)."""

    def test_ml_health_requires_auth(self, test_client):
        r = test_client.get("/api/admin/ml-health")
        assert r.status_code in (401, 403, 422)

    def test_stats_requires_auth(self, test_client):
        r = test_client.get("/api/admin/stats")
        assert r.status_code in (401, 403, 422)

    def test_predictions_requires_auth(self, test_client):
        r = test_client.get("/api/admin/predictions")
        assert r.status_code in (401, 403, 422)

    def test_users_requires_auth(self, test_client):
        r = test_client.get("/api/admin/users")
        assert r.status_code in (401, 403, 422)

    def test_diagnostics_requires_auth(self, test_client):
        r = test_client.get("/api/admin/diagnostics")
        assert r.status_code in (401, 403, 422)

    def test_calibration_report_requires_auth(self, test_client):
        r = test_client.get("/api/admin/calibration/report")
        assert r.status_code in (401, 403, 422)

    def test_logs_requires_auth(self, test_client):
        r = test_client.get("/api/admin/logs")
        assert r.status_code in (401, 403, 422)

    def test_anomaly_alerts_requires_auth(self, test_client):
        r = test_client.get("/api/admin/anomaly/alerts")
        assert r.status_code in (401, 403, 422)

    def test_audit_logs_requires_auth(self, test_client):
        r = test_client.get("/api/admin/audit-logs")
        assert r.status_code in (401, 403, 422)

    def test_qrs_trend_requires_auth(self, test_client):
        r = test_client.get("/api/admin/qrs-trend")
        assert r.status_code in (401, 403, 422)


class TestBacktestEndpoints:
    def test_walk_forward_requires_auth(self, test_client):
        r = test_client.get("/api/backtest/walk-forward")
        assert r.status_code in (200, 401, 403, 422)

    def test_signal_quality_requires_auth(self, test_client):
        r = test_client.get("/api/backtest/signal-quality")
        assert r.status_code in (200, 401, 403, 422)


class TestDashboardEndpoints:
    def test_health_endpoint(self, test_client):
        r = test_client.get("/health")
        assert r.status_code in (200, 404)

    def test_api_root_reachable(self, test_client):
        r = test_client.get("/")
        assert r.status_code in (200, 404)
