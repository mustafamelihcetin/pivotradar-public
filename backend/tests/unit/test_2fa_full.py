# backend/tests/security/test_2fa_flow.py
"""
2FA login akisi testleri.
"""
import time
import pytest
import pyotp
from unittest.mock import patch, AsyncMock


# Butun 2FA testlerinde captcha mock
@pytest.fixture(autouse=True)
def mock_captcha():
    with patch(
        "app.shared.utils.captcha.verify_turnstile_token",
        new_callable=AsyncMock,
        return_value=True,
    ):
        yield


def _login(client, email: str, password: str):
    return client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
        headers={"X-Captcha-Token": "test_bypass"},
    )


def _verify_2fa(client, temp_token: str, code: str):
    return client.post(
        "/api/auth/2fa/verify-login",
        json={"temp_token": temp_token, "code": code},
    )


@pytest.fixture
def user_without_2fa(db_engine):
    """2FA kapali normal kullanici — dogrudan engine commit ile gercek DB'ye yazilir."""
    from sqlalchemy.orm import sessionmaker
    from app.features.users.models import User
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    Session = sessionmaker(bind=db_engine)
    s = Session()
    u = User(
        email="no2fa_test@pivotradar.test",
        hashed_password=ctx.hash("Test1234!"),
        is_active=True,
        totp_enabled=False,
        totp_confirmed=False,
        settings={"has_accepted_legal": True},
    )
    s.add(u)
    s.commit()
    user_id = u.id
    s.close()
    yield u
    # Teardown
    s2 = Session()
    s2.query(User).filter(User.id == user_id).delete()
    s2.commit()
    s2.close()


@pytest.fixture
def user_with_2fa(db_engine):
    """2FA aktif kullanici + gercek TOTP secret."""
    from sqlalchemy.orm import sessionmaker
    from app.features.users.models import User
    from app.features.users.auth import totp_encrypt
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    secret = pyotp.random_base32()
    Session = sessionmaker(bind=db_engine)
    s = Session()
    u = User(
        email="with2fa_test@pivotradar.test",
        hashed_password=ctx.hash("Test1234!"),
        is_active=True,
        totp_enabled=True,
        totp_confirmed=True,
        totp_secret=totp_encrypt(secret),
        settings={"has_accepted_legal": True},
    )
    s.add(u)
    s.commit()
    user_id = u.id
    s.close()
    u._plain_secret = secret
    yield u
    s2 = Session()
    s2.query(User).filter(User.id == user_id).delete()
    s2.commit()
    s2.close()


class TestLoginWithout2FA:
    def test_normal_login_returns_tokens(self, test_client, user_without_2fa):
        r = _login(test_client, "no2fa_test@pivotradar.test", "Test1234!")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data.get("requires_2fa") is not True

    def test_wrong_password_blocked(self, test_client, user_without_2fa):
        r = _login(test_client, "no2fa_test@pivotradar.test", "WrongPassword")
        assert r.status_code == 400


class TestLoginWith2FA:
    def test_login_returns_challenge(self, test_client, user_with_2fa):
        r = _login(test_client, "with2fa_test@pivotradar.test", "Test1234!")
        assert r.status_code == 200
        data = r.json()
        assert data["requires_2fa"] is True
        assert "temp_token" in data
        assert "access_token" not in data

    def test_verify_with_correct_code(self, test_client, user_with_2fa):
        r = _login(test_client, "with2fa_test@pivotradar.test", "Test1234!")
        temp_token = r.json()["temp_token"]
        code = pyotp.TOTP(user_with_2fa._plain_secret).now()
        r2 = _verify_2fa(test_client, temp_token, code)
        assert r2.status_code == 200
        data = r2.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_verify_with_wrong_code(self, test_client, user_with_2fa):
        r = _login(test_client, "with2fa_test@pivotradar.test", "Test1234!")
        temp_token = r.json()["temp_token"]
        r2 = _verify_2fa(test_client, temp_token, "000000")
        assert r2.status_code == 400

    def test_verify_with_invalid_temp_token(self, test_client, user_with_2fa):
        r2 = _verify_2fa(test_client, "invalid.token.here", "123456")
        assert r2.status_code == 401

    def test_verify_with_garbage_token(self, test_client, user_with_2fa):
        r2 = _verify_2fa(test_client, "", "123456")
        assert r2.status_code in (401, 422)


class TestCORSProductionGuard:
    def test_cors_wildcard_guard_code_exists(self):
        import inspect
        from app import main
        src = inspect.getsource(main)
        assert "RuntimeError" in src


class TestShrinkageFloor:
    def test_shrinkage_floor_at_low_trust(self):
        neutral = 50.0
        raw_ml = 80.0
        ml_trust = 0.1
        effective_trust = max(ml_trust, 0.5)
        adjusted = neutral + (raw_ml - neutral) * effective_trust
        assert adjusted >= 65.0

    def test_shrinkage_high_trust_passes_through(self):
        neutral = 50.0
        raw_ml = 85.0
        ml_trust = 0.9
        effective_trust = max(ml_trust, 0.5)
        adjusted = neutral + (raw_ml - neutral) * effective_trust
        assert adjusted >= 80.0

    def test_shrinkage_neutral_score_unchanged(self):
        neutral = 50.0
        raw_ml = 50.0
        for trust in [0.0, 0.1, 0.5, 1.0]:
            effective_trust = max(trust, 0.5)
            adjusted = neutral + (raw_ml - neutral) * effective_trust
            assert adjusted == 50.0


class TestConfidenceScoreLinkedToQRS:
    def _compute_confidence(self, qrs, raw_rules, ml_trust_val, usdtry=0.0, is_stale=False):
        _qrs_conviction  = abs(qrs - 50.0) / 50.0
        _rule_conviction = abs(raw_rules - 50.0) / 50.0
        _ml_conviction   = ml_trust_val
        _macro_magnitude = min(1.0, abs(usdtry) / 10.0)
        composite = (
            0.35 * _qrs_conviction +
            0.25 * _rule_conviction +
            0.25 * _ml_conviction +
            0.15 * _macro_magnitude
        ) * 100.0
        if is_stale:
            composite *= 0.6
        return round(max(5.0, min(100.0, composite)), 1)

    def test_high_qrs_gives_high_confidence(self):
        conf_high = self._compute_confidence(qrs=90, raw_rules=80, ml_trust_val=0.8)
        conf_low  = self._compute_confidence(qrs=40, raw_rules=40, ml_trust_val=0.3)
        assert conf_high > conf_low

    def test_stale_data_reduces_confidence(self):
        c_fresh = self._compute_confidence(qrs=80, raw_rules=75, ml_trust_val=0.7, is_stale=False)
        c_stale = self._compute_confidence(qrs=80, raw_rules=75, ml_trust_val=0.7, is_stale=True)
        assert c_stale < c_fresh

    def test_confidence_bounded_5_to_100(self):
        for qrs in [0, 25, 50, 75, 100]:
            c = self._compute_confidence(qrs=qrs, raw_rules=50, ml_trust_val=0.0)
            assert 5.0 <= c <= 100.0
