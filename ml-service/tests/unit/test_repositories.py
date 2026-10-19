"""Unit tests for TheftGuard AI database repositories and atomic transactions (Stage 3A).

Tests repository CRUD operations, atomic rollbacks on failure, scoped duplicate checks,
and relationship cascades/preservation.
"""

from __future__ import annotations

import unittest
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from service.db.models import Base
from service.db.repositories import (
    BatchRepository,
    BillExtractionRepository,
    DuplicateInvestigationError,
    InvestigationRepository,
    RepositoryError,
)
from service.db.schemas import (
    BillExtractionCreate,
    InvestigationCreate,
    InvestigationUpdate,
    ScreeningBatchCreate,
    ScreeningRecordCreate,
)


class RepositoryUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory database engine for fast ORM unit testing
        cls.engine = create_engine("sqlite:///:memory:")

        @event.listens_for(cls.engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine, expire_on_commit=False)

    def setUp(self):
        self.session: Session = self.SessionLocal()

    def tearDown(self):
        self.session.rollback()
        self.session.close()

    def test_batch_repository_atomic_creation_and_listing(self):
        """Verify BatchRepository creates batch and all child records atomically."""
        batch_in = ScreeningBatchCreate(
            file_name="telangana_feeders_2026.csv",
            file_hash="abc123hash",
            model_sha256="dummy_pipeline_sha256",
            threshold_elevated=0.40,
            threshold_review=0.70,
            records=[
                ScreeningRecordCreate(
                    row_index=0,
                    customer_ref="CUST-001",
                    status="scored",
                    model_score=0.88,
                    predicted_label=1,
                    label_name="Suspicious",
                    review_category="review",
                    features={"kwh_mean": 12.5},
                    warnings=[],
                ),
                ScreeningRecordCreate(
                    row_index=1,
                    customer_ref="CUST-002",
                    status="scored",
                    model_score=0.15,
                    predicted_label=0,
                    label_name="Normal",
                    review_category="normal",
                    features={"kwh_mean": 28.1},
                ),
                ScreeningRecordCreate(
                    row_index=2,
                    customer_ref="CUST-003",
                    status="rejected",
                    model_score=None,
                    review_category="rejected",
                    errors=[{"field": "kwh_mean", "message": "missing required value"}],
                ),
            ],
        )

        batch = BatchRepository.create_batch(self.session, batch_in)
        self.assertIsNotNone(batch.id)
        self.assertEqual(batch.total_rows, 3)
        self.assertEqual(batch.scored_rows, 2)
        self.assertEqual(batch.rejected_rows, 1)

        # Retrieve batch
        fetched = BatchRepository.get_batch(self.session, batch.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.file_name, "telangana_feeders_2026.csv")

        # Retrieve with paginated records
        b, records, total_count = BatchRepository.get_batch_with_records(self.session, batch.id, limit=2, offset=0)
        self.assertEqual(total_count, 3)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].customer_ref, "CUST-001")
        self.assertEqual(records[1].customer_ref, "CUST-002")

        # List batches
        batches = BatchRepository.list_batches(self.session, limit=10)
        self.assertGreaterEqual(len(batches), 1)

    def test_investigation_repository_crud_and_origin_mapping(self):
        """Verify InvestigationRepository creates, queries, updates, and normalizes origin."""
        inv_in = InvestigationCreate(
            customer_ref="CUST-TG-994",
            origin="Model screening",  # Frontend human-readable string
            basis="High anomaly score 0.91",
            priority="High",
            notes="Assigned to Hyderabad South inspection unit.",
            checklist=[{"label": "Check meter seal", "done": False}],
        )

        inv = InvestigationRepository.create_investigation(self.session, inv_in)
        self.assertIsNotNone(inv.id)
        self.assertTrue(inv.ticket_code.startswith("INV-"))
        self.assertEqual(inv.origin, "screening")  # Successfully normalized to canonical DB enum
        self.assertEqual(inv.priority, "High")

        # Query by ticket code
        by_code = InvestigationRepository.get_investigation_by_ticket_code(self.session, inv.ticket_code)
        self.assertIsNotNone(by_code)
        self.assertEqual(by_code.id, inv.id)

        # Update status and checklist
        patch = InvestigationUpdate(
            status="In inspection",
            notes="Meter seal intact; checking connected sanction load.",
            checklist=[{"label": "Check meter seal", "done": True}],
        )
        updated = InvestigationRepository.update_investigation(self.session, inv.id, patch)
        self.assertIsNotNone(updated)
        self.assertEqual(updated.status, "In inspection")
        self.assertEqual(updated.checklist[0]["done"], True)
        self.assertIsNotNone(updated.updated_at)

        # List with status filter
        in_inspection_list = InvestigationRepository.list_investigations(self.session, status="In inspection")
        self.assertEqual(len(in_inspection_list), 1)
        self.assertEqual(in_inspection_list[0].id, inv.id)

        # Delete investigation
        deleted = InvestigationRepository.delete_investigation(self.session, inv.id)
        self.assertTrue(deleted)
        self.assertIsNone(InvestigationRepository.get_investigation(self.session, inv.id))

    def test_scoped_duplicate_investigation_prevention(self):
        """Verify duplicate ticket creation raises DuplicateInvestigationError."""
        # 1. Create batch and record
        batch_in = ScreeningBatchCreate(
            file_name="batch_for_dup_test.csv",
            model_sha256="dummy_hash_123",
            records=[
                ScreeningRecordCreate(
                    row_index=0,
                    customer_ref="CUST-DUP-TEST",
                    status="scored",
                    model_score=0.92,
                )
            ],
        )
        batch = BatchRepository.create_batch(self.session, batch_in)
        record = batch.records[0]

        # 2. First ticket linked to record
        inv1 = InvestigationRepository.create_investigation(
            self.session,
            InvestigationCreate(
                ticket_code="TC-DUP-TEST-001",
                customer_ref="CUST-DUP-TEST",
                origin="screening",
                basis="First ticket",
                screening_record_id=record.id,
                batch_id=batch.id,
            ),
        )
        self.assertIsNotNone(inv1)

        # 3. Duplicate ticket_code must raise DuplicateInvestigationError
        with self.assertRaises(DuplicateInvestigationError) as ctx:
            InvestigationRepository.create_investigation(
                self.session,
                InvestigationCreate(
                    ticket_code="TC-DUP-TEST-001",
                    customer_ref="CUST-OTHER",
                    origin="screening",
                    basis="Attempting duplicate ticket code",
                ),
            )
        self.assertIn("already exists", str(ctx.exception))

        # 4. Duplicate screening_record_id must raise DuplicateInvestigationError
        with self.assertRaises(DuplicateInvestigationError) as ctx:
            InvestigationRepository.create_investigation(
                self.session,
                InvestigationCreate(
                    customer_ref="CUST-DUP-TEST",
                    origin="screening",
                    basis="Attempting second ticket on same record",
                    screening_record_id=record.id,
                ),
            )
        self.assertIn("already attached", str(ctx.exception))

        # 5. Duplicate active ticket for same (customer_ref, batch_id) must raise DuplicateInvestigationError
        with self.assertRaises(DuplicateInvestigationError) as ctx:
            InvestigationRepository.create_investigation(
                self.session,
                InvestigationCreate(
                    customer_ref="CUST-DUP-TEST",
                    origin="screening",
                    basis="Attempting duplicate active ticket in same batch",
                    batch_id=batch.id,
                ),
            )
        self.assertIn("already exists", str(ctx.exception))

    def test_non_unique_integrity_errors_do_not_raise_duplicate_investigation_error(self):
        """Verify FK and CHECK constraint failures raise RepositoryError, not DuplicateInvestigationError."""
        # Check constraint failure (priority)
        bad_check = InvestigationCreate.model_construct(
            ticket_code="TC-BAD-CK",
            customer_ref="CUST-CK",
            origin="screening",
            basis="Test check constraint",
            priority="InvalidPriorityVal",
        )
        with self.assertRaises(RepositoryError) as ctx:
            InvestigationRepository.create_investigation(self.session, bad_check)
        self.assertNotIsInstance(ctx.exception, DuplicateInvestigationError)

        # Foreign key failure (nonexistent batch_id)
        bad_fk = InvestigationCreate(
            ticket_code="TC-BAD-FK",
            customer_ref="CUST-FK",
            origin="screening",
            basis="Test foreign key constraint",
            batch_id=uuid.uuid4(),
        )
        with self.assertRaises(RepositoryError) as ctx:
            InvestigationRepository.create_investigation(self.session, bad_fk)
        self.assertNotIsInstance(ctx.exception, DuplicateInvestigationError)

    def test_bill_extraction_repository_crud(self):
        """Verify BillExtractionRepository creates and lists bill extractions."""
        bill_in = BillExtractionCreate(
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
            has_discrepancy=False,
            raw_billing_period="01/04/2026 to 30/04/2026",
            raw_bill_date="02/05/2026",
            raw_previous_reading="8,450",
            raw_current_reading="8,720",
        )

        extraction = BillExtractionRepository.create_extraction(self.session, bill_in)
        self.assertIsNotNone(extraction.id)
        self.assertEqual(extraction.consumer_number, "100458921")
        self.assertEqual(extraction.calculated_units, Decimal("270.00"))
        self.assertFalse(hasattr(extraction, "raw_ocr_text"))

        # List extractions
        list_res = BillExtractionRepository.list_extractions(self.session, consumer_number="100458921")
        self.assertEqual(len(list_res), 1)
        self.assertEqual(list_res[0].id, extraction.id)

    def test_investigation_preservation_on_batch_deletion(self):
        """Verify that when a screening batch is deleted, investigations survive with foreign keys SET NULL."""
        batch = BatchRepository.create_batch(
            self.session,
            ScreeningBatchCreate(
                file_name="purge_test.csv",
                model_sha256="dummy_hash_purge",
                records=[
                    ScreeningRecordCreate(
                        row_index=0,
                        customer_ref="CUST-PURGE-01",
                        status="scored",
                        model_score=0.85,
                    )
                ],
            ),
        )
        record = batch.records[0]

        inv = InvestigationRepository.create_investigation(
            self.session,
            InvestigationCreate(
                customer_ref="CUST-PURGE-01",
                origin="screening",
                basis="Ticket should survive batch deletion",
                batch_id=batch.id,
                screening_record_id=record.id,
            ),
        )

        # Delete batch
        deleted = BatchRepository.delete_batch(self.session, batch.id)
        self.assertTrue(deleted)

        # Investigation MUST survive
        inv_after = InvestigationRepository.get_investigation(self.session, inv.id)
        self.assertIsNotNone(inv_after)
        self.assertEqual(inv_after.customer_ref, "CUST-PURGE-01")
        self.assertEqual(inv_after.basis, "Ticket should survive batch deletion")


if __name__ == "__main__":
    unittest.main()
