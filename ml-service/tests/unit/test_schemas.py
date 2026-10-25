"""Unit tests for TheftGuard AI Pydantic schemas and origin normalization (Stage 3A)."""

from __future__ import annotations

import unittest
import uuid
from datetime import date
from decimal import Decimal

from service.db.schemas import (
    ORIGIN_MAPPING,
    BillExtractionCreate,
    InvestigationCreate,
    InvestigationUpdate,
    ScreeningBatchCreate,
    ScreeningRecordCreate,
    normalize_origin,
)


class SchemaValidationTests(unittest.TestCase):
    def test_origin_mapping_and_normalization(self):
        """Verify frontend and user-facing origin strings normalize to canonical CHECK values."""
        # Screening variants
        self.assertEqual(normalize_origin("screening"), "screening")
        self.assertEqual(normalize_origin("Model screening"), "screening")
        self.assertEqual(normalize_origin("ML Screening"), "screening")
        self.assertEqual(normalize_origin("csv screening"), "screening")

        # Comparison variants
        self.assertEqual(normalize_origin("comparison"), "comparison")
        self.assertEqual(normalize_origin("Consumption comparison"), "comparison")

        # Bill variants
        self.assertEqual(normalize_origin("bill"), "bill")
        self.assertEqual(normalize_origin("Electricity bill"), "bill")
        self.assertEqual(normalize_origin("bill upload"), "bill")
        self.assertEqual(normalize_origin("ocr"), "bill")

        # Invalid origins
        with self.assertRaises(ValueError):
            normalize_origin("unknown_origin")
        with self.assertRaises(ValueError):
            normalize_origin("")

    def test_investigation_create_schema(self):
        """Test investigation creation schema with auto origin normalization."""
        data = InvestigationCreate(
            customer_ref="CUST-100458921",
            origin="Model screening",
            basis="Model score 0.88 exceeded threshold",
            priority="High",
        )
        self.assertEqual(data.origin, "screening")
        self.assertEqual(data.status, "New")
        self.assertEqual(data.priority, "High")

        # Invalid status
        with self.assertRaises(ValueError):
            InvestigationCreate(
                customer_ref="CUST-1",
                basis="Test",
                status="InvalidStatus",
            )

        # Invalid priority
        with self.assertRaises(ValueError):
            InvestigationCreate(
                customer_ref="CUST-1",
                basis="Test",
                priority="Urgent",  # Only Low, Normal, High
            )

    def test_screening_batch_create_validation(self):
        """Verify screening batch threshold validation and row constraints."""
        # Verify default thresholds align with canonical 0.30 and 0.50 values
        default_batch = ScreeningBatchCreate(
            file_name="defaults.csv",
            model_sha256="dummy_sha256_hash",
        )
        self.assertEqual(default_batch.threshold_elevated, 0.30)
        self.assertEqual(default_batch.threshold_review, 0.50)

        # Verify explicitly provided thresholds remain fully supported
        batch_data = ScreeningBatchCreate(
            file_name="test_data.csv",
            model_sha256="dummy_sha256_hash",
            threshold_elevated=0.35,
            threshold_review=0.65,
            records=[
                ScreeningRecordCreate(
                    row_index=0,
                    customer_ref="CUST-001",
                    status="scored",
                    model_score=0.82,
                    predicted_label=1,
                    label_name="Suspicious",
                    review_category="review",
                )
            ],
        )
        self.assertEqual(batch_data.file_name, "test_data.csv")
        self.assertEqual(batch_data.threshold_elevated, 0.35)
        self.assertEqual(batch_data.threshold_review, 0.65)
        self.assertEqual(len(batch_data.records), 1)

        # Inverted thresholds (elevated >= review) must raise ValueError
        with self.assertRaises(ValueError):
            ScreeningBatchCreate(
                file_name="bad.csv",
                model_sha256="dummy_sha256",
                threshold_elevated=0.75,
                threshold_review=0.50,
            )

    def test_screening_record_score_range_validation(self):
        """Verify model_score enforces [0.0, 1.0]."""
        # Valid scores
        rec0 = ScreeningRecordCreate(row_index=0, customer_ref="CUST-1", model_score=0.0)
        rec1 = ScreeningRecordCreate(row_index=1, customer_ref="CUST-2", model_score=1.0)
        self.assertEqual(rec0.model_score, 0.0)
        self.assertEqual(rec1.model_score, 1.0)

        # Invalid scores
        with self.assertRaises(ValueError):
            ScreeningRecordCreate(row_index=2, customer_ref="CUST-3", model_score=1.01)
        with self.assertRaises(ValueError):
            ScreeningRecordCreate(row_index=3, customer_ref="CUST-4", model_score=-0.05)

    def test_bill_extraction_create_validation(self):
        """Verify bill extraction schema rules, calculations, and exclusion of raw_ocr_text."""
        bill = BillExtractionCreate(
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
        self.assertEqual(bill.calculated_units, Decimal("270.00"))
        self.assertFalse(hasattr(bill, "raw_ocr_text"))

        # Inverted date range (period_end < period_start)
        with self.assertRaises(ValueError):
            BillExtractionCreate(
                consumer_number="100458921",
                period_start=date(2026, 5, 1),
                period_end=date(2026, 4, 1),
            )

        # Negative units or readings
        with self.assertRaises(ValueError):
            BillExtractionCreate(
                consumer_number="100458921",
                units_consumed=Decimal("-10.00"),
            )


if __name__ == "__main__":
    unittest.main()
