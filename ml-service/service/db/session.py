"""Safe SQLAlchemy engine and session factory for TheftGuard AI.

Designed to be completely lazy and safe:
- Module import does NOT connect to the database.
- If THEFTGUARD_DATABASE_URL is absent, importing this module does NOT raise an error.
- Connections are only established when get_engine() is explicitly called or
  sessions are checked out.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import (
    DatabaseConfigError,
    get_raw_database_url,
    mask_database_url,
    normalize_database_url,
)

# Lazy module singletons
_engine: Optional[Engine] = None
_session_factory: Optional[sessionmaker[Session]] = None


def get_engine() -> Engine:
    """Return the cached SQLAlchemy engine or initialize it lazily.

    Raises DatabaseConfigError if THEFTGUARD_DATABASE_URL is not set.
    """
    global _engine
    if _engine is not None:
        return _engine

    raw_url = get_raw_database_url()
    if not raw_url:
        raise DatabaseConfigError(
            "THEFTGUARD_DATABASE_URL is not configured. "
            "Please set this environment variable or define it in your .env file."
        )

    normalized_url = normalize_database_url(raw_url)

    # Supabase session pooler configuration:
    # - pool_pre_ping: tests liveness with SELECT 1 before checkout, avoiding dropped sockets
    # - pool_recycle: recycles connections after 30 minutes to avoid pooler timeouts
    # - pool_size / max_overflow: sensible limits for FastAPI concurrent requests
    _engine = create_engine(
        normalized_url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30.0,
    )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Return the cached session factory or initialize it lazily."""
    global _session_factory
    if _session_factory is not None:
        return _session_factory

    engine = get_engine()
    _session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    return _session_factory


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Provide a transactional database session scope."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def is_database_configured() -> bool:
    """Check if database URL is configured without attempting to connect."""
    return get_raw_database_url() is not None


def reset_engine() -> None:
    """Dispose and reset the current engine (useful for testing or reconfiguration)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
    _session_factory = None
