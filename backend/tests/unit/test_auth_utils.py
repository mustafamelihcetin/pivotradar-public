# tests/unit/test_auth_utils.py
"""Unit tests for JWT token creation/decoding and password hashing."""
import pytest
from datetime import timedelta

from app.features.users.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        hashed = get_password_hash("secret123")
        assert verify_password("secret123", hashed) is True

    def test_wrong_password_fails(self):
        hashed = get_password_hash("secret123")
        assert verify_password("wrong", hashed) is False


class TestTokenCreation:
    def test_access_token_decodable(self):
        token = create_access_token("user@example.com")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user@example.com"
        assert payload["type"] == "access"

    def test_refresh_token_decodable(self):
        token = create_refresh_token(42)
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "42"
        assert payload["type"] == "refresh"

    def test_token_has_jti(self):
        token = create_access_token("user")
        payload = decode_token(token)
        assert "jti" in payload

    def test_custom_expiry(self):
        token = create_access_token("user", expires_delta=timedelta(minutes=5))
        payload = decode_token(token)
        assert payload is not None


class TestDecodeToken:
    def test_none_returns_none(self):
        assert decode_token(None) is None

    def test_invalid_token_returns_none(self):
        assert decode_token("not.a.valid.token") is None

    def test_empty_string_returns_none(self):
        assert decode_token("") is None
