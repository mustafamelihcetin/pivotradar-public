# backend/app/features/users/models.py
import datetime
from app.core.time_utils import now_utc
from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # Nullable for Google-only users
    google_id = Column(String, unique=True, index=True, nullable=True)
    profile_picture = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role = Column(String, default="VIEWER") # Roles: ADMIN, EDITOR, VIEWER
    
    # Relational Strategy Profile (1=Dengeli, 2=Agresif, etc.)
    strategy_profile_id = Column(Integer, ForeignKey("strategy_profiles.id"), nullable=True)
    strategy_profile    = relationship("StrategyProfile", back_populates="users")

    # Email verification
    email_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    verification_token_expires = Column(DateTime, nullable=True)

    # Password reset
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    
    force_password_change = Column(Boolean, default=False)

    # 2FA (TOTP)
    totp_secret    = Column(String, nullable=True)   # Base32 secret, stored encrypted
    totp_enabled   = Column(Boolean, default=False)
    totp_confirmed = Column(Boolean, default=False)  # True after first successful verify

    # Persistent User Settings (Stored as JSON)
    # Includes: selected_profile, expert_mode, theme, etc.
    settings = Column(JSON, default=lambda: {
        "profile_name": "Dengeli",
        "expert_mode": False,
        "theme": "dark",
        "notifications": True,
        "auto_scan_enabled": True,
        "auto_scan_interval": 15,
        "has_accepted_legal": False
    })

    created_at = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None), onupdate=lambda: now_utc().replace(tzinfo=None))

    # Relationships
    subscriptions = relationship("Subscription", back_populates="user")
    activities = relationship("UserActivity", back_populates="user")
    portfolios = relationship("UserPortfolio", back_populates="user")
    api_keys = relationship("ApiKey", back_populates="user")

class StrategyProfile(Base):
    __tablename__ = "strategy_profiles"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, unique=True, index=True, nullable=False)
    color       = Column(String, nullable=True) # Hex code
    description = Column(String, nullable=True)
    
    users = relationship("User", back_populates="strategy_profile")

    def __repr__(self):
        return f"<StrategyProfile id={self.id} name={self.name!r}>"

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_name = Column(String, default="Free") # Free, Premium, Pro
    status = Column(String, default="active") # active, expired, canceled
    start_date = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))
    end_date = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="subscriptions")

class UserActivity(Base):
    __tablename__ = "user_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False) # LOGIN, LOGOUT, SCAN_START, etc.
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))

    user = relationship("User", back_populates="activities")

class UserPortfolio(Base):
    __tablename__ = "user_portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, default="Varsayılan Portföy")
    stocks = Column(JSON, default=list) # List of ticker symbols: ["THYAO", "ASELS"]
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))
    
    user = relationship("User", back_populates="portfolios")


class ApiKey(Base):
    """User-issued API keys for programmatic access."""
    __tablename__ = "api_keys"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    name       = Column(String, nullable=False)                        # e.g. "My Script"
    key_hash   = Column(String, unique=True, index=True, nullable=False)  # sha256 of raw key
    key_prefix = Column(String, nullable=False)                        # first 8 chars for display
    is_active  = Column(Boolean, default=True)
    last_used  = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))

    user = relationship("User", back_populates="api_keys")


class TokenBlacklist(Base):
    """
    Stores revoked JTI (JWT IDs) or full tokens to handle logout in multi-instance environment.
    """
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))


class RateLimitRecord(Base):
    """
    Stores rate limit hits to persist across restarts and share across instances.
    """
    __tablename__ = "rate_limit_records"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, index=True, nullable=False) # e.g. "login:192.168.1.1"
    timestamp = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None), index=True)
    hits = Column(Integer, default=1)
