# backend/app/core/database.py
import time
import logging
import functools
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from . import settings

logger = logging.getLogger("PivotRadar.DB")

# Default to SQLite for local development, or use PostgreSQL if DATABASE_URL is set
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    f"sqlite:///{(settings.PROJECT_ROOT / 'data' / 'pivotradar.db').resolve()}"
)

# SQLite specifically needs 'check_same_thread': False
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    **({
        "pool_size": 20,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_timeout": 10,
    } if not SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {})
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def with_db_retry(max_attempts: int = 3, backoff: float = 0.5):
    """
    Decorator that retries a function on transient DB errors (OperationalError).
    Exponential backoff: 0.5s, 1.0s, 2.0s.
    """
    from sqlalchemy.exc import OperationalError

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    last_exc = e
                    if attempt < max_attempts:
                        wait = backoff * (2 ** (attempt - 1))
                        logger.warning(
                            "DB OperationalError (attempt %d/%d), retrying in %.1fs: %s",
                            attempt, max_attempts, wait, e
                        )
                        time.sleep(wait)
            raise last_exc
        return wrapper
    return decorator
