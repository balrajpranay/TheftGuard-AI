"""SQLAlchemy ORM models for TheftGuard AI Phase 2 (Revised).

Normalized schema for:
- Screening batches (file and batch summary metrics, threshold snapshots)
- Screening records (per-customer ML prediction results, exact 13 features)
- Investigations (field audit follow-up tickets, checklists, and evidence)
- Bill extractions (typed dates/numerics with preserved raw OCR strings)

Security & Data Minimization:
- No sensitive consumer personal identifiable information (PII) is stored.
- Only technical references (customer_ref, consumer_number) are recorded.
- created_by uses UUID type, mapped for future Supabase auth.users(id) / auth.uid().
- Model scores are documented as uncalibrated decision-support scores, not proof of theft.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

# Cross-dialect JSON type: uses native JSONB in PostgreSQL, standard JSON in SQLite
JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
# Cross-dialect UUID type: uses native UUID in PostgreSQL, GUID/String handling in SQLite
UUID_TYPE = Uuid(as_uuid=True)


class Base(DeclarativeBase):
    """Base declarative class for all TheftGuard AI persistence models."""
    pass


class ScreeningBatch(Base):
    """A collection of customer records screened together in a single operation."""

    __tablename__ = "screening_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID_TYPE,
        primary_key=True,
        default=uuid.uuid4,
        doc="Unique primary key identifier for the screening batch.",
    )
    file_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Original uploaded file name (e.g. 'theftguard_test_100.csv').",
    )
    file_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        index=True,
        doc="SHA-256 hash of uploaded CSV content to detect duplicate runs.",
    )
    total_rows: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Total number of customer rows in the uploaded batch.",
    )
    scored_rows: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Number of rows successfully processed and scored by the model.",
    )
    rejected_rows: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Number of rows rejected due to missing columns or invalid features.",
    )
    warning_rows: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Number of scored rows with validation warnings (e.g. W1 out of bounds).",
    )
    model_version: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="v1.0.0",
        doc="Model version string (e.g. 'v1.0.0').",
    )
    model_sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        doc="Verified SHA-256 hash of the Random Forest model pipeline file.",
    )
    score_note: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        default="Uncalibrated; not a probability",
        doc="Mandatory advisory note clarifying that model score is uncalibrated.",
    )
    threshold_elevated: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.40,
        doc="Elevated review threshold active at the time of screening.",
    )
    threshold_review: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.70,
        doc="Review Recommended threshold active at the time of screening.",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="completed",
        doc="Batch status: 'processing', 'completed', or 'failed'.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID_TYPE,
        nullable=True,
        doc="User UUID who created the batch (maps to future Supabase auth.users.id).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when the batch was created.",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when the batch record was last updated.",
    )

    # Relationships
    records: Mapped[List[ScreeningRecord]] = relationship(
        "ScreeningRecord",
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="ScreeningRecord.row_index",
    )
    investigations: Mapped[List[Investigation]] = relationship(
        "Investigation",
        back_populates="batch",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'completed', 'failed')",
            name="ck_screening_batches_status",
        ),
        CheckConstraint(
            "threshold_elevated >= 0.0 AND threshold_elevated < threshold_review AND threshold_review <= 1.0",
            name="ck_screening_batches_thresholds",
        ),
        CheckConstraint(
            "total_rows >= 0 AND scored_rows >= 0 AND rejected_rows >= 0 AND warning_rows >= 0",
            name="ck_screening_batches_counts_non_negative",
        ),
        Index("ix_screening_batches_created_at", "created_at"),
    )


class ScreeningRecord(Base):
    """An individual customer row result evaluated within a screening batch."""

    __tablename__ = "screening_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID_TYPE,
        primary_key=True,
        default=uuid.uuid4,
        doc="Unique primary key identifier for the screening record.",
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID_TYPE,
        ForeignKey("screening_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Foreign key to the parent screening batch. Cascade deletes with batch.",
    )
    row_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="0-based row position within the original uploaded CSV file.",
    )
    customer_ref: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        doc="Customer reference identifier (e.g. 'CUST_100458921'). No personal PII.",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="scored",
        doc="Row evaluation status: 'scored', 'rejected', or 'unscored'.",
    )
    model_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        index=True,
        doc="Raw uncalibrated model score (0.0 to 1.0). Null if row was rejected.",
    )
    predicted_label: Mapped[Optional[int]] = mapped_column(
        SmallInteger,
        nullable=True,
        doc="Model class: 0 for Normal, 1 for Suspicious. Null if rejected.",
    )
    label_name: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="Descriptive label: 'Normal' or 'Suspicious'. Null if rejected.",
    )
    review_category: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="unscored",
        index=True,
        doc="Review band: 'normal', 'elevated', 'review', 'rejected', or 'unscored'.",
    )
    features: Mapped[Dict[str, Any]] = mapped_column(
        JSON_TYPE,
        nullable=False,
        default=dict,
        doc="JSON object containing the 13 model features with exact names.",
    )
    warnings: Mapped[List[Any]] = mapped_column(
        JSON_TYPE,
        nullable=False,
        default=list,
        doc="Array of warning objects or strings emitted during validation.",
    )
    errors: Mapped[List[Any]] = mapped_column(
        JSON_TYPE,
        nullable=False,
        default=list,
        doc="Array of validation error objects if the row was rejected.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when this row was recorded.",
    )

    # Relationships
    batch: Mapped[ScreeningBatch] = relationship(
        "ScreeningBatch",
        back_populates="records",
    )
    investigations: Mapped[List[Investigation]] = relationship(
        "Investigation",
        back_populates="screening_record",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('scored', 'rejected', 'unscored')",
            name="ck_screening_records_status",
        ),
        CheckConstraint(
            "model_score IS NULL OR (model_score >= 0.0 AND model_score <= 1.0)",
            name="ck_screening_records_score_range",
        ),
        CheckConstraint(
            "predicted_label IS NULL OR predicted_label IN (0, 1)",
            name="ck_screening_records_predicted_label",
        ),
        CheckConstraint(
            "label_name IS NULL OR label_name IN ('Normal', 'Suspicious')",
            name="ck_screening_records_label_name",
        ),
        CheckConstraint(
            "review_category IN ('normal', 'elevated', 'review', 'rejected', 'unscored')",
            name="ck_screening_records_category",
        ),
        Index("ix_screening_records_batch_score", "batch_id", "model_score"),
        Index("ix_screening_records_batch_category", "batch_id", "review_category"),
    )


class Investigation(Base):
    """An investigation ticket tracking on-site inspection and audit follow-up."""

    __tablename__ = "investigations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID_TYPE,
        primary_key=True,
        default=uuid.uuid4,
        doc="Unique internal primary key identifier.",
    )
    ticket_code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
        doc="External ticket code (e.g. 'inv-171350...' or 'INV-2026-001').",
    )
    customer_ref: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        doc="Customer reference or consumer number under investigation.",
    )
    origin: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="screening",
        doc="Trigger origin: 'screening', 'comparison', or 'bill'.",
    )
    basis: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        doc="Summary explanation for opening the ticket (e.g. 'Model score: 0.84').",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="New",
        index=True,
        doc="Workflow status: 'New', 'Scheduled', 'In inspection', 'Evidence review', or 'Closed'.",
    )
    priority: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="Normal",
        index=True,
        doc="Ticket priority: 'Low', 'Normal', or 'High'.",
    )
    assignee: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
        doc="Free text inspector name, team identifier, or utility division.",
    )
    notes: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        doc="Inspector field observations and notes.",
    )
    outcome: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        doc="Final finding when closed.",
    )
    checklist: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON_TYPE,
        nullable=False,
        default=list,
        doc="Array of checklist objects: [{'label': str, 'done': bool}].",
    )
    evidence: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON_TYPE,
        nullable=False,
        default=list,
        doc="Array of evidence file metadata: [{'name': str, 'size': int, 'type': str}].",
    )
    screening_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID_TYPE,
        ForeignKey("screening_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Optional foreign key to triggering screening record. Preserved on record purge.",
    )
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID_TYPE,
        ForeignKey("screening_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Optional foreign key to screening batch. Preserved on batch purge.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID_TYPE,
        nullable=True,
        doc="User UUID who opened the ticket (maps to future Supabase auth.users.id).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when the ticket was opened.",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when the ticket was last updated.",
    )

    # Relationships
    screening_record: Mapped[Optional[ScreeningRecord]] = relationship(
        "ScreeningRecord",
        back_populates="investigations",
    )
    batch: Mapped[Optional[ScreeningBatch]] = relationship(
        "ScreeningBatch",
        back_populates="investigations",
    )
    bill_extractions: Mapped[List[BillExtraction]] = relationship(
        "BillExtraction",
        back_populates="investigation",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('New', 'Scheduled', 'In inspection', 'Evidence review', 'Closed')",
            name="ck_investigations_status",
        ),
        CheckConstraint(
            "priority IN ('Low', 'Normal', 'High')",
            name="ck_investigations_priority",
        ),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('Irregularity verified on site', 'No irregularity found', 'Inconclusive, more information needed')",
            name="ck_investigations_outcome",
        ),
        CheckConstraint(
            "origin IN ('screening', 'comparison', 'bill')",
            name="ck_investigations_origin",
        ),
        Index("ix_investigations_status_priority", "status", "priority"),
        Index("ix_investigations_created_at", "created_at"),
        # Scoped duplicate prevention:
        # 1. A single screening record row can only ever be attached to ONE investigation
        Index(
            "uq_investigations_screening_record",
            "screening_record_id",
            unique=True,
            postgresql_where=text("screening_record_id IS NOT NULL"),
            sqlite_where=text("screening_record_id IS NOT NULL"),
        ),
        # 2. Prevents duplicate active tickets for the same customer within the same batch run
        Index(
            "uq_investigations_active_customer_batch",
            "customer_ref",
            "batch_id",
            unique=True,
            postgresql_where=text("batch_id IS NOT NULL AND status != 'Closed'"),
            sqlite_where=text("batch_id IS NOT NULL AND status != 'Closed'"),
        ),
    )


class BillExtraction(Base):
    """OCR-extracted electricity bill data and reading discrepancy analysis.

    Uses typed PostgreSQL DATE and NUMERIC columns for structured analysis,
    while retaining original raw OCR strings for complete audit verification.
    """

    __tablename__ = "bill_extractions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID_TYPE,
        primary_key=True,
        default=uuid.uuid4,
        doc="Unique identifier for the bill extraction record.",
    )
    consumer_number: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        doc="Sanitized electricity consumer number (USCNO).",
    )
    discom: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="Electricity distribution company (e.g. 'TSSPDCL', 'TGSPDCL').",
    )

    # Typed temporal attributes
    period_start: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        doc="Parsed start date of the billing cycle.",
    )
    period_end: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        doc="Parsed end date of the billing cycle.",
    )
    bill_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        doc="Parsed bill issue date.",
    )

    # Typed numeric attributes
    previous_reading: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        doc="Parsed previous meter reading in kWh.",
    )
    current_reading: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        doc="Parsed current meter reading in kWh.",
    )
    units_consumed: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        doc="Billed units consumed in kWh.",
    )
    calculated_units: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        doc="Arithmetic difference (current_reading - previous_reading).",
    )
    billing_days: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        doc="Number of billing days in the period.",
    )
    amount_payable: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        doc="Total amount payable in INR (₹).",
    )
    has_discrepancy: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="True if (current_reading - previous_reading) != units_consumed.",
    )
    discrepancy_warning: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        doc="Warning explanation if a discrepancy was detected.",
    )

    # Preserved raw OCR strings for audit verification
    raw_billing_period: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        doc="Raw OCR string for billing period (e.g. '01/04/2024 to 30/04/2024').",
    )
    raw_bill_date: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="Raw OCR string for bill date (e.g. '02/05/2024').",
    )
    raw_previous_reading: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="Raw OCR string for previous reading (e.g. '8,450').",
    )
    raw_current_reading: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="Raw OCR string for current reading (e.g. '8,720').",
    )

    investigation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID_TYPE,
        ForeignKey("investigations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Optional link to an investigation ticket spawned from this bill.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when the extraction was saved.",
    )

    # Relationships
    investigation: Mapped[Optional[Investigation]] = relationship(
        "Investigation",
        back_populates="bill_extractions",
    )

    __table_args__ = (
        CheckConstraint(
            "units_consumed IS NULL OR units_consumed >= 0",
            name="ck_bill_extractions_units_consumed",
        ),
        CheckConstraint(
            "amount_payable IS NULL OR amount_payable >= 0",
            name="ck_bill_extractions_amount_payable",
        ),
        CheckConstraint(
            "billing_days IS NULL OR billing_days > 0",
            name="ck_bill_extractions_billing_days",
        ),
        CheckConstraint(
            "previous_reading IS NULL OR previous_reading >= 0",
            name="ck_bill_extractions_prev_reading",
        ),
        CheckConstraint(
            "current_reading IS NULL OR current_reading >= 0",
            name="ck_bill_extractions_curr_reading",
        ),
        CheckConstraint(
            "period_end IS NULL OR period_start IS NULL OR period_end >= period_start",
            name="ck_bill_extractions_period_range",
        ),
        Index("ix_bill_extractions_has_discrepancy", "has_discrepancy"),
        Index("ix_bill_extractions_bill_date", "bill_date"),
    )
