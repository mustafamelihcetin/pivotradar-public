# backend/app/features/users/router.py
from fastapi import APIRouter, Depends, HTTPException, status, Request, Security
from fastapi.security import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Any, List, Optional
import json

from ...core.database import get_db
from . import models, auth
from ...core import settings
from ...core.rate_limit import login_rate_limit, register_rate_limit
from pydantic import BaseModel, EmailStr, field_validator
from ...core.time_utils import now_utc

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Kullanıcı başına son heartbeat zamanı (process-local, 15 dk'da bir ACTIVE kaydı atar)
import time as _time
_heartbeat_cache: dict[int, float] = {}
_HEARTBEAT_INTERVAL = 900   # saniye
_HEARTBEAT_MAX_SIZE = 2000  # en fazla bu kadar kullanıcı kaydı tutulur

def _maybe_log_active(user_id: int, db: "Session") -> None:
    now_ts = _time.monotonic()
    if now_ts - _heartbeat_cache.get(user_id, 0) > _HEARTBEAT_INTERVAL:
        # Boyut sınırı aşıldıysa en eski yarısını temizle
        if len(_heartbeat_cache) >= _HEARTBEAT_MAX_SIZE:
            cutoff = now_ts - _HEARTBEAT_INTERVAL * 2
            for _uid in [k for k, v in _heartbeat_cache.items() if v < cutoff]:
                _heartbeat_cache.pop(_uid, None)
        _heartbeat_cache[user_id] = now_ts
        try:
            db.add(models.UserActivity(user_id=user_id, action="ACTIVE"))
            db.commit()
        except Exception:
            db.rollback()

# --- Modeller ---
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Şifre en az 8 karakter olmalıdır.")
        if not any(c.isupper() for c in v):
            raise ValueError("Şifre en az bir büyük harf içermelidir.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Şifre en az bir rakam içermelidir.")
        return v

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    profile_picture: Optional[str] = None
    settings: Optional[dict] = None

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    change_password_required: Optional[bool] = False
    has_accepted_legal: Optional[bool] = False
    suspicious_login: Optional[bool] = False

class TwoFactorChallenge(BaseModel):
    """K-1: 2FA etkin kullanıcı için login geçici token yanıtı."""
    requires_2fa: bool = True
    temp_token: str
    token_type: str = "bearer"

class GoogleLoginRequest(BaseModel):
    token: str

class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None

class UserProfile(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    profile_picture: Optional[str] = None
    is_active: bool
    is_superuser: bool = False
    is_premium: bool = False
    email_verified: Optional[Any] = None
    google_id: Optional[bool] = None
    strategy_profile_name: Optional[str] = None
    strategy_profile_id: Optional[int] = None
    settings: Optional[dict] = None

    class Config:
        from_attributes = True

class SettingsSaveResponse(BaseModel):
    ok: bool = True
    profile_name: Optional[str] = None
    strategy_profile_name: Optional[str] = None
    strategy_profile_id: Optional[int] = None

class PortfolioResponse(BaseModel):
    holdings: list

# --- Dependencies ---
def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz kimlik bilgileri",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # API Key auth
    if api_key and api_key.startswith("pr_"):
        import hashlib
        _now = now_utc
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        key_obj = db.query(models.ApiKey).filter(
            models.ApiKey.key_hash == key_hash,
            models.ApiKey.is_active == True,
        ).first()
        if key_obj:
            if key_obj.expires_at and key_obj.expires_at < _now().replace(tzinfo=None):
                raise HTTPException(401, "API key süresi dolmuş.")
            # Update last_used without blocking
            try:
                key_obj.last_used = _now().replace(tzinfo=None)
                db.commit()
            except Exception:
                db.rollback()
            user = db.query(models.User).filter(models.User.id == key_obj.user_id).first()
            if user:
                _maybe_log_active(user.id, db)
                return user
        raise credentials_exception

    # JWT Bearer auth
    if not token:
        raise credentials_exception
    payload = auth.decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise credentials_exception

    # JTI blacklist kontrolü — logout edilen token'lar reddedilir
    jti = payload.get("jti")
    if jti:
        from ...core.auth_cache import is_blacklisted
        if is_blacklisted(jti):
            raise credentials_exception

    email = payload.get("sub")
    if email is None:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise credentials_exception

    # force_password_change: API erişimini engelle, yalnızca şifre değiştirme ve çıkış izinli
    if getattr(user, "force_password_change", False):
        path = request.url.path
        _allowed_suffixes = {"/auth/change-password", "/auth/logout", "/auth/me"}
        if not any(path == f"/api{s}" for s in _allowed_suffixes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Şifrenizi değiştirmeniz gerekiyor. Lütfen hesap ayarlarınızdan yeni şifre belirleyin.",
                headers={"X-Password-Change-Required": "true"},
            )

    _maybe_log_active(user.id, db)
    return user

def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
) -> Optional[models.User]:
    if not token and not api_key:
        return None
    try:
        return get_current_user(request=request, db=db, token=token, api_key=api_key)
    except HTTPException:
        return None

def log_user_activity(db: Session, user_id: int, action: str, details: Optional[dict] = None):
    """Kullanıcı hareketlerini veritabanına kaydeder."""
    try:
        activity = models.UserActivity(
            user_id=user_id,
            action=action,
            details=details
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        import logging as _l
        _l.getLogger(__name__).warning("Error logging activity: %s", e)

# --- Rotalar ---

@router.post("/auth/register", response_model=Token)
async def register(
    request: Request,
    db: Session = Depends(get_db),
    _rl: None = Depends(register_rate_limit),
):
    # 1. Feature flag önce — Pydantic validasyonundan önce kontrol edilmeli
    from ..admin.utils import get_system_setting, DEFAULT_SETTINGS
    flags = get_system_setting(db, "feature_flags", DEFAULT_SETTINGS["feature_flags"])
    if not flags.get("registration_enabled", True):
        raise HTTPException(status_code=403, detail="Yeni kullanıcı kaydı geçici olarak durdurulmuştur.")

    # 2. CAPTCHA
    from ...shared.utils.captcha import verify_turnstile_token
    captcha_token = request.headers.get("X-Captcha-Token")
    if not await verify_turnstile_token(captcha_token, request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doğrulama başarısız. Lütfen robot olmadığınızı doğrulayın."
        )

    # 3. Manuel Pydantic validasyonu
    try:
        body = await request.json()
        user_in = UserCreate(**body)
    except Exception as exc:
        from pydantic import ValidationError
        if isinstance(exc, ValidationError):
            raise HTTPException(status_code=422, detail=exc.errors())
        raise HTTPException(status_code=422, detail="Geçersiz istek verisi.")

    user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı.")
    
    new_user = models.User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=auth.get_password_hash(user_in.password),
        settings={"has_accepted_legal": True}
    )
    db.add(new_user)
    try:
        db.commit()
    except Exception as _ie:
        db.rollback()
        from sqlalchemy.exc import IntegrityError
        if isinstance(_ie, IntegrityError):
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı.")
        raise
    db.refresh(new_user)
    
    log_user_activity(db, new_user.id, "REGISTER")

    from ...core.audit import log_action
    client_ip = request.client.host if request.client else None
    log_action(db, "REGISTER", user_id=new_user.id, ip_address=client_ip, detail={})

    access_token = auth.create_access_token(subject=new_user.email)
    refresh_token = auth.create_refresh_token(subject=new_user.email)
    return {
        "access_token": access_token, 
        "refresh_token": refresh_token, 
        "token_type": "bearer",
        "has_accepted_legal": True
    }

@router.post("/auth/login")
async def login(
    request: Request,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
    _rl: None = Depends(login_rate_limit),
):
    from ...shared.utils.captcha import verify_turnstile_token
    captcha_token = request.headers.get("X-Captcha-Token")
    if not await verify_turnstile_token(captcha_token, request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Doğrulama başarısız. Lütfen robot olmadığınızı doğrulayın."
        )

    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Hatalı e-posta veya şifre.")

    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "")

    # Şüpheli giriş tespiti: önceki IP'den farklı mı?
    last_ip = getattr(user, "last_login_ip", None)
    suspicious_login = bool(last_ip and last_ip != client_ip)

    # Son giriş IP'sini güncelle
    try:
        from sqlalchemy import text as _text
        db.execute(_text("UPDATE users SET last_login_ip = :ip WHERE id = :uid"),
                   {"ip": client_ip, "uid": user.id})
        db.commit()
    except Exception:
        db.rollback()

    # Audit log
    from ...core.audit import log_action
    log_action(db, "LOGIN", user_id=user.id, ip_address=client_ip, user_agent=user_agent,
               detail={"suspicious": suspicious_login})

    # K-1: 2FA etkinse tam token vermeden önce TOTP doğrulaması gerekli.
    if getattr(user, "totp_enabled", False) and getattr(user, "totp_confirmed", False):
        temp_token = auth.create_2fa_temp_token(user.email)
        log_user_activity(db, user.id, "LOGIN_2FA_CHALLENGE", {"ip": client_ip})
        return TwoFactorChallenge(requires_2fa=True, temp_token=temp_token)

    access_token = auth.create_access_token(subject=user.email)
    refresh_token = auth.create_refresh_token(subject=user.email)

    log_user_activity(db, user.id, "LOGIN", {"ip": client_ip})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "change_password_required": getattr(user, "force_password_change", False),
        "has_accepted_legal": user.settings.get("has_accepted_legal", False) if user.settings else False,
        "suspicious_login": suspicious_login,
    }


