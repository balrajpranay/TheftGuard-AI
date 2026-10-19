"""Database configuration for TheftGuard AI.

Reads configuration safely from environment variables and .env.
Normalizes PostgreSQL connection strings for SQLAlchemy 2.x + psycopg v3.
Ensures zero connection attempts or secret leaks during module import.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

try:
    from dotenv import load_dotenv

    # Search for .env in ml-service first, then current working directory
    _ml_service_root = Path(__file__).resolve().parents[2]
    _env_candidates = [
        _ml_service_root / ".env",
        Path.cwd() / ".env",
    ]
    for _candidate in _env_candidates:
        if _candidate.is_file():
            load_dotenv(dotenv_path=_candidate)
            break
    else:
        load_dotenv()
except ImportError:
    pass

ENV_DATABASE_URL = "THEFTGUARD_DATABASE_URL"


class DatabaseConfigError(Exception):
    """Raised when database configuration is missing, invalid, or malformed."""


def get_raw_database_url() -> Optional[str]:
    """Retrieve raw database URL from environment without raising an exception."""
    val = os.getenv(ENV_DATABASE_URL)
    return val.strip() if val else None


def normalize_database_url(raw_url: str) -> str:
    """Normalize a database URL for SQLAlchemy 2.x and psycopg v3.

    - Ensures driver dialect is 'postgresql+psycopg' (psycopg v3).
    - Preserves user, password, host, port, database, and query parameters.
    - Ensures sslmode=require for Supabase / remote connections if not specified.
    """
    if not raw_url or not raw_url.strip():
        raise DatabaseConfigError("Database URL is empty.")

    url = raw_url.strip()

    # Standardize scheme to postgresql+psycopg
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]

    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise DatabaseConfigError(f"Failed to parse database URL: {type(exc).__name__}") from exc

    if not parsed.scheme.startswith("postgresql"):
        raise DatabaseConfigError(f"Unsupported database scheme '{parsed.scheme}'. Expected PostgreSQL.")

    # Automatically ensure sslmode=require for Supabase endpoints
    hostname = (parsed.hostname or "").lower()
    if "supabase.com" in hostname or "supabase.co" in hostname:
        query_params = dict(parse_qsl(parsed.query))
        if "sslmode" not in query_params:
            query_params["sslmode"] = "require"
            new_query = urlencode(query_params)
            url = urlunparse(parsed._replace(query=new_query))

    return url


def mask_database_url(url: Optional[str]) -> str:
    """Return a masked representation of a database URL for safe logging/display.

    Hides passwords completely. Never returns plain credentials.
    """
    if not url:
        return "[NOT SET]"

    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return "[INVALID URL]"

        if parsed.password:
            user = parsed.username or ""
            host = parsed.hostname or ""
            port = f":{parsed.port}" if parsed.port else ""
            masked_netloc = f"{user}:***@{host}{port}"
            return urlunparse(parsed._replace(netloc=masked_netloc))
        return url
    except Exception:
        # Safe fallback regex masking for passwords
        return re.sub(r":([^/@:]+)@", r":***@", url)
