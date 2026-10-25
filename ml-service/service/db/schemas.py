"""TheftGuard AI — Database Validation Schemas (Pydantic v2).

Pydantic models for request validation and response serialization corresponding
to the Phase 2 PostgreSQL schema and SQLAlchemy models:
- Screening batches and individual screening records
- Investigation audit tickets (with origin normalization)
- Electricity bill extraction readings (with raw reading strings, excluding PII)
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ==============================================================================
# Origin Mapping & Normalization
# ==============================================================================
# Maps frontend display/source strings to database canonical CHECK constraint values:
# CHECK (origin IN ('screening', 'comparison', 'bill'))
ORIGIN_MAPPING: Dict[str, str] = {
    "screening": "screening",
    "model screening": "screening",
    "ml screening": "screening",
    "csv screening": "screening",
    "comparison": "comparison",
    "consumption comparison": "comparison",
    "bill": "bill",
    "electricity bill": "bill",
    "bill upload": "bill",
    "ocr": "bill",
}


def normalize_origin(val: str) -> str:
    """Normalize user-facing or frontend origin strings to database canonical enum.

    Raises ValueError if origin cannot be mapped to 'screening', 'comparison', or 'bill'.
    """
    clean = (val or "").strip().lower()
    if clean in ORIGIN_MAPPING:
        return ORIGIN_MAPPING[clean]
    valid_keys = sorted(set(ORIGIN_MAPPING.keys()))
    raise ValueError(
        f"Invalid origin '{val}'. Must map to one of: 'screening', 'comparison', 'bill'. "
        f"Recognized aliases: {valid_keys}"
    )


# ==============================================================================
# 1. Screening Records Schemas
# ==============================================================================

class ScreeningRecordCreate(BaseModel):
    """Schema for persisting an individual customer scoring record."""

    model_config = ConfigDict(extra="ignore")

    row_index: int = Field(ge=0, description="0-based row index from original CSV.")
    customer_ref: str = Field(min_length=1, max_length=128, description="Customer reference identifier.")
    status: Literal["scored", "rejected", "unscored"] = Field(
        default="scored",
        description="Status of evaluation.",
    )
    model_score: Optional[float] = Field(
        default=None,
        description="Uncalibrated decision-support model score (0.0 to 1.0).",
    )
    predicted_label: Optional[int] = Field(
        default=None,
        description="Model prediction class: 0 for Normal, 1 for Suspicious.",
    )
    label_name: Optional[Literal["Normal", "Suspicious"]] = Field(
        default=None,
        description="Human-readable label name.",
    )
    review_category: Literal["normal", "elevated", "review", "rejected", "unscored"] = Field(
        default="unscored",
        description="Review band category.",
    )
    features: Dict[str, Any] = Field(
        default_factory=dict,
        description="JSON dictionary of model features.",
    )
    warnings: List[Any] = Field(
        default_factory=list,
        description="Validation warnings emitted for this row.",
    )
    errors: List[Any] = Field(
        default_factory=list,
        description="Validation errors if row was rejected.",
    )

    @field_validator("model_score")
    @classmethod
    def validate_model_score(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError(f"model_score must be between 0.0 and 1.0 inclusive, got {v}")
        return v

    @field_validator("predicted_label")
    @classmethod
    def validate_predicted_label(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in (0, 1):
            raise ValueError(f"predicted_label must be 0 or 1, got {v}")
        return v


class ScreeningRecordResponse(BaseModel):
    """Schema for returning a persisted screening record."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    batch_id: uuid.UUID
    row_index: int
    customer_ref: str
    status: str
    model_score: Optional[float] = None
    predicted_label: Optional[int] = None
    label_name: Optional[str] = None
    review_category: str
    features: Dict[str, Any]
    warnings: List[Any]
    errors: List[Any]
    created_at: datetime


# ==============================================================================
# 2. Screening Batches Schemas
# ==============================================================================

class ScreeningBatchCreate(BaseModel):
    """Schema for creating a screening batch with its records atomically."""

    model_config = ConfigDict(extra="ignore")

    file_name: str = Field(min_length=1, max_length=255, description="Name of the uploaded CSV file.")
    file_hash: Optional[str] = Field(default=None, max_length=64, description="SHA-256 hash of CSV content.")
    total_rows: int = Field(default=0, ge=0, description="Total rows in the batch.")
    scored_rows: int = Field(default=0, ge=0, description="Successfully scored rows.")
    rejected_rows: int = Field(default=0, ge=0, description="Rejected rows.")
    warning_rows: int = Field(default=0, ge=0, description="Rows with warnings.")
    model_version: str = Field(default="v1.0.0", max_length=32, description="Model pipeline version.")
    model_sha256: str = Field(min_length=1, max_length=64, description="Verified model pipeline hash.")
    score_note: str = Field(
        default="Uncalibrated; not a probability",
        max_length=128,
        description="Auditing note on score nature.",
    )
    threshold_elevated: float = Field(default=0.30, ge=0.0, le=1.0)
    threshold_review: float = Field(default=0.50, ge=0.0, le=1.0)
    status: Literal["processing", "completed", "failed"] = Field(default="completed")
    created_by: Optional[uuid.UUID] = Field(default=None)
    records: List[ScreeningRecordCreate] = Field(
        default_factory=list,
        description="Individual scored records to persist atomically with the batch.",
    )

    @model_validator(mode="after")
    def validate_thresholds(self) -> ScreeningBatchCreate:
        if self.threshold_elevated >= self.threshold_review:
            raise ValueError(
                f"threshold_elevated ({self.threshold_elevated}) must be strictly less than "
                f"threshold_review ({self.threshold_review})"
            )
        return self


