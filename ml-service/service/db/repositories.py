"""TheftGuard AI — Database Repositories.

Data access layer implementing transactional operations using SQLAlchemy 2.x sessions:
- BatchRepository: Atomic creation and retrieval of screening batches & records
- InvestigationRepository: Investigation ticket CRUD with scoped duplicate checks
- BillExtractionRepository: OCR extraction metadata persistence and retrieval

All operations strictly observe database constraints, foreign keys, cascade/set-null
rules, and origin mapping. No PII is stored.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import BillExtraction, Investigation, ScreeningBatch, ScreeningRecord
from .schemas import (
    BillExtractionCreate,
    InvestigationCreate,
    InvestigationUpdate,
    ScreeningBatchCreate,
    normalize_origin,
)


class RepositoryError(Exception):
    """Base exception for database repository errors."""
    pass


class DuplicateInvestigationError(RepositoryError):
    """Raised when an investigation violates a scoped uniqueness constraint."""
    pass


class BatchRepository:
    """Repository managing screening batches and their associated records."""

    @staticmethod
    def create_batch(session: Session, data: ScreeningBatchCreate) -> ScreeningBatch:
        """Create a screening batch and all its records atomically in a single transaction.

        If any record fails or a constraint is violated, the entire operation is rolled back.
        """
        try:
            # Calculate counts if records provided
            total = data.total_rows or len(data.records)
            scored = data.scored_rows or sum(1 for r in data.records if r.status == "scored")
            rejected = data.rejected_rows or sum(1 for r in data.records if r.status == "rejected")
            warning = data.warning_rows or sum(1 for r in data.records if r.warnings)

            batch = ScreeningBatch(
                file_name=data.file_name,
                file_hash=data.file_hash,
                total_rows=total,
                scored_rows=scored,
                rejected_rows=rejected,
                warning_rows=warning,
                model_version=data.model_version,
                model_sha256=data.model_sha256,
                score_note=data.score_note,
                threshold_elevated=data.threshold_elevated,
                threshold_review=data.threshold_review,
                status=data.status,
                created_by=data.created_by,
            )
            session.add(batch)
            session.flush()  # Populates batch.id

            # Add child records atomically
            for rec in data.records:
                record = ScreeningRecord(
                    batch_id=batch.id,
                    row_index=rec.row_index,
                    customer_ref=rec.customer_ref,
                    status=rec.status,
                    model_score=rec.model_score,
                    predicted_label=rec.predicted_label,
                    label_name=rec.label_name,
                    review_category=rec.review_category,
                    features=rec.features,
                    warnings=rec.warnings,
                    errors=rec.errors,
                )
                session.add(record)

            session.commit()
            session.refresh(batch)
            return batch

        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to create batch atomically: {exc}") from exc

    @staticmethod
    def list_batches(session: Session, limit: int = 50, offset: int = 0) -> List[ScreeningBatch]:
        """List historical screening batches ordered by most recent."""
        stmt = (
            select(ScreeningBatch)
            .order_by(ScreeningBatch.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_batch(session: Session, batch_id: uuid.UUID) -> Optional[ScreeningBatch]:
        """Fetch a single screening batch by ID without loading all child records."""
        return session.get(ScreeningBatch, batch_id)

    @staticmethod
    def get_batch_with_records(
        session: Session,
        batch_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> Optional[Tuple[ScreeningBatch, List[ScreeningRecord], int]]:
        """Fetch a batch along with paginated child records and total record count."""
        batch = session.get(ScreeningBatch, batch_id)
        if not batch:
            return None

        # Count total records in batch
        count_stmt = select(func.count(ScreeningRecord.id)).where(ScreeningRecord.batch_id == batch_id)
        total_records = session.scalar(count_stmt) or 0

        # Fetch page of records
        records_stmt = (
            select(ScreeningRecord)
            .where(ScreeningRecord.batch_id == batch_id)
            .order_by(ScreeningRecord.row_index.asc())
            .limit(limit)
            .offset(offset)
        )
        records = list(session.scalars(records_stmt).all())
        return batch, records, total_records

    @staticmethod
    def delete_batch(session: Session, batch_id: uuid.UUID) -> bool:
        """Delete a screening batch.

        Screening records cascade delete automatically.
        Associated investigations survive with batch_id and screening_record_id SET NULL.
        """
        batch = session.get(ScreeningBatch, batch_id)
        if not batch:
            return False
        try:
            session.delete(batch)
            session.commit()
            return True
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to delete batch {batch_id}: {exc}") from exc


class InvestigationRepository:
    """Repository managing field investigation audit tickets."""

    @staticmethod
    def create_investigation(session: Session, data: InvestigationCreate) -> Investigation:
        """Create a new investigation ticket.

        Enforces scoped unique checks:
        1. uq_investigations_screening_record: a screening record cannot be re-attached to a second ticket.
        2. uq_investigations_active_customer_batch: customer cannot have duplicate active tickets in same batch.
        """
        # Ensure unique ticket code
        ticket_code = data.ticket_code
        if not ticket_code:
            now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
            ticket_code = f"INV-{now_str}-{uuid.uuid4().hex[:6].upper()}"

        canonical_origin = normalize_origin(data.origin)

        investigation = Investigation(
            ticket_code=ticket_code,
            customer_ref=data.customer_ref,
            origin=canonical_origin,
            basis=data.basis,
            status=data.status,
            priority=data.priority,
            assignee=data.assignee,
            notes=data.notes,
            outcome=data.outcome,
            checklist=data.checklist,
            evidence=data.evidence,
            screening_record_id=data.screening_record_id,
            batch_id=data.batch_id,
            created_by=data.created_by,
        )

        try:
            session.add(investigation)
            session.commit()
            session.refresh(investigation)
            return investigation

        except IntegrityError as exc:
            session.rollback()
            orig = getattr(exc, "orig", exc)
            diag = getattr(orig, "diag", None)
            constraint_name = (getattr(diag, "constraint_name", None) or "").lower()
            detail = (getattr(diag, "message_detail", None) or "").lower()
            orig_msg = str(orig).lower()

            # 1. Scoped uniqueness: one ticket per screening record
            if (
                "uq_investigations_screening_record" in constraint_name
                or "uq_investigations_screening_record" in orig_msg
                or "investigations.screening_record_id" in orig_msg
                or "key (screening_record_id)" in detail
            ):
                raise DuplicateInvestigationError(
                    f"Screening record {data.screening_record_id} is already attached to an existing investigation."
                ) from exc

            # 2. Scoped uniqueness: active ticket for customer in same batch
            if (
                "uq_investigations_active_customer_batch" in constraint_name
                or "uq_investigations_active_customer_batch" in orig_msg
                or ("investigations.customer_ref" in orig_msg and "investigations.batch_id" in orig_msg)
                or "key (customer_ref, batch_id)" in detail
            ):
                raise DuplicateInvestigationError(
                    f"An active investigation already exists for customer '{data.customer_ref}' in batch '{data.batch_id}'."
                ) from exc

            # 3. Explicit unique constraint on ticket_code
            if (
                "ticket_code" in constraint_name
                or "investigations.ticket_code" in orig_msg
                or "key (ticket_code)" in detail
                or ("unique constraint" in orig_msg and "ticket_code" in orig_msg)
            ):
                raise DuplicateInvestigationError(
                    f"Ticket code '{ticket_code}' already exists."
                ) from exc

            # Generic sanitized integrity error for foreign keys, check constraints, etc.
            raise RepositoryError("Database integrity constraint violation during investigation creation.") from exc
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to create investigation: {exc}") from exc

    @staticmethod
    def list_investigations(
        session: Session,
        status: Optional[str] = None,
        customer_ref: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Investigation]:
        """List investigation tickets ordered by creation time descending."""
        stmt = select(Investigation).order_by(Investigation.created_at.desc())
        if status and status != "All":
            stmt = stmt.where(Investigation.status == status)
        if customer_ref:
            stmt = stmt.where(Investigation.customer_ref == customer_ref)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_investigation(session: Session, investigation_id: uuid.UUID) -> Optional[Investigation]:
        """Fetch investigation by primary key UUID."""
        return session.get(Investigation, investigation_id)

    @staticmethod
    def get_investigation_by_ticket_code(session: Session, ticket_code: str) -> Optional[Investigation]:
        """Fetch investigation by unique ticket code."""
        stmt = select(Investigation).where(Investigation.ticket_code == ticket_code)
        return session.scalars(stmt).first()

    @staticmethod
    def update_investigation(
        session: Session,
        investigation_id: uuid.UUID,
        patch: InvestigationUpdate,
    ) -> Optional[Investigation]:
        """Partially update mutable fields on an investigation ticket."""
        investigation = session.get(Investigation, investigation_id)
        if not investigation:
            return None

        update_data = patch.model_dump(exclude_unset=True)
        if not update_data:
            return investigation

        try:
            for key, val in update_data.items():
                if hasattr(investigation, key):
                    setattr(investigation, key, val)

            investigation.updated_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(investigation)
            return investigation

        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to update investigation {investigation_id}: {exc}") from exc

    @staticmethod
    def delete_investigation(session: Session, investigation_id: uuid.UUID) -> bool:
        """Delete an investigation ticket.

        Any linked bill_extractions survive with investigation_id SET NULL.
        """
        investigation = session.get(Investigation, investigation_id)
        if not investigation:
            return False
        try:
            session.delete(investigation)
            session.commit()
            return True
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to delete investigation {investigation_id}: {exc}") from exc


class BillExtractionRepository:
    """Repository managing OCR-extracted electricity bill records."""

    @staticmethod
    def create_extraction(session: Session, data: BillExtractionCreate) -> BillExtraction:
        """Persist a confirmed bill extraction record.

        Notice: raw_ocr_text is NOT stored, strictly preserving data minimization.
        """
        extraction = BillExtraction(
            consumer_number=data.consumer_number,
            discom=data.discom,
            period_start=data.period_start,
            period_end=data.period_end,
            bill_date=data.bill_date,
            previous_reading=data.previous_reading,
            current_reading=data.current_reading,
            units_consumed=data.units_consumed,
            calculated_units=data.calculated_units,
            billing_days=data.billing_days,
            amount_payable=data.amount_payable,
            has_discrepancy=data.has_discrepancy,
            discrepancy_warning=data.discrepancy_warning,
            raw_billing_period=data.raw_billing_period,
            raw_bill_date=data.raw_bill_date,
            raw_previous_reading=data.raw_previous_reading,
            raw_current_reading=data.raw_current_reading,
            investigation_id=data.investigation_id,
        )

        try:
            session.add(extraction)
            session.commit()
            session.refresh(extraction)
            return extraction
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to persist bill extraction: {exc}") from exc

    @staticmethod
    def list_extractions(
        session: Session,
        consumer_number: Optional[str] = None,
        investigation_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[BillExtraction]:
        """List bill extractions optionally filtered by consumer number or investigation."""
        stmt = select(BillExtraction).order_by(BillExtraction.created_at.desc())
        if consumer_number:
            stmt = stmt.where(BillExtraction.consumer_number == consumer_number)
        if investigation_id:
            stmt = stmt.where(BillExtraction.investigation_id == investigation_id)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_extraction(session: Session, extraction_id: uuid.UUID) -> Optional[BillExtraction]:
        """Fetch bill extraction by primary key."""
        return session.get(BillExtraction, extraction_id)
