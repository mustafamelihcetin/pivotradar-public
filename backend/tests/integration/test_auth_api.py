# backend/tests/integration/test_auth_api.py
"""Integration tests — authentication flow (register, login, force-change)"""
import pytest


class TestRegistrationAndLogin:
    def test_register_missing_fields_rejected(self, test_client):
        resp = test_client.post("/api/auth/register", json={})
        assert resp.status_code == 422

    def test_login_invalid_credentials_rejected(self, test_client):
        resp = test_client.post(
            "/api/auth/login",
            data={"username": "nobody@nowhere.invalid", "password": "wrong"},
        )
        assert resp.status_code in (400, 401, 403, 422)

    def test_protected_endpoint_requires_token(self, test_client):
        resp = test_client.get("/api/users/me")
        assert resp.status_code in (401, 403)


class TestForcePasswordChange:
    def test_change_password_without_token_rejected(self, test_client):
        resp = test_client.post(
            "/api/users/me/change-password",
            json={"current_password": "", "new_password": "NewSecure99!"},
        )
        assert resp.status_code in (401, 403)

    def test_change_password_fake_token_rejected(self, test_client):
        resp = test_client.post(
            "/api/users/me/change-password",
            json={"current_password": "", "new_password": "abc"},
            headers={"Authorization": "Bearer fake_token"},
        )
        assert resp.status_code in (400, 401, 403, 422)


class TestPasswordResetAdmin:
    def test_reset_password_no_token_returns_401(self, test_client):
        resp = test_client.post("/api/admin/users/9999999/reset-password")
        assert resp.status_code in (401, 403)

    def test_login_response_structure_on_success(self, test_client):
        resp = test_client.post(
            "/api/auth/login",
            data={"username": "testforcechange@test.invalid", "password": "x"},
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "change_password_required" in data
