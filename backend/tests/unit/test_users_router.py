# backend/tests/unit/test_users_router.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.features.users import models, auth
from unittest.mock import MagicMock, patch

def test_read_user_me_unauthorized():
    client = TestClient(app)
    response = client.get("/api/users/me")
    assert response.status_code == 401

@patch("app.features.users.router.get_current_user")
def test_read_user_me_authorized(mock_get_user):
    # Mock a user
    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.email = "test@example.com"
    mock_user.full_name = "Test User"
    mock_user.profile_picture = None
    mock_user.is_superuser = False
    mock_user.is_active = True
    mock_user.settings = {}
    mock_user.email_verified = True
    mock_user.google_id = None
    mock_user.strategy_profile_id = 1
    mock_user.strategy_profile.name = "Trend Avcısı"
    
    # Aggressive override: search for any dependency named get_current_user
    for route in app.routes:
        if hasattr(route, "dependant"):
            # Check direct dependencies
            for dep in route.dependant.dependencies:
                if getattr(dep.call, "__name__", None) == "get_current_user":
                    app.dependency_overrides[dep.call] = lambda: mock_user
            # Check the endpoint itself if it has dependencies
            if getattr(route.dependant.call, "__name__", None) == "get_current_user":
                 app.dependency_overrides[route.dependant.call] = lambda: mock_user

    client = TestClient(app)
    try:
        response = client.get("/api/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["full_name"] == "Test User"
    finally:
        app.dependency_overrides = {} # Cleanup

def test_register_disabled():
    client = TestClient(app)
    # Mock get_system_setting to return registration_enabled=False
    with patch("app.features.admin.utils.get_system_setting") as mock_set:
        mock_set.return_value = {"registration_enabled": False}
        
        response = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "password": "password123",
            "full_name": "New User"
        }, headers={"X-Captcha-Token": "mock-token"})
        
        assert response.status_code == 403
        assert "Yeni kullanıcı kaydı geçici olarak durdurulmuştur" in response.json()["detail"]