class TwoFactorVerifyRequest(BaseModel):
    temp_token: str
    code: str

@router.post("/auth/2fa/verify-login", response_model=Token)
async def verify_2fa_login(
    body: TwoFactorVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """K-1: 2FA login doğrulama. temp_token + TOTP kodu → tam access/refresh token."""
    import pyotp
    email = auth.decode_2fa_temp_token(body.temp_token)
    if not email:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş 2FA oturumu.")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not getattr(user, "totp_enabled", False) or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA doğrulama bilgisi bulunamadı.")

    totp = pyotp.TOTP(auth.totp_decrypt(user.totp_secret))
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Geçersiz TOTP kodu.")

    access_token = auth.create_access_token(subject=user.email)
    refresh_token = auth.create_refresh_token(subject=user.email)

    client_ip = request.client.host if request.client else "unknown"
    log_user_activity(db, user.id, "LOGIN_2FA_VERIFIED", {"ip": client_ip})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "change_password_required": getattr(user, "force_password_change", False),
        "has_accepted_legal": user.settings.get("has_accepted_legal", False) if user.settings else False,
        "suspicious_login": False,
    }


@router.post("/auth/google", response_model=Token)
async def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """
    Accepts either a Google OAuth2 access_token (from useGoogleLogin hook)
    or an ID token (from GoogleLogin component). Both are verified via Google APIs.
    """
    import urllib.request as _urllib_req
    import json as _json

    email = name = picture = google_id = None

    # 1. Try as access_token → call userinfo endpoint
    try:
        req = _urllib_req.Request("https://www.googleapis.com/oauth2/v3/userinfo")
        req.add_header("Authorization", f"Bearer {payload.token}")
        with _urllib_req.urlopen(req, timeout=5) as resp:
            info = _json.loads(resp.read())
        email = info.get("email")
        name = info.get("name")
        picture = info.get("picture")
        google_id = info.get("sub")
    except Exception:
        pass

    # 2. Fallback: try as ID token
    if not email:
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests
            idinfo = id_token.verify_oauth2_token(
                payload.token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
            )
            email = idinfo.get("email")
            name = idinfo.get("name")
            picture = idinfo.get("picture")
            google_id = idinfo.get("sub")
        except Exception as e:
            import logging
            logging.getLogger("app.auth").error(f"Google Login Failure: Both userinfo and ID Token verification failed. ID Token Error: {e}")

    if not email:
        raise HTTPException(status_code=400, detail="Google girişi başarısız. Token doğrulanamadı. Sunucu loglarını kontrol edin.")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(
            email=email,
            full_name=name,
            google_id=google_id,
            profile_picture=picture,
            hashed_password=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.google_id:
            user.google_id = google_id
            user.profile_picture = picture
            db.commit()

    access_token = auth.create_access_token(subject=user.email)
    refresh_token = auth.create_refresh_token(subject=user.email)
    
    log_user_activity(db, user.id, "LOGIN_GOOGLE")
    
    has_accepted_legal = user.settings.get("has_accepted_legal", False) if user.settings else False

    return {
        "access_token": access_token, 
        "refresh_token": refresh_token, 
        "token_type": "bearer",
        "has_accepted_legal": has_accepted_legal
    }
class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/auth/logout", response_model=OkResponse)
def logout(
    body: LogoutRequest = LogoutRequest(),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
):
    """Logout — refresh token'ı blacklist'e, access token JTI'ını in-memory cache'e ekler."""
    if body.refresh_token:
        auth.revoke_refresh_token(db, body.refresh_token)

    # Access token JTI'ını in-memory blacklist'e ekle (60 dakika TTL)
    if token:
        payload = auth.decode_token(token)
        if payload:
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                from ...core.auth_cache import add_to_blacklist
                add_to_blacklist(jti, float(exp))

    from ...core.audit import log_action
    log_action(db, "LOGOUT", user_id=current_user.id, ip_address=None, detail={})

    return {"ok": True, "message": "Oturum sonlandırıldı."}


@router.post("/auth/refresh", response_model=Token)
def refresh_token_endpoint(body: RefreshRequest, db: Session = Depends(get_db)):
    """
    Refresh token rotation:
      1. Eski token doğrulanır + blacklist kontrolü yapılır.
      2. Eski token anında iptal edilir (tek kullanım).
      3. Yeni access + refresh token çifti döner.
    """
    old_token = body.refresh_token
    payload = auth.decode_token(old_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Geçersiz refresh token")

    if auth.is_refresh_token_revoked(db, old_token):
        raise HTTPException(status_code=401, detail="Refresh token iptal edilmiş (token reuse detected)")

    email = payload.get("sub")
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı veya devre dışı")

    # Eski token'ı iptal et — rotation
    auth.revoke_refresh_token(db, old_token)

    new_access_token  = auth.create_access_token(subject=user.email)
    new_refresh_token = auth.create_refresh_token(subject=user.email)
    return {
        "access_token":  new_access_token,
        "refresh_token": new_refresh_token,
        "token_type":    "bearer",
        "change_password_required": getattr(user, "force_password_change", False),
        "has_accepted_legal": user.settings.get("has_accepted_legal", False) if user.settings else False,
    }

@router.get("/users/me", response_model=UserProfile)
def read_user_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "profile_picture": getattr(current_user, "profile_picture", None),
        "is_superuser": current_user.is_superuser,
        "is_premium": current_user.is_superuser or any(
            s.status == "active" and s.plan_name in ("Premium", "Pro")
            for s in (current_user.subscriptions or [])
        ),
        "is_active": current_user.is_active,
        "settings": current_user.settings,
        "email_verified": getattr(current_user, "email_verified", False),
        "google_id": bool(getattr(current_user, "google_id", None)),
        "strategy_profile_id": current_user.strategy_profile_id,
        "strategy_profile_name": current_user.strategy_profile.name if current_user.strategy_profile else "Dengeli",
    }

@router.patch("/users/me", response_model=UserProfile)
def update_profile(
    payload: UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.profile_picture is not None:
        current_user.profile_picture = payload.profile_picture
    db.add(current_user)
    db.commit()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "profile_picture": getattr(current_user, "profile_picture", None),
        "is_superuser": current_user.is_superuser,
        "is_active": current_user.is_active,
        "settings": current_user.settings,
        "email_verified": getattr(current_user, "email_verified", False),
        "google_id": bool(getattr(current_user, "google_id", None)),
        "strategy_profile_id": current_user.strategy_profile_id,
        "strategy_profile_name": current_user.strategy_profile.name if current_user.strategy_profile else "Dengeli",
    }

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/users/me/change-password", response_model=OkResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # If the user was reset by an admin, they might not have the 'current' temporary password handy 
    # and we want to allow them to set a new one directly since they've already authenticated.
    is_forced = getattr(current_user, "force_password_change", False)

    if current_user.hashed_password and not is_forced:
        if not payload.current_password:
            raise HTTPException(status_code=400, detail="Mevcut şifrenizi girmelisiniz.")
        if not auth.verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Mevcut şifreniz hatalı.")
            
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 8 karakter olmalıdır.")
        
    current_user.hashed_password = auth.get_password_hash(payload.new_password)
    current_user.force_password_change = False  # Clear the reset flag
    db.add(current_user)
    db.commit()
    return {"ok": True, "detail": "Şifreniz başarıyla güncellendi."}

# ── Email verification ──────────────────────────────────────────────────────

def _gen_token(length: int = 48) -> str:
    import secrets
    return secrets.token_urlsafe(length)

@router.post("/auth/resend-verification", response_model=OkResponse)
def resend_verification(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from ...core import email as email_util
    _settings = settings

    if getattr(current_user, "email_verified", False):
        return {"ok": True, "detail": "E-posta zaten doğrulanmış."}

    import datetime
    token = _gen_token()
    current_user.verification_token = token
    current_user.verification_token_expires = now_utc().replace(tzinfo=None) + datetime.timedelta(hours=24)
    db.add(current_user)
    db.commit()

    verify_url = f"{email_util.APP_URL}/verify-email?token={token}"
    html = email_util.verification_email_html(current_user.full_name or "", verify_url)
    sent = email_util.send_email(current_user.email, "PivotRadar — E-Posta Doğrulaması", html)
    return {"ok": True, "sent": sent, "detail": "Doğrulama e-postası gönderildi." if sent else "E-posta gönderilemedi. SMTP yapılandırmasını kontrol edin."}

@router.get("/auth/verify-email", response_model=OkResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş doğrulama bağlantısı.")
    if user.verification_token_expires and now_utc().replace(tzinfo=None) > user.verification_token_expires:
        user.verification_token = None
        user.verification_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Doğrulama bağlantısının süresi dolmuş. Lütfen yeni bir bağlantı talep edin.")
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.add(user)
    db.commit()
    return {"ok": True, "detail": "E-posta başarıyla doğrulandı."}

# ── Password reset ──────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/auth/forgot-password", response_model=OkResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    import datetime
    from ...core import email as email_util

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        return {"ok": True, "detail": "Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderildi."}

    token = _gen_token()
    user.reset_token = token
    user.reset_token_expires = now_utc().replace(tzinfo=None) + datetime.timedelta(hours=1)
    db.add(user)
    db.commit()

    reset_url = f"{email_util.APP_URL}/reset-password?token={token}"
    html = email_util.reset_password_email_html(user.full_name or "", reset_url)
    email_util.send_email(user.email, "PivotRadar — Şifre Sıfırlama", html)
    return {"ok": True, "detail": "Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderildi."}

@router.post("/auth/reset-password", response_model=OkResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    import datetime
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalıdır.")

    user = db.query(models.User).filter(models.User.reset_token == payload.token).first()
    if not user or not user.reset_token_expires:
        raise HTTPException(status_code=400, detail="Geçersiz sıfırlama bağlantısı.")
    if now_utc().replace(tzinfo=None) > user.reset_token_expires:
        raise HTTPException(status_code=400, detail="Sıfırlama bağlantısının süresi dolmuş.")

    user.hashed_password = auth.get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.add(user)
    db.commit()
    return {"ok": True, "detail": "Şifreniz başarıyla sıfırlandı. Giriş yapabilirsiniz."}

@router.patch("/users/me/settings", response_model=SettingsSaveResponse)
def update_settings(
    settings_update: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if "profile_name" in settings_update:
        # Move profile_name to strategy_profile_id
        from .models import StrategyProfile
        pn = str(settings_update["profile_name"])
        profile = db.query(StrategyProfile).filter(StrategyProfile.name == pn).first()
        if profile:
            current_user.strategy_profile_id = profile.id
    
    if "strategy_profile_id" in settings_update:
        current_user.strategy_profile_id = settings_update["strategy_profile_id"]

    # Remove profile-related fields from JSON settings to avoid duplication
    settings_to_save = {k:v for k,v in settings_update.items() if k not in ("profile_name", "strategy_profile_id")}
    
    # Merge and create a new dict reference to ensure SQLAlchemy detects the change
    new_settings = {**(current_user.settings or {}), **settings_to_save}
    current_user.settings = new_settings
    db.add(current_user)
    db.commit()
    return {
        "ok": True, 
        "settings": current_user.settings, 
        "strategy_profile_id": current_user.strategy_profile_id,
        "strategy_profile_name": current_user.strategy_profile.name if current_user.strategy_profile else None
    }


# ── Portfolio endpoints ───────────────────────────────────────────────

class PortfolioSaveRequest(BaseModel):
    holdings: list  # Full holding objects [{ id, symbol, qty, avgCost, ... }]

@router.get("/users/me/portfolio", response_model=PortfolioResponse)
def get_portfolio(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio = db.query(models.UserPortfolio).filter(
        models.UserPortfolio.user_id == current_user.id,
        models.UserPortfolio.is_active == True
    ).first()
    if not portfolio:
        return {"holdings": []}
    return {"holdings": portfolio.stocks or []}


@router.post("/users/me/portfolio", response_model=OkResponse)
def save_portfolio(
    body: PortfolioSaveRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio = db.query(models.UserPortfolio).filter(
        models.UserPortfolio.user_id == current_user.id,
        models.UserPortfolio.is_active == True
    ).first()
    if not portfolio:
        portfolio = models.UserPortfolio(user_id=current_user.id)
        db.add(portfolio)
    portfolio.stocks = body.holdings
    db.commit()
    return {"ok": True, "count": len(body.holdings)}


@router.delete("/users/me", response_model=OkResponse)
def delete_account(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Kullanıcı hesabını ve ilişkili tüm verilerini kalıcı olarak siler.
    """
    # Cascade delete el ile yapılıyor (Modellerde cascade tanımlı değilse güvenli yol)
    db.query(models.UserPortfolio).filter(models.UserPortfolio.user_id == current_user.id).delete()
    db.query(models.Subscription).filter(models.Subscription.user_id == current_user.id).delete()
    db.query(models.UserActivity).filter(models.UserActivity.user_id == current_user.id).delete()
    
    db.delete(current_user)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# 2FA (TOTP) Endpoints
# ══════════════════════════════════════════════════════════════════════════════

class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_data: str  # base64 PNG for QR code

class TotpVerifyRequest(BaseModel):
    code: str

@router.post("/auth/2fa/setup", response_model=TotpSetupResponse)
def totp_setup(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new TOTP secret and return the QR setup data."""
    import pyotp, qrcode, io, base64
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=current_user.email, issuer_name="PivotRadar")

    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    current_user.totp_secret = auth.totp_encrypt(secret)  # K-4: şifreli kayıt
    current_user.totp_enabled = False
    current_user.totp_confirmed = False
    db.commit()

    return {"secret": secret, "otpauth_url": otpauth_url, "qr_data": qr_b64}


@router.post("/auth/2fa/confirm", response_model=OkResponse)
def totp_confirm(
    body: TotpVerifyRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm 2FA setup by verifying first TOTP code."""
    import pyotp
    if not current_user.totp_secret:
        raise HTTPException(400, "2FA kurulumu başlatılmamış.")
    totp = pyotp.TOTP(auth.totp_decrypt(current_user.totp_secret))  # K-4: şifreyi çöz
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(400, "Geçersiz TOTP kodu.")
    current_user.totp_enabled = True
    current_user.totp_confirmed = True
    db.commit()
    return {"ok": True, "message": "2FA aktif edildi."}


@router.post("/auth/2fa/disable", response_model=OkResponse)
def totp_disable(
    body: TotpVerifyRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable 2FA (requires valid TOTP code as confirmation)."""
    import pyotp
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(400, "2FA zaten devre dışı.")
    totp = pyotp.TOTP(auth.totp_decrypt(current_user.totp_secret))  # K-4: şifreyi çöz
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(400, "Geçersiz TOTP kodu.")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    current_user.totp_confirmed = False
    db.commit()
    return {"ok": True, "message": "2FA devre dışı bırakıldı."}


@router.get("/auth/2fa/status")
def totp_status(current_user: models.User = Depends(get_current_user)):
    return {"enabled": bool(current_user.totp_enabled), "confirmed": bool(current_user.totp_confirmed)}


# ══════════════════════════════════════════════════════════════════════════════
# API Key Endpoints
# ══════════════════════════════════════════════════════════════════════════════

class ApiKeyCreate(BaseModel):
    name: str
    expires_days: Optional[int] = None  # None = no expiry

class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    last_used: Optional[Any] = None
    expires_at: Optional[Any] = None
    created_at: Any

    class Config:
        from_attributes = True

class ApiKeyCreatedResponse(ApiKeyResponse):
    raw_key: str  # Only returned once at creation


@router.post("/auth/api-keys", response_model=ApiKeyCreatedResponse)
def create_api_key(
    body: ApiKeyCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new API key. Raw key is shown only once."""
    import secrets, hashlib
    raw_key = "pr_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    expires_at = None
    if body.expires_days:
        expires_at = (now_utc() + __import__('datetime').timedelta(days=body.expires_days)).replace(tzinfo=None)

    key = models.ApiKey(
        user_id=current_user.id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=raw_key[:10],
        expires_at=expires_at,
    )
    db.add(key)
    db.commit()
    db.refresh(key)

    return {**ApiKeyResponse.model_validate(key).model_dump(), "raw_key": raw_key}


@router.get("/auth/api-keys", response_model=List[ApiKeyResponse])
def list_api_keys(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    keys = db.query(models.ApiKey).filter(
        models.ApiKey.user_id == current_user.id
    ).order_by(models.ApiKey.created_at.desc()).all()
    return keys


@router.delete("/auth/api-keys/{key_id}", response_model=OkResponse)
def revoke_api_key(
    key_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.query(models.ApiKey).filter(
        models.ApiKey.id == key_id,
        models.ApiKey.user_id == current_user.id
    ).first()
    if not key:
        raise HTTPException(404, "API key bulunamadı.")
    key.is_active = False
    db.commit()
    return {"ok": True, "message": "API key iptal edildi."}
