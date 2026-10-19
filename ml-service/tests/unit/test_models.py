"""Unit tests for SQLAlchemy Phase 2 ORM models (Revised).

Tests:
1. Model DDL creation and table integrity.
2. Relationships and cascade deletion behavior (verifying what survives when a batch is purged).
3. Scoped duplicate prevention for active investigations.
4. Typed dates, numerics, and raw OCR field handling.
"""

from __future__ import annotations

import sys
import unittest
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

# Ensure service root is on sys.path
_ml_service_root = Path(__file__).resolve().parents[2]
if str(_ml_service_root) not in sys.path:
    sys.path.insert(0, str(_ml_service_root))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from service.db.models import (  # noqa: E402
    Base,
    BillExtraction,
    Investigation,
    ScreeningBatch,
    ScreeningRecord,
)


class ModelDefinitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # In-memory SQLite for isolated model testing
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.session = self.SessionLocal()

    def tearDown(self):
        self.session.rollback()
        self.session.close()

    def test_tables_created_in_metadata(self):
        table_names = set(Base.metadata.tables.keys())
        expected = {"screening_batches", "screening_records", "investigations", "bill_extractions"}
        self.assertTrue(expected.issubset(table_names), f"Missing tables: {expected - table_names}")

    def test_create_batch_and_records_with_features(self):
        user_id = uuid.uuid4()
        batch = ScreeningBatch(
            file_name="test_features.csv",
            file_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            total_rows=2,
            scored_rows=2,
            rejected_rows=0,
            warning_rows=0,
            model_version="v1.0.0",
            model_sha256="442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5",
            threshold_elevated=0.40,
            threshold_review=0.70,
            status="completed",
            created_by=user_id,
        )
        self.session.add(batch)
        self.session.flush()

        record1 = ScreeningRecord(
            batch_id=batch.id,
            row_index=0,
            customer_ref="CUST_001",
            status="scored",
            model_score=0.884,
            predicted_label=1,
            label_name="Suspicious",
            review_category="review",
            features={
                "mean_consumption": 15.2,
                "positive_percent_of_all_dates": 92.5,
            },
            warnings=[],
            errors=[],
        )
        record2 = ScreeningRecord(
            batch_id=batch.id,
            row_index=1,
            customer_ref="CUST_002",
            status="scored",
            model_score=0.125,
            predicted_label=0,
            label_name="Normal",
            review_category="normal",
            features={
                "mean_consumption": 5.4,
                "positive_percent_of_all_dates": 99.0,
            },
            warnings=[],
            errors=[],
        )
        self.session.add_all([record1, record2])
        self.session.commit()

        # Query batch and check relationships
        queried = self.session.execute(
            select(ScreeningBatch).where(ScreeningBatch.id == batch.id)
        ).scalar_one()

        self.assertEqual(len(queried.records), 2)
        self.assertEqual(queried.created_by, user_id)
        self.assertEqual(queried.records[0].customer_ref, "CUST_001")
        self.assertEqual(queried.records[0].model_score, 0.884)
        self.assertEqual(queried.records[0].features["positive_percent_of_all_dates"], 92.5)

    def test_investigation_creation_and_scoped_duplicate_prevention(self):
        batch1 = ScreeningBatch(
            file_name="batch_march.csv",
            model_sha256="442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5",
        )
        self.session.add(batch1)
        self.session.flush()

        record1 = ScreeningRecord(
            batch_id=batch1.id,
            row_index=0,
            customer_ref="CUST_DUP_TEST",
            features={"mean_consumption": 18.0},
        )
        self.session.add(record1)
        self.session.flush()

        # Create active ticket for record1 in batch1
        ticket1 = Investigation(
            ticket_code=f"inv-{uuid.uuid4().hex[:8]}",
            customer_ref="CUST_DUP_TEST",
            origin="screening",
            basis="March screening score: 0.88",
            status="New",
            batch_id=batch1.id,
            screening_record_id=record1.id,
        )
        self.session.add(ticket1)
        self.session.commit()

        # Attempting duplicate active ticket for same customer in SAME batch fails
        ticket1_dup = Investigation(
            ticket_code=f"inv-{uuid.uuid4().hex[:8]}",
            customer_ref="CUST_DUP_TEST",
            origin="screening",
            basis="Accidental double submission",
            status="Scheduled",
            batch_id=batch1.id,
        )
        self.session.add(ticket1_dup)
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

        # However, a legitimate distinct screening event in a NEW batch (batch2) SUCCEEDS
        batch2 = ScreeningBatch(
            file_name="batch_april.csv",
            model_sha256="442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5",
        )
        self.session.add(batch2)
        self.session.flush()

        record2 = ScreeningRecord(
            batch_id=batch2.id,
            row_index=0,
            customer_ref="CUST_DUP_TEST",
            features={"mean_consumption": 24.0},
        )
        self.session.add(record2)
        self.session.flush()

        ticket2 = Investigation(
            ticket_code=f"inv-{uuid.uuid4().hex[:8]}",
            customer_ref="CUST_DUP_TEST",
            origin="screening",
            basis="April screening score: 0.94 (Follow-up event)",
            status="New",
            batch_id=batch2.id,
            screening_record_id=record2.id,
        )
        self.session.add(ticket2)
        self.session.commit()
        self.assertIsNotNone(ticket2.id)

    def test_deletion_behavior_and_investigation_preservation(self):
        """Verify precisely what data survives when a screening batch is purged."""
        batch = ScreeningBatch(
            file_name="temporary_screening.csv",
            model_sha256="442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5",
        )
        self.session.add(batch)
        self.session.flush()

        record = ScreeningRecord(
            batch_id=batch.id,
            row_index=0,
            customer_ref="CUST_SURVIVE_TEST",
            features={"mean_consumption": 30.0},
        )
        self.session.add(record)
        self.session.flush()

        ticket = Investigation(
            ticket_code=f"inv-{uuid.uuid4().hex[:8]}",
            customer_ref="CUST_SURVIVE_TEST",
            origin="screening",
            basis="Model score: 0.95 (High)",
            status="In inspection",
            priority="High",
            assignee="Inspector Sharma",
            notes="Physical inspection confirmed meter bypass wire.",
            checklist=[{"label": "Check seal", "done": True}],
            evidence=[{"name": "evidence.jpg", "size": 2048, "type": "image/jpeg"}],
            batch_id=batch.id,
            screening_record_id=record.id,
        )
        self.session.add(ticket)
        self.session.flush()

        bill = BillExtraction(
            consumer_number="100458921",
            discom="TSSPDCL",
            units_consumed=Decimal("300.00"),
            investigation_id=ticket.id,
        )
        self.session.add(bill)
        self.session.commit()

        ticket_id = ticket.id
        bill_id = bill.id
        record_id = record.id
        batch_id = batch.id

        # ACT: Purge the temporary screening batch
        self.session.delete(batch)
        self.session.commit()

        # ASSERT 1: Batch and its records are deleted (CASCADE)
        deleted_batch = self.session.execute(select(ScreeningBatch).where(ScreeningBatch.id == batch_id)).scalar_one_or_none()
        deleted_record = self.session.execute(select(ScreeningRecord).where(ScreeningRecord.id == record_id)).scalar_one_or_none()
        self.assertIsNone(deleted_batch, "Batch should be deleted.")
        self.assertIsNone(deleted_record, "ScreeningRecord should be cascade-deleted.")

        # ASSERT 2: Investigation ticket SURVIVES completely intact with foreign keys set to NULL
        surviving_ticket = self.session.execute(select(Investigation).where(Investigation.id == ticket_id)).scalar_one()
        self.assertIsNotNone(surviving_ticket, "Investigation ticket must survive batch purge.")
        self.assertIsNone(surviving_ticket.batch_id, "batch_id must be SET NULL.")
        self.assertIsNone(surviving_ticket.screening_record_id, "screening_record_id must be SET NULL.")
        self.assertEqual(surviving_ticket.customer_ref, "CUST_SURVIVE_TEST")
        self.assertEqual(surviving_ticket.notes, "Physical inspection confirmed meter bypass wire.")
        self.assertEqual(len(surviving_ticket.checklist), 1)
        self.assertEqual(len(surviving_ticket.evidence), 1)

        # ASSERT 3: Bill extraction SURVIVES
        surviving_bill = self.session.execute(select(BillExtraction).where(BillExtraction.id == bill_id)).scalar_one()
        self.assertIsNotNone(surviving_bill)
        self.assertEqual(surviving_bill.investigation_id, ticket_id)

    def test_bill_extraction_with_typed_dates_and_numerics(self):
        bill = BillExtraction(
            consumer_number="100458921",
            discom="TSSPDCL",
            period_start=date(2024, 4, 1),
            period_end=date(2024, 4, 30),
            bill_date=date(2024, 5, 2),
            previous_reading=Decimal("8450.00"),
            current_reading=Decimal("8720.00"),
            units_consumed=Decimal("270.00"),
            calculated_units=Decimal("270.00"),
            billing_days=30,
            amount_payable=Decimal("1842.00"),
            has_discrepancy=False,
            raw_billing_period="01/04/2024 to 30/04/2024",
            raw_bill_date="02/05/2024",
            raw_previous_reading="8,450",
            raw_current_reading="8,720",
        )
        self.session.add(bill)
        self.session.commit()

        queried = self.session.execute(
            select(BillExtraction).where(BillExtraction.consumer_number == "100458921")
        ).scalar_one()

        self.assertEqual(queried.discom, "TSSPDCL")
        self.assertEqual(queried.bill_date, date(2024, 5, 2))
        self.assertEqual(queried.units_consumed, Decimal("270.00"))
        self.assertEqual(queried.raw_current_reading, "8,720")
        self.assertFalse(queried.has_discrepancy)


if __name__ == "__main__":
    unittest.main()
