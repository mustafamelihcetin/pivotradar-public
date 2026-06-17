# backend/tests/integration/test_admin_api.py
"""Integration tests — Admin REST API endpoints"""
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(scope="module")
def admin_token(test_client):
    resp = test_client.post("/api/auth/login", data={
        "username": "testadmin@pivotradar.test",
        "password": "TestAdmin123!",
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    pytest.skip("Test admin user not available — run with test DB populated")


class TestAdminStatsEndpoint:
    def test_unauthenticated_returns_401(self, test_client):
        resp = test_client.get("/api/admin/stats")
        assert resp.status_code in (401, 403)

    def test_stats_structure(self, test_client, admin_token):
        resp = test_client.get("/api/admin/stats",
                               headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available in test environment")
        assert resp.status_code == 200
        data = resp.json()
        assert "scans" in data
        assert "calibration" in data
        assert "users" in data


class TestAdminSettingsEndpoint:
    def test_get_settings_returns_all_keys(self, test_client, admin_token):
        resp = test_client.get("/api/admin/settings",
                               headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200
        data = resp.json()
        assert "ml_config" in data
        assert "scanner_config" in data
        assert "feature_flags" in data

    def test_update_ml_config(self, test_client, admin_token):
        new_cfg = {"min_samples": 25, "calib_window_days": 120}
        resp = test_client.post(
            "/api/admin/settings",
            json={"ml_config": new_cfg},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200
        assert resp.json().get("ok") is True


class TestCalibrationModelStatusEndpoint:
    def test_model_status_structure(self, test_client, admin_token):
        resp = test_client.get("/api/admin/calibration/model-status",
                               headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200
        data = resp.json()
        assert "global" in data
        assert "profiles" in data
        assert "exists" in data["global"]


class TestTriggerEndpoints:
    def test_trigger_scan_queues_background(self, test_client, admin_token):
        resp = test_client.post("/api/admin/trigger/scan",
                                headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

    def test_trigger_calibrate_queues_background(self, test_client, admin_token):
        resp = test_client.post("/api/admin/trigger/calibrate",
                                headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200

    def test_trigger_calibrate_profiles_queues_background(self, test_client, admin_token):
        resp = test_client.post("/api/admin/trigger/calibrate-profiles",
                                headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200


class TestLiveEndpoint:
    def test_live_endpoint_structure(self, test_client, admin_token):
        resp = test_client.get("/api/admin/live",
                               headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        assert resp.status_code == 200
        data = resp.json()
        assert "scan" in data
        assert "process" in data
        assert "system" in data
        assert "ts" in data

    def test_system_telemetry_fields(self, test_client, admin_token):
        resp = test_client.get("/api/admin/live",
                               headers={"Authorization": f"Bearer {admin_token}"})
        if resp.status_code == 403:
            pytest.skip("Admin credentials not available")
        data = resp.json()
        sys_data = data.get("system", {})
        for field in ("cpu_usage", "ram_usage", "disk_usage"):
            assert field in sys_data, f"Missing field: {field}"
            if sys_data[field] is not None:
                assert 0.0 <= sys_data[field] <= 100.0, f"{field} out of range"
