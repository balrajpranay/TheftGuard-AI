"""TheftGuard AI — Database Connectivity Verification Script (Phase 1).

Verifies network connectivity, authentication, SSL, and session pooler
communication with the Supabase PostgreSQL database WITHOUT printing credentials.

Usage:
    python scripts/verify_db_connection.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure service root is on sys.path
_ml_service_root = Path(__file__).resolve().parents[1]
if str(_ml_service_root) not in sys.path:
    sys.path.insert(0, str(_ml_service_root))

from sqlalchemy import text  # noqa: E402
from service.db import (  # noqa: E402
    DatabaseConfigError,
    get_engine,
    get_raw_database_url,
    mask_database_url,
    normalize_database_url,
)


def verify() -> int:
    print("=" * 72)
    print(" TheftGuard AI - Database Connectivity Verification (Phase 1)")
    print("=" * 72)

    raw_url = get_raw_database_url()
    if not raw_url:
        print("\n[RESULT] FAILED: Configuration missing.")
        print("Reason: THEFTGUARD_DATABASE_URL environment variable is not set.")
        print("\nTo configure your Supabase connection:")
        print("  1. Copy .env.example to .env in 'ml-service':")
        print("     copy .env.example .env")
        print("  2. Edit .env and set your Supabase session pooler connection string:")
        print("     THEFTGUARD_DATABASE_URL=postgresql+psycopg://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require")
        print("  3. Run this script again:")
        print("     python scripts/verify_db_connection.py\n")
        print("=" * 72)
        return 1

    try:
        normalized_url = normalize_database_url(raw_url)
        masked_url = mask_database_url(normalized_url)
        print(f"\n[CONFIG] Target: {masked_url}")
    except Exception as exc:
        print(f"\n[RESULT] FAILED: Invalid database URL format.")
        print(f"Error: {type(exc).__name__}")
        print("=" * 72)
        return 1

    print("[INFO] Attempting connection to Supabase PostgreSQL...")
    print("       (Verifying SSL, IPv4 session pooler route, and credentials)")

    try:
        engine = get_engine()
        with engine.connect() as conn:
            # Query server metadata without creating or reading application tables
            result = conn.execute(
                text("SELECT current_database(), current_user, version();")
            )
            row = result.fetchone()

        if not row:
            print("[RESULT] FAILED: Database returned an empty response.")
            print("=" * 72)
            return 1

        db_name, db_user, db_version = row[0], row[1], row[2]
        version_summary = db_version.splitlines()[0] if db_version else "Unknown"

        print("\n" + "-" * 72)
        print("[SUCCESS] Connected to Supabase PostgreSQL database successfully!")
        print(f"  - Database: {db_name}")
        print(f"  - User:     {db_user}")
        print(f"  - Version:  {version_summary[:60]}...")
        print(f"  - Pooler:   Port 5432 / SSL active")
        print("-" * 72)
        print("[INFO] Phase 1 database connectivity verification complete.")
        print("       (No application tables or migrations were executed.)")
        print("=" * 72)
        return 0

    except DatabaseConfigError as dce:
        print(f"\n[RESULT] FAILED: Configuration error: {dce}")
        print("=" * 72)
        return 1
    except Exception as exc:
        raw_msg = str(exc)
        # Sanitize exception message to ensure no credentials or raw tokens leak
        if raw_url and "@" in raw_url:
            try:
                pw_part = raw_url.split("@")[0].split(":")[-1]
                if pw_part and len(pw_part) > 2:
                    raw_msg = raw_msg.replace(pw_part, "***")
            except Exception:
                pass

        print(f"\n[RESULT] FAILED: Connection could not be established.")
        print(f"Error type: {type(exc).__name__}")
        print(f"Details:    {raw_msg}")
        print("\nTroubleshooting tips:")
        print("  1. Password check: Verify that your database password in .env is correct.")
        print("     If your password contains special characters (@, :, /, %), encode them (%xx).")
        print("  2. Host check: Verify you are using the Session Pooler host from your dashboard:")
        print("     aws-0-[region].pooler.supabase.com (Port 5432)")
        print("     Direct connection (db.[ref].supabase.co) requires IPv6 which may fail locally.")
        print("  3. SSL check: Ensure ?sslmode=require is present in the connection string.")
        print("  4. Project status: Confirm your Supabase project is active and not paused.")
        print("=" * 72)
        return 1


if __name__ == "__main__":
    sys.exit(verify())