class ScreeningBatchSummaryResponse(BaseModel):
    """Schema for returning batch metadata without all individual records."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_name: str
    file_hash: Optional[str] = None
    total_rows: int
    scored_rows: int
    rejected_rows: int
    warning_rows: int
    model_version: str
    model_sha256: str
    score_note: str
    threshold_elevated: float
    threshold_review: float
    status: str
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class ScreeningBatchDetailResponse(ScreeningBatchSummaryResponse):
    """Schema for returning full batch metadata along with records."""

    records: List[ScreeningRecordResponse] = Field(default_factory=list)


# ==============================================================================
# 3. Investigation Schemas
# ==============================================================================

class InvestigationCreate(BaseModel):
    """Schema for opening a new field investigation ticket."""

    model_config = ConfigDict(extra="ignore")

    ticket_code: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Unique ticket code. Auto-generated if omitted.",
    )
    customer_ref: str = Field(min_length=1, max_length=128, description="Target customer reference.")
    origin: str = Field(
        default="screening",
        description="Origin source (normalized automatically: 'screening', 'comparison', 'bill').",
    )
    basis: str = Field(min_length=1, description="Reason/evidence for opening the ticket.")
    status: Literal["New", "Scheduled", "In inspection", "Evidence review", "Closed"] = Field(
        default="New",
    )
    priority: Literal["Low", "Normal", "High"] = Field(default="Normal")
    assignee: Optional[str] = Field(default=None, max_length=128)
    notes: str = Field(default="")
    outcome: Optional[Literal[
        "Irregularity verified on site",
        "No irregularity found",
        "Inconclusive, more information needed",
    ]] = Field(default=None)
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    screening_record_id: Optional[uuid.UUID] = Field(default=None)
    batch_id: Optional[uuid.UUID] = Field(default=None)
    created_by: Optional[uuid.UUID] = Field(default=None)

    @field_validator("origin")
    @classmethod
    def validate_and_normalize_origin(cls, v: str) -> str:
        return normalize_origin(v)


class InvestigationUpdate(BaseModel):
    """Schema for partially updating an existing investigation ticket."""

    model_config = ConfigDict(extra="ignore")

    status: Optional[Literal["New", "Scheduled", "In inspection", "Evidence review", "Closed"]] = None
    priority: Optional[Literal["Low", "Normal", "High"]] = None
    assignee: Optional[str] = Field(default=None, max_length=128)
    notes: Optional[str] = None
    outcome: Optional[Literal[
        "Irregularity verified on site",
        "No irregularity found",
        "Inconclusive, more information needed",
    ]] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    evidence: Optional[List[Dict[str, Any]]] = None


class InvestigationResponse(BaseModel):
    """Schema for returning an investigation ticket."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_code: str
    customer_ref: str
    origin: str
    basis: str
    status: str
    priority: str
    assignee: Optional[str] = None
    notes: str
    outcome: Optional[str] = None
    checklist: List[Dict[str, Any]]
    evidence: List[Dict[str, Any]]
    screening_record_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ==============================================================================
# 4. Bill Extraction Schemas
# ==============================================================================

class BillExtractionCreate(BaseModel):
    """Schema for persisting electricity bill OCR readings and discrepancy analysis.

    Notice: raw_ocr_text is explicitly excluded to preserve data minimization.
    """

    model_config = ConfigDict(extra="ignore")

    consumer_number: str = Field(min_length=1, max_length=64, description="Sanitized USCNO / consumer reference.")
    discom: Optional[str] = Field(default=None, max_length=32, description="Electricity distribution company.")
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    bill_date: Optional[date] = None
    previous_reading: Optional[Decimal] = Field(default=None, ge=0)
    current_reading: Optional[Decimal] = Field(default=None, ge=0)
    units_consumed: Optional[Decimal] = Field(default=None, ge=0)
    calculated_units: Optional[Decimal] = None
    billing_days: Optional[int] = Field(default=None, gt=0)
    amount_payable: Optional[Decimal] = Field(default=None, ge=0)
    has_discrepancy: bool = False
    discrepancy_warning: Optional[str] = None
    raw_billing_period: Optional[str] = Field(default=None, max_length=64)
    raw_bill_date: Optional[str] = Field(default=None, max_length=32)
    raw_previous_reading: Optional[str] = Field(default=None, max_length=32)
    raw_current_reading: Optional[str] = Field(default=None, max_length=32)
    investigation_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def validate_period_range(self) -> BillExtractionCreate:
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValueError(
                f"period_end ({self.period_end}) cannot be earlier than period_start ({self.period_start})"
            )
        # Auto-compute calculated_units if both readings exist and calculated_units not passed
        if self.current_reading is not None and self.previous_reading is not None and self.calculated_units is None:
            self.calculated_units = self.current_reading - self.previous_reading
        return self


class BillExtractionResponse(BaseModel):
    """Schema for returning a persisted bill extraction record."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    consumer_number: str
    discom: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    bill_date: Optional[date] = None
    previous_reading: Optional[Decimal] = None
    current_reading: Optional[Decimal] = None
    units_consumed: Optional[Decimal] = None
    calculated_units: Optional[Decimal] = None
    billing_days: Optional[int] = None
    amount_payable: Optional[Decimal] = None
    has_discrepancy: bool
    discrepancy_warning: Optional[str] = None
    raw_billing_period: Optional[str] = None
    raw_bill_date: Optional[str] = None
    raw_previous_reading: Optional[str] = None
    raw_current_reading: Optional[str] = None
    investigation_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
