"""TheftGuard AI — Repository Integration Tests on Disposable PostgreSQL.

Tests repository operations, atomic rollback, origin normalization, and constraints
ONLY against a disposable test PostgreSQL database.

SAFETY GUARD:
Explicitly rejects execution against any production Supabase URL or the live project.

Usage:
    python scripts/test_repositories_on_disposable_db.py --url "postgresql+psycopg://user:pass@localhost:5432/test_db"
    or set THEFTGUARD_TEST_DATABASE_URL in your environment.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from service.db.config import mask_database_url, normalize_database_url  # noqa: E402
from service.db.models import BillExtraction, Investigation, ScreeningBatch, ScreeningRecord  # noqa: E402
from service.db.repositories import (  # noqa: E402
    BatchRepository,
    BillExtractionRepository,
    DuplicateInvestigationError,
    InvestigationRepository,
    RepositoryError,
)
from service.db.schemas import (  # noqa: E402
    BillExtractionCreate,
    InvestigationCreate,
    InvestigationUpdate,
    ScreeningBatchCreate,
    ScreeningRecordCreate,
)


def run_repository_integration_test(db_url: str) -> int:
    print("=" * 76)
    print(" TheftGuard AI — Repository Integration Tests on Disposable PostgreSQL")
    print("=" * 76)

    norm_url = normalize_database_url(db_url)
    masked = mask_database_url(norm_url)
    print(f"\n[TARGET DATABASE] {masked}")

    # Safety Guard
    parsed = urlparse(norm_url)
    hostname = (parsed.hostname or "").lower()
    prod_env_url = os.getenv("THEFTGUARD_DATABASE_URL", "")
    prod_host = (urlparse(prod_env_url).hostname or "").lower() if prod_env_url else ""

    if (
        "supabase.co" in hostname
        or "pooler.supabase.com" in hostname
        or (prod_host and hostname == prod_host)
    ):
        print("\n[SAFETY ABORT] Refusing to run tests against a Supabase / production host.")
        print("Please point to an isolated disposable database (e.g. localhost, local test container, or sandbox DB).\n")
        print("=" * 76)
        return 1

    sql_dir = _root / "migrations" / "sql"
    forward_sql = (sql_dir / "001_phase2_initial_schema.sql").read_text(encoding="utf-8")
    rollback_sql = (sql_dir / "001_phase2_rollback_initial_schema.sql").read_text(encoding="utf-8")

    ddl_engine = create_engine(norm_url, isolation_level="AUTOCOMMIT")
    engine = create_engine(norm_url)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    try:
        # Pre-clean and apply schema
        with ddl_engine.connect() as conn:
            cursor = conn.connection.cursor()
            print("\n[SETUP] Applying Phase 2 schema on disposable target...")
            cursor.execute(rollback_sql)
            cursor.execute(forward_sql)
            print("        Schema applied successfully.")

        session = SessionLocal()

        # ------------------------------------------------------------------
        # Test 1: Atomic Batch Creation & Rollback on Failure
        # ------------------------------------------------------------------
        print("\n[TEST 1/5] Testing atomic batch creation & transaction rollback on failure...")
        # Valid batch
        valid_batch_in = ScreeningBatchCreate(
            file_name="telangana_batch_pg_test.csv",
            file_hash="sha256_mock_123",
            model_sha256="dummy_rf_sha256",
            threshold_elevated=0.40,
            threshold_review=0.70,
            records=[
                ScreeningRecordCreate(
                    row_index=0,
                    customer_ref="CUST-PG-001",
                    status="scored",
                    model_score=0.88,
                    predicted_label=1,
                    label_name="Suspicious",
                    review_category="review",
                    features={"kwh_mean": 15.2},
                ),
                ScreeningRecordCreate(
                    row_index=1,
                    customer_ref="CUST-PG-002",
                    status="scored",
                    model_score=0.12,
                    predicted_label=0,
                    label_name="Normal",
                    review_category="normal",
                    features={"kwh_mean": 24.0},
                ),
            ],
        )

        batch = BatchRepository.create_batch(session, valid_batch_in)
        assert batch.id is not None
        assert batch.total_rows == 2
        print(f"        Created batch {batch.id} with {batch.total_rows} records.")

        # Test failure rollback: create batch with a record violating check constraint
        failed_caught = False
        try:
            # We bypass Pydantic client-side check to force a raw database constraint failure
            bad_rec = ScreeningRecordCreate.model_construct(
                row_index=2,
                customer_ref="CUST-PG-BAD",
                status="scored",
                model_score=1.5,  # Violates PostgreSQL ck_screening_records_score_range
                review_category="review",
                features={},
                warnings=[],
                errors=[],
            )
            bad_batch_in = ScreeningBatchCreate(
                file_name="bad_batch.csv",
                model_sha256="dummy_rf_sha256",
                records=[bad_rec],
            )
            BatchRepository.create_batch(session, bad_batch_in)
        except RepositoryError:
            failed_caught = True
            print("        Caught expected database error on invalid record score.")

        if not failed_caught:
            print("        [FAILED] Atomic rollback test failed to trigger RepositoryError!")
            return 1

        # Verify bad batch was NOT persisted in PostgreSQL catalog
        bad_in_db = session.scalars(select(ScreeningBatch).where(ScreeningBatch.file_name == "bad_batch.csv")).first()
        if bad_in_db is not None:
            print("        [FAILED] Failed batch was not rolled back from database!")
            return 1
        print("        Atomic rollback verified: failed batch left zero orphaned records in PostgreSQL.")

        # ------------------------------------------------------------------
        # Test 2: Paginated Batch Retrieval
        # ------------------------------------------------------------------
        print("\n[TEST 2/5] Testing batch listing & paginated record retrieval...")
        fetched_batch, records, total_records = BatchRepository.get_batch_with_records(
            session, batch.id, limit=1, offset=0
        )
        assert total_records == 2
        assert len(records) == 1
        assert records[0].customer_ref == "CUST-PG-001"
        print(f"        Paginated retrieval verified: 1 of {total_records} records retrieved.")

        # ------------------------------------------------------------------
        # Test 3: Investigation Creation, Origin Mapping & Scoped Duplicates
        # ------------------------------------------------------------------
        print("\n[TEST 3/5] Testing investigation creation, origin mapping & scoped duplicates...")
        first_record = records[0]
        inv_data = InvestigationCreate(
            customer_ref="CUST-PG-001",
            origin="Model screening",  # Frontend human-readable string
            basis="High anomaly score 0.88",
            priority="High",
            batch_id=batch.id,
            screening_record_id=first_record.id,
        )

        inv = InvestigationRepository.create_investigation(session, inv_data)
        assert inv.origin == "screening"  # Normalized
        assert inv.status == "New"
        print(f"        Investigation {inv.ticket_code} created with normalized origin '{inv.origin}'.")

        # Duplicate check on same screening record
        dup_rec_caught = False
        try:
            InvestigationRepository.create_investigation(
                session,
                InvestigationCreate(
                    customer_ref="CUST-PG-001",
                    origin="screening",
                    basis="Duplicate attempt on same record",
                    screening_record_id=first_record.id,
                ),
            )
        except DuplicateInvestigationError:
            dup_rec_caught = True
            print("        Caught expected DuplicateInvestigationError on duplicate screening_record_id.")

        if not dup_rec_caught:
            print("        [FAILED] Duplicate screening_record_id was not rejected!")
            return 1

        # Duplicate check on same active (customer_ref, batch_id)
        dup_batch_caught = False
        try:
            InvestigationRepository.create_investigation(
                session,
                InvestigationCreate(
                    customer_ref="CUST-PG-001",
                    origin="screening",
                    basis="Duplicate active ticket in same batch",
                    batch_id=batch.id,
                ),
            )
        except DuplicateInvestigationError:
            dup_batch_caught = True
            print("        Caught expected DuplicateInvestigationError on duplicate active customer ticket.")

        if not dup_batch_caught:
            print("        [FAILED] Duplicate active customer ticket was not rejected!")
            return 1

        # Duplicate check on same ticket_code
        dup_tc_caught = False
        try:
            InvestigationRepository.create_investigation(
                session,
                InvestigationCreate(
                    ticket_code=inv.ticket_code,
                    customer_ref="CUST-PG-OTHER",
                    origin="screening",
                    basis="Attempt duplicate ticket code",
                ),
            )
        except DuplicateInvestigationError:
            dup_tc_caught = True
            print("        Caught expected DuplicateInvestigationError on duplicate ticket_code.")

        if not dup_tc_caught:
            print("        [FAILED] Duplicate ticket_code was not rejected!")
            return 1

        # Foreign key failure check: must raise RepositoryError, NOT DuplicateInvestigationError
        fk_caught_correctly = False
        try:
            InvestigationRepository.create_investigation(
                session,
                InvestigationCreate(
                    customer_ref="CUST-PG-FK",
                    origin="screening",
                    basis="Attempt nonexistent batch",
                    batch_id=uuid.uuid4(),
                ),
            )
        except DuplicateInvestigationError:
            print("        [FAILED] Foreign key failure falsely raised DuplicateInvestigationError!")
            return 1
        except RepositoryError:
            fk_caught_correctly = True
            print("        Foreign key violation correctly raised RepositoryError, not DuplicateInvestigationError.")

        if not fk_caught_correctly:
            print("        [FAILED] Foreign key violation was not caught!")
            return 1

        # Update investigation and check timezone-aware UTC updated_at
        updated = InvestigationRepository.update_investigation(
            session, inv.id, InvestigationUpdate(status="In inspection", notes="Inspecting meter seal.")
        )
        assert updated.status == "In inspection"
        assert updated.notes == "Inspecting meter seal."
        assert updated.updated_at is not None
        assert updated.updated_at.tzinfo is not None, "updated_at must be timezone-aware"
        print(f"        Investigation update verified with timezone-aware UTC timestamp ({updated.updated_at.tzinfo}).")

        # ------------------------------------------------------------------
        # Test 4: Bill Extraction Persistence & No-PII Verification
        # ------------------------------------------------------------------
        print("\n[TEST 4/5] Testing bill extraction persistence & data minimization...")
        bill_data = BillExtractionCreate(
            consumer_number="100458921",
            discom="TSSPDCL",
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            bill_date=date(2026, 5, 2),
            previous_reading=Decimal("8450.00"),
            current_reading=Decimal("8720.00"),
            units_consumed=Decimal("270.00"),
            billing_days=30,
            amount_payable=Decimal("1842.00"),
            raw_previous_reading="8,450",
            raw_current_reading="8,720",
            investigation_id=inv.id,
        )
        extraction = BillExtractionRepository.create_extraction(session, bill_data)
        assert extraction.calculated_units == Decimal("270.00")
        assert extraction.consumer_number == "100458921"
        assert not hasattr(extraction, "raw_ocr_text")
        print(f"        Bill extraction {extraction.id} saved without raw_ocr_text.")

        # ------------------------------------------------------------------
        # Test 5: Batch Purge & Investigation Preservation
        # ------------------------------------------------------------------
        print("\n[TEST 5/5] Testing batch purge & investigation preservation (SET NULL)...")
        deleted_batch = BatchRepository.delete_batch(session, batch.id)
        assert deleted_batch is True

        # Records must be gone
        rec_check = session.scalars(select(ScreeningRecord).where(ScreeningRecord.id == first_record.id)).first()
        assert rec_check is None
        print("        Child screening_records cleanly purged on batch deletion.")

        # Investigation MUST survive with batch_id and screening_record_id SET NULL
        inv_check = InvestigationRepository.get_investigation(session, inv.id)
        assert inv_check is not None
        assert inv_check.batch_id is None
        assert inv_check.screening_record_id is None
        print("        Investigation ticket preserved with foreign keys SET NULL.")

        # Rollback all tables cleanly
        session.close()
        with ddl_engine.connect() as conn:
            cursor = conn.connection.cursor()
            cursor.execute(rollback_sql)
            print("\n[CLEANUP] Post-test cleanup complete.")

        print("\n" + "=" * 76)
        print(" [SUCCESS] All 5 Repository Integration Tests Passed on Disposable PostgreSQL:")
        print("   1. Atomic batch creation & transaction rollback on failure")
        print("   2. Batch listing and paginated record retrieval")
        print("   3. Investigation creation, origin mapping, and duplicate prevention")
        print("   4. Bill extraction persistence without PII (raw_ocr_text excluded)")
        print("   5. Cascade batch deletion with investigation preservation (SET NULL)")
        print("=" * 76 + "\n")
        return 0

    except Exception as exc:
        print(f"\n[FAILED] Error during repository integration test: {exc}")
        return 1
    finally:
        engine.dispose()
        ddl_engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Test repositories on disposable PostgreSQL.")
    parser.add_argument("--url", help="Disposable database connection URL", default=None)
    args = parser.parse_args()

    db_url = args.url or os.getenv("THEFTGUARD_TEST_DATABASE_URL")
    if not db_url:
        print("\n[INFO] No disposable test database URL provided.")
        print("Usage: python scripts/test_repositories_on_disposable_db.py --url 'postgresql+psycopg://user:pass@localhost:5432/test_db'")
        print("Or set THEFTGUARD_TEST_DATABASE_URL in your environment.\n")
        return 0

    return run_repository_integration_test(db_url)


if __name__ == "__main__":
    sys.exit(main())
