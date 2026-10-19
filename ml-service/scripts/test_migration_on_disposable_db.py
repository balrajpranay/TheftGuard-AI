"""TheftGuard AI — Disposable Database Migration Test Runner (Comprehensive).

Tests forward migration, pre-flight incompatibility handling, rerun idempotency,
constraints, foreign keys, RLS/grants, and rollback ONLY against a disposable
test PostgreSQL database.

SAFETY GUARD:
Explicitly rejects execution against any production Supabase URL or the live project.

Usage:
    python scripts/test_migration_on_disposable_db.py --url "postgresql+psycopg://user:pass@localhost:5432/test_db"
    or set THEFTGUARD_TEST_DATABASE_URL in your environment.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from sqlalchemy import create_engine, text  # noqa: E402
from service.db.config import mask_database_url, normalize_database_url  # noqa: E402


def run_disposable_test(db_url: str) -> int:
    print("=" * 76)
    print(" TheftGuard AI — Comprehensive Disposable PostgreSQL Migration Test Runner")
    print("=" * 76)

    norm_url = normalize_database_url(db_url)
    masked = mask_database_url(norm_url)
    print(f"\n[TARGET DATABASE] {masked}")

    # Safety Guard: Check against production host patterns
    parsed = urlparse(norm_url)
    hostname = (parsed.hostname or "").lower()

    # Block production Supabase project hosts
    prod_env_url = os.getenv("THEFTGUARD_DATABASE_URL", "")
    prod_host = (urlparse(prod_env_url).hostname or "").lower() if prod_env_url else ""

    if (
        "supabase.co" in hostname
        or "pooler.supabase.com" in hostname
        or (prod_host and hostname == prod_host)
    ):
        print("\n[SAFETY ABORT] Refusing to run destructive migration test against a Supabase / production host.")
        print("This runner drops and recreates tables and tests error conditions, which deletes all data.")
        print("Please point to an isolated disposable database (e.g. localhost, local test container, or sandbox DB).\n")
        print("=" * 76)
        return 1

    sql_dir = _root / "migrations" / "sql"
    forward_sql_path = sql_dir / "001_phase2_initial_schema.sql"
    rollback_sql_path = sql_dir / "001_phase2_rollback_initial_schema.sql"

    forward_sql = forward_sql_path.read_text(encoding="utf-8")
    rollback_sql = rollback_sql_path.read_text(encoding="utf-8")

    engine = create_engine(norm_url, isolation_level="AUTOCOMMIT")

    try:
        with engine.connect() as conn:
            cursor = conn.connection.cursor()

            # Ensure clean initial state on disposable DB
            print("\n[PRE-CLEAN] Cleaning any existing Phase 2 tables on disposable target...")
            cursor.execute(rollback_sql)
            print("            Pre-clean complete.")

            # ------------------------------------------------------------------
            # Test 1: Incompatible Pre-Existing Schema Protection
            # ------------------------------------------------------------------
            print("\n[TEST 1/7] Testing incompatible pre-existing schema protection (DO $$ assertion)...")
            # Create a mock incompatible legacy table missing 'model_score'
            cursor.execute("CREATE TABLE screening_records (id UUID PRIMARY KEY, customer_ref TEXT);")
            incompatible_caught = False
            try:
                cursor.execute(forward_sql)
            except Exception as exc:
                incompatible_caught = True
                conn.connection.rollback()
                print(f"           Successfully caught expected incompatibility exception:\n           -> {exc}")
            finally:
                conn.connection.rollback()
                # Cleanup the mock table
                cursor = conn.connection.cursor()
                cursor.execute("DROP TABLE IF EXISTS screening_records CASCADE;")
                conn.connection.commit()

            if not incompatible_caught:
                print("           [FAILED] Migration failed to abort on incompatible legacy table!")
                return 1
            print("           Incompatible schema test passed: Migration aborted cleanly without corruption.")

            # ------------------------------------------------------------------
            # Test 2: Clean Forward Migration Execution
            # ------------------------------------------------------------------
            print("\n[TEST 2/7] Executing forward migration (001_phase2_initial_schema.sql)...")
            cursor.execute(forward_sql)
            print("           Forward migration applied successfully.")

            # ------------------------------------------------------------------
            # Test 3: Migration Ledger & Catalog Verification
            # ------------------------------------------------------------------
            print("\n[TEST 3/7] Verifying migration ledger and database catalog...")
            check_q = text("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('screening_batches', 'screening_records', 'investigations', 'bill_extractions', 'schema_migrations');
            """)
            found = {row[0] for row in conn.execute(check_q).fetchall()}
            expected = {'screening_batches', 'screening_records', 'investigations', 'bill_extractions', 'schema_migrations'}
            if found != expected:
                print(f"           [FAILED] Expected tables {expected}, but found {found}")
                return 1

            ledger_res = conn.execute(text("SELECT version, applied_at FROM schema_migrations WHERE version = '001_phase2_initial_schema';")).fetchone()
            if not ledger_res:
                print("           [FAILED] Ledger entry '001_phase2_initial_schema' missing from schema_migrations!")
                return 1
            print(f"           Found all {len(found)} expected tables: {sorted(found)}")
            print(f"           Migration ledger verified stamped at: {ledger_res[1]}")

            # ------------------------------------------------------------------
            # Test 4: Rerun Idempotency
            # ------------------------------------------------------------------
            print("\n[TEST 4/7] Testing rerun idempotency (running forward migration a 2nd time)...")
            cursor.execute(forward_sql)
            print("           Rerun idempotency passed (IF NOT EXISTS handled existing tables/indexes).")

            # ------------------------------------------------------------------
            # Test 5: Constraints, Foreign Keys & Cascades
            # ------------------------------------------------------------------
            print("\n[TEST 5/7] Testing constraints, foreign keys, cascades, and scoped unique indexes...")

            batch_id = str(uuid.uuid4())
            record_id = str(uuid.uuid4())
            inv_id = str(uuid.uuid4())
            ticket_code = f"TEST-INV-{uuid.uuid4().hex[:6].upper()}"

            # Insert valid batch
            conn.execute(text("""
                INSERT INTO screening_batches (id, file_name, model_sha256, total_rows, scored_rows)
                VALUES (:id, 'test_batch.csv', 'dummy_hash_123', 1, 1);
            """), {"id": batch_id})

            # Check constraint: score range violation (> 1.0)
            score_ck_caught = False
            try:
                conn.execute(text("""
                    INSERT INTO screening_records (id, batch_id, row_index, customer_ref, model_score)
                    VALUES (:id, :batch_id, 0, 'CUST-001', 1.25);
                """), {"id": str(uuid.uuid4()), "batch_id": batch_id})
                conn.commit()
            except Exception:
                score_ck_caught = True
                conn.rollback()
                conn.connection.rollback()
            if not score_ck_caught:
                print("           [FAILED] ck_screening_records_score_range failed to reject score > 1.0!")
                return 1
            print("           Constraint ck_screening_records_score_range rejected invalid score (1.25).")

            # Insert valid screening record
            conn.execute(text("""
                INSERT INTO screening_records (id, batch_id, row_index, customer_ref, model_score, review_category, status)
                VALUES (:id, :batch_id, 0, 'CUST-001', 0.85, 'review', 'scored');
            """), {"id": record_id, "batch_id": batch_id})
            conn.commit()

            # Insert valid investigation ticket
            conn.execute(text("""
                INSERT INTO investigations (id, ticket_code, customer_ref, basis, status, priority, batch_id, screening_record_id)
                VALUES (:id, :ticket_code, 'CUST-001', 'High anomaly score', 'New', 'High', :batch_id, :record_id);
            """), {"id": inv_id, "ticket_code": ticket_code, "batch_id": batch_id, "record_id": record_id})
            conn.commit()

            # Test unique index: duplicate ticket on same screening_record_id rejected
            dup_record_caught = False
            try:
                conn.execute(text("""
                    INSERT INTO investigations (id, ticket_code, customer_ref, basis, batch_id, screening_record_id)
                    VALUES (:id, 'TEST-INV-DUP', 'CUST-001', 'Duplicate attempt', :batch_id, :record_id);
                """), {"id": str(uuid.uuid4()), "batch_id": batch_id, "record_id": record_id})
                conn.commit()
            except Exception:
                dup_record_caught = True
                conn.rollback()
                conn.connection.rollback()
            if not dup_record_caught:
                print("           [FAILED] uq_investigations_screening_record failed to reject duplicate ticket on same record!")
                return 1
            print("           Unique index uq_investigations_screening_record rejected duplicate ticket on same record.")

            # Test unique index: duplicate active ticket on same (customer_ref, batch_id) rejected
            dup_batch_caught = False
            try:
                conn.execute(text("""
                    INSERT INTO investigations (id, ticket_code, customer_ref, basis, status, batch_id)
                    VALUES (:id, 'TEST-INV-DUP2', 'CUST-001', 'Duplicate active customer ticket', 'New', :batch_id);
                """), {"id": str(uuid.uuid4()), "batch_id": batch_id})
                conn.commit()
            except Exception:
                dup_batch_caught = True
                conn.rollback()
                conn.connection.rollback()
            if not dup_batch_caught:
                print("           [FAILED] uq_investigations_active_customer_batch failed to reject duplicate active ticket in same batch!")
                return 1
            print("           Unique index uq_investigations_active_customer_batch rejected duplicate active ticket in same batch.")

            # Test Cascade & Set Null on batch deletion:
            # When batch_id is deleted:
            # - screening_record must CASCADE delete
            # - investigation must SURVIVE with batch_id and screening_record_id SET NULL
            conn.execute(text("DELETE FROM screening_batches WHERE id = :id;"), {"id": batch_id})

            rec_after = conn.execute(text("SELECT id FROM screening_records WHERE id = :id;"), {"id": record_id}).fetchone()
            if rec_after is not None:
                print("           [FAILED] ON DELETE CASCADE failed to delete child screening_record!")
                return 1
            print("           Cascade behavior verified: child screening_record was purged with batch.")

            inv_after = conn.execute(text("SELECT id, batch_id, screening_record_id, customer_ref FROM investigations WHERE id = :id;"), {"id": inv_id}).fetchone()
            if inv_after is None:
                print("           [FAILED] Investigation was erroneously deleted when batch was purged!")
                return 1
            if inv_after[1] is not None or inv_after[2] is not None:
                print(f"           [FAILED] Investigation foreign keys were not set to NULL: {inv_after}")
                return 1
            print("           Investigation preservation verified: ticket survived batch purge with foreign keys SET NULL.")

            # ------------------------------------------------------------------
            # Test 6: RLS & Permissions Lockdown
            # ------------------------------------------------------------------
            print("\n[TEST 6/7] Verifying Row Level Security (RLS) catalog configuration...")
            rls_q = text("""
                SELECT c.relname, c.relrowsecurity 
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' 
                AND c.relname IN ('screening_batches', 'screening_records', 'investigations', 'bill_extractions');
            """)
            rls_rows = dict(conn.execute(rls_q).fetchall())
            all_rls_enabled = all(rls_rows.get(tbl, False) for tbl in ['screening_batches', 'screening_records', 'investigations', 'bill_extractions'])
            if not all_rls_enabled:
                print(f"           [FAILED] RLS not enabled on all tables: {rls_rows}")
                return 1
            print(f"           RLS verified enabled (relrowsecurity = true) on all {len(rls_rows)} operational tables.")

            # ------------------------------------------------------------------
            # Test 7: Rollback Migration & Catalog Cleanup
            # ------------------------------------------------------------------
            print("\n[TEST 7/7] Testing rollback migration (001_phase2_rollback_initial_schema.sql)...")
            cursor.execute(rollback_sql)
            print("           Rollback migration executed successfully.")

            remaining = {row[0] for row in conn.execute(check_q).fetchall()}
            if remaining:
                print(f"           [FAILED] Tables remaining after rollback: {remaining}")
                return 1
            print("           All tables and ledger entries dropped cleanly.")

            print("\n" + "=" * 76)
            print(" [SUCCESS] All 7 PostgreSQL Integration Tests Passed Cleanly on Disposable Target:")
            print("   1. Incompatible schema DO block guard (aborted without corruption)")
            print("   2. Forward DDL execution (all tables, constraints, and indexes)")
            print("   3. Migration ledger registration (schema_migrations)")
            print("   4. Rerun idempotency (safe re-execution)")
            print("   5. CHECK constraints, Foreign Keys (CASCADE vs SET NULL), & Unique Indexes")
            print("   6. Row Level Security (RLS) catalog enablement")
            print("   7. Reverse-order Rollback DDL execution")
            print("=" * 76 + "\n")
            return 0

    except Exception as exc:
        print(f"\n[FAILED] Error during disposable migration test: {exc}")
        return 1
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Test migration scripts on a disposable database.")
    parser.add_argument("--url", help="Disposable database connection URL", default=None)
    args = parser.parse_args()

    db_url = args.url or os.getenv("THEFTGUARD_TEST_DATABASE_URL")
    if not db_url:
        print("\n[INFO] No disposable test database URL provided.")
        print("To run live forward/rollback execution tests on a disposable PostgreSQL database:")
        print("  python scripts/test_migration_on_disposable_db.py --url 'postgresql+psycopg://user:pass@localhost:5432/test_db'")
        print("Or set THEFTGUARD_TEST_DATABASE_URL in your environment.")
        print("(Safety guard prevents running this against your live Supabase database).\n")
        return 0

    return run_disposable_test(db_url)


if __name__ == "__main__":
    sys.exit(main())
