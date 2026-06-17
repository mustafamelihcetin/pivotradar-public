# backend/app/features/users/auth.py
from datetime import UTC, datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt
from passlib.context import CryptContext
from app.core import settings
from app.core.time_utils import now_utc

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# K-4: TOTP secret şifreleme/çözme yardımcıları (Fernet AES-128-CBC).
# Yeni TOTP kurulumlarında secret DB'ye şifreli kaydedilir.
# Eski plaintext secretlar backward-compat için okunmaya devam eder.
def _totp_cipher():
    from cryptography.fernet import Fernet
    return Fernet(settings.TOTP_ENCRYPTION_KEY.encode() if isinstance(settings.TOTP_ENCRYPTION_KEY, str) else settings.TOTP_ENCRYPTION_KEY)

def totp_encrypt(secret: str) -> str:
    """TOTP secret'ını Fernet ile şifrele; DB'ye bu değer yazılır."""
    return _totp_cipher().encrypt(secret.encode()).decode()

def totp_decrypt(stored: str) -> str:
    """DB'den okunan değeri çöz. Plaintext (eski) ise as-is döndür."""
    try:
        return _totp_cipher().decrypt(stored.encode()).decode()
    except Exception:
        return stored  # backward-compat: plaintext secret

from sqlalchemy.orm import Session
from app.features.users.models import TokenBlacklist

def revoke_refresh_token(db: Session, token: str) -> None:
    """Refresh token'ı blacklist'e ekle (logout / rotation sonrası)."""
    payload = decode_token(token)
    if payload is None:
        return
    exp_ts = payload.get("exp", 0)
    jti = payload.get("jti") or token
    expires_at = datetime.fromtimestamp(exp_ts, tz=UTC).replace(tzinfo=None)
    # jti doğrudan sorgula — token'ı tekrar decode etme
    if db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first() is None:
        db.add(TokenBlacklist(jti=jti, expires_at=expires_at))
        db.commit()


def is_refresh_token_revoked(db: Session, token: str) -> bool:
    payload = decode_token(token)
    if not payload:
        return True
    jti = payload.get("jti") or token
    return db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first() is not None


# ── Password helpers ──────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── Token creation ────────────────────────────────────────────────────────────

import uuid

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    expire = now_utc() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "access",
        "jti": str(uuid.uuid4())
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    expire = now_utc() + (expires_delta or timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES))
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh",
        "jti": str(uuid.uuid4())
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.JWTError:
        return None


# K-1: 2FA login challenge için 5 dakikalık geçici token.
# Login'den sonra kullanıcı TOTP kodunu bu token ile doğrular.
def create_2fa_temp_token(email: str) -> str:
    expire = now_utc() + timedelta(minutes=5)
    to_encode = {
        "exp": expire,
        "sub": email,
        "type": "2fa_challenge",
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_2fa_temp_token(token: str) -> Optional[str]:
    """2FA temp token'ı doğrula, email döndür. Geçersiz/süresi dolmuşsa None."""
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "2fa_challenge":
        return None
    return payload.get("sub")
