# backend/tests/conftest.py
"""
Shared pytest fixtures for the full test suite.

Test izolasyon stratejisi:
  - Ephemeral DB: Her test run için benzersiz bir DB oluşturulur (Hermetik).
  - Session-scoped engine: Tüm testler bu geçici DB'yi paylaşır.
  - Function-scoped db_session: Her test kendi transaction'ını açar, rollback ile geri alır.
"""
import os
import sys
import uuid
import pytest
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

# ── Ephemeral DB Lifecycle ──────────────────────────────────────────────────

def _get_base_db_url():
    """Bağlantı kurulacak ana (root) DB URL'si."""
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        # URL'den DB adını ayırıp 'postgres'e bağlan
        from urllib.parse import urlparse, urlunparse
        u = urlparse(env_url)
        return urlunparse(u._replace(path="/postgres"))
    
    # Docker içi varsayım
    import socket
    try:
        socket.gethostbyname("db")
        return "postgresql://pivot_user:pivot_pass@db/postgres"
    except socket.gaierror:
        return "postgresql://pivot_user:pivot_pass@localhost:5432/postgres"

def _create_ephemeral_db(base_url: str, db_name: str):
    """Yeni bir veritabanı oluşturur."""
    engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {db_name}"))
        conn.execute(text(f"CREATE DATABASE {db_name}"))
    engine.dispose()

def _drop_ephemeral_db(base_url: str, db_name: str):
    """Veritabanını siler."""
    engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        # Bağlantıları sonlandır (özellikle test_client açık kaldıysa)
        conn.execute(text(f"""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '{db_name}'
              AND pid <> pg_backend_pid()
        """))
        conn.execute(text(f"DROP DATABASE IF EXISTS {db_name}"))
    engine.dispose()

# ── Setup Environment ────────────────────────────────────────────────────────

# Global test DB adı (session bazlı)
_TEST_ID = str(uuid.uuid4())[:8]
_DB_NAME = f"pivot_test_{_TEST_ID}"
_BASE_URL = _get_base_db_url()

# Uygulama ayağa kalkmadan önce URL'yi set et
from urllib.parse import urlparse, urlunparse
_u = urlparse(_BASE_URL)
os.environ["DATABASE_URL"] = urlunparse(_u._replace(path=f"/{_DB_NAME}"))
os.environ["SECRET_KEY"]   = "test-secret-key-not-for-production"
os.environ["ENVIRONMENT"]  = "test"

# Backend app importable olsun (PYTHONPATH üzerinden yönetilmeli)

# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def ephemeral_db():
    """Session başında DB oluşturur, sonunda siler."""
    _create_ephemeral_db(_BASE_URL, _DB_NAME)
    yield
    _drop_ephemeral_db(_BASE_URL, _DB_NAME)

@pytest.fixture(scope="session")
def db_engine(ephemeral_db):
    try:
        from app.core.database import Base, engine
        import app.features.users.models       # noqa: F401
        import app.features.admin.models       # noqa: F401
        import app.features.scanner.models     # noqa: F401
        import app.features.support.models     # noqa: F401
        Base.metadata.create_all(bind=engine)
        yield engine
    except Exception:
        import traceback
        traceback.print_exc()
        raise

@pytest.fixture(scope="session")
def test_client(db_engine):
    try:
        from app.main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    except Exception:
        import traceback
        traceback.print_exc()
        raise

@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture(scope="function")
def fake_clock():
    """Tests can use this to manipulate time."""
    from datetime import datetime
    class Clock:
        def __init__(self):
            self.now_val = datetime.utcnow()
        def set(self, dt):
            self.now_val = dt
        def now(self):
            return self.now_val
    return Clock()

@pytest.fixture(scope="session", autouse=True)
def seed_test_admin(db_engine):
    from app.features.users.models import User
    from app.features.users.auth import get_password_hash

    Session = sessionmaker(bind=db_engine)
    session = Session()
    try:
        session.add(User(
            email="testadmin@pivotradar.test",
            hashed_password=get_password_hash("TestAdmin123!"),
            full_name="Test Admin",
            is_superuser=True,
            is_active=True,
            settings={"has_accepted_legal": True},
        ))
        session.add(User(
            email="testuser@pivotradar.test",
            hashed_password=get_password_hash("TestUser123!"),
            full_name="Test User",
            is_superuser=False,
            is_active=True,
            settings={"has_accepted_legal": True},
        ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()
    yield
