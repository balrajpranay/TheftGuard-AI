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


class ResourceNotFoundError(RepositoryError):
    """Raised when a referenced entity is not found or not owned by the authenticated user."""
    pass


class BatchRepository:
    """Repository managing screening batches and their associated records."""

    @staticmethod
    def create_batch(
        session: Session,
        data: ScreeningBatchCreate,
        user_id: Optional[uuid.UUID] = None,
    ) -> ScreeningBatch:
        """Create a screening batch and all its records atomically in a single transaction.

        If any record fails or a constraint is violated, the entire operation is rolled back.
        If user_id is provided, server-side ownership strictly sets created_by to user_id.
        """
        try:
            # Calculate counts if records provided
            total = data.total_rows or len(data.records)
            scored = data.scored_rows or sum(1 for r in data.records if r.status == "scored")
            rejected = data.rejected_rows or sum(1 for r in data.records if r.status == "rejected")
            warning = data.warning_rows or sum(1 for r in data.records if r.warnings)

            owner_id = user_id if user_id is not None else data.created_by

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
                created_by=owner_id,
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
    def list_batches(
        session: Session,
        user_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ScreeningBatch]:
        """List historical screening batches ordered by most recent.
        
        When user_id is supplied, strictly limits results to batches owned by that user.
        Legacy unowned records (created_by IS NULL) are not returned to user queries.
        """
        stmt = select(ScreeningBatch).order_by(ScreeningBatch.created_at.desc())
        if user_id is not None:
            stmt = stmt.where(ScreeningBatch.created_by == user_id)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_batch(
        session: Session,
        batch_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[ScreeningBatch]:
        """Fetch a single screening batch by ID without loading all child records.
        
        Returns None if not found or if not owned by user_id.
        """
        batch = session.get(ScreeningBatch, batch_id)
        if not batch:
            return None
        if user_id is not None and batch.created_by != user_id:
            return None
        return batch

    @staticmethod
    def get_batch_with_records(
        session: Session,
        batch_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Optional[Tuple[ScreeningBatch, List[ScreeningRecord], int]]:
        """Fetch a batch along with paginated child records and total record count.
        
        Returns None if not found or if not owned by user_id.
        """
        batch = session.get(ScreeningBatch, batch_id)
        if not batch:
            return None
        if user_id is not None and batch.created_by != user_id:
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
    def delete_batch(
        session: Session,
        batch_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> bool:
        """Delete a screening batch.

        Screening records cascade delete automatically.
        Associated investigations survive with batch_id and screening_record_id SET NULL.
        Returns False if not found or if not owned by user_id.
        """
        batch = session.get(ScreeningBatch, batch_id)
        if not batch:
            return False
        if user_id is not None and batch.created_by != user_id:
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
    def create_investigation(
        session: Session,
        data: InvestigationCreate,
        user_id: Optional[uuid.UUID] = None,
    ) -> Investigation:
        """Create a new investigation ticket.

        Enforces user ownership, relationship ownership, and scoped unique checks:
        1. uq_investigations_screening_record: a screening record cannot be re-attached to a second ticket.
        2. uq_investigations_active_customer_batch: customer cannot have duplicate active tickets in same batch.
        """
        owner_id = user_id if user_id is not None else data.created_by

        # Relationship ownership checks:
        if user_id is not None:
            if data.batch_id:
                batch = session.get(ScreeningBatch, data.batch_id)
                if batch and batch.created_by != user_id:
                    raise ResourceNotFoundError(f"Screening batch '{data.batch_id}' was not found.")
            if data.screening_record_id:
                rec = session.get(ScreeningRecord, data.screening_record_id)
                if rec:
                    parent_batch = session.get(ScreeningBatch, rec.batch_id)
                    if parent_batch and parent_batch.created_by != user_id:
                        raise ResourceNotFoundError(f"Screening record '{data.screening_record_id}' was not found.")

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
            created_by=owner_id,
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
        except RepositoryError:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to create investigation: {exc}") from exc

    @staticmethod
    def list_investigations(
        session: Session,
        user_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        customer_ref: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Investigation]:
        """List investigation tickets ordered by creation time descending.
        
        When user_id is provided, strictly limits results to tickets owned by that user.
        Legacy unowned records (created_by IS NULL) are not returned.
        """
        stmt = select(Investigation).order_by(Investigation.created_at.desc())
        if user_id is not None:
            stmt = stmt.where(Investigation.created_by == user_id)
        if status and status != "All":
            stmt = stmt.where(Investigation.status == status)
        if customer_ref:
            stmt = stmt.where(Investigation.customer_ref == customer_ref)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_investigation(
        session: Session,
        investigation_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[Investigation]:
        """Fetch investigation by primary key UUID.
        
        Returns None if not found or if not owned by user_id.
        """
        inv = session.get(Investigation, investigation_id)
        if not inv:
            return None
        if user_id is not None and inv.created_by != user_id:
            return None
        return inv

    @staticmethod
    def get_investigation_by_ticket_code(
        session: Session,
        ticket_code: str,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[Investigation]:
        """Fetch investigation by unique ticket code.
        
        Returns None if not found or if not owned by user_id.
        """
        stmt = select(Investigation).where(Investigation.ticket_code == ticket_code)
        if user_id is not None:
            stmt = stmt.where(Investigation.created_by == user_id)
        return session.scalars(stmt).first()

    @staticmethod
    def update_investigation(
        session: Session,
        investigation_id: uuid.UUID,
        patch: InvestigationUpdate,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[Investigation]:
        """Partially update mutable fields on an investigation ticket.
        
        Returns None if not found or if not owned by user_id.
        """
        investigation = session.get(Investigation, investigation_id)
        if not investigation:
            return None
        if user_id is not None and investigation.created_by != user_id:
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
    def delete_investigation(
        session: Session,
        investigation_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> bool:
        """Delete an investigation ticket.

        Any linked bill_extractions survive with investigation_id SET NULL.
        Returns False if not found or if not owned by user_id.
        """
        investigation = session.get(Investigation, investigation_id)
        if not investigation:
            return False
        if user_id is not None and investigation.created_by != user_id:
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
    def create_extraction(
        session: Session,
        data: BillExtractionCreate,
        user_id: Optional[uuid.UUID] = None,
    ) -> BillExtraction:
        """Persist a confirmed bill extraction record.

        Notice: raw_ocr_text is NOT stored, strictly preserving data minimization.
        Enforces user ownership directly on created_by and verifies linked investigation ownership.
        """
        owner_id = user_id if user_id is not None else data.created_by

        if user_id is not None and data.investigation_id:
            inv = session.get(Investigation, data.investigation_id)
            if inv and inv.created_by != user_id:
                raise ResourceNotFoundError(f"Investigation '{data.investigation_id}' was not found.")

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
            created_by=owner_id,
        )

        try:
            session.add(extraction)
            session.commit()
            session.refresh(extraction)
            return extraction
        except RepositoryError:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise RepositoryError(f"Failed to persist bill extraction: {exc}") from exc

    @staticmethod
    def list_extractions(
        session: Session,
        user_id: Optional[uuid.UUID] = None,
        consumer_number: Optional[str] = None,
        investigation_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[BillExtraction]:
        """List bill extractions optionally filtered by consumer number or investigation.
        
        When user_id is provided, strictly limits results to records owned by that user.
        """
        stmt = select(BillExtraction).order_by(BillExtraction.created_at.desc())
        if user_id is not None:
            stmt = stmt.where(BillExtraction.created_by == user_id)
        if consumer_number:
            stmt = stmt.where(BillExtraction.consumer_number == consumer_number)
        if investigation_id:
            stmt = stmt.where(BillExtraction.investigation_id == investigation_id)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

    @staticmethod
    def get_extraction(
        session: Session,
        extraction_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> Optional[BillExtraction]:
        """Fetch bill extraction by primary key.
        
        Returns None if not found or if not owned by user_id.
        """
        ext = session.get(BillExtraction, extraction_id)
        if not ext:
            return None
        if user_id is not None and ext.created_by != user_id:
            return None
        return ext

    @staticmethod
    def list_by_consumer(
        session: Session,
        consumer_number: str,
        user_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[BillExtraction]:
        """List bill extractions for a specific consumer owned by user_id."""
        stmt = (
            select(BillExtraction)
            .where(BillExtraction.consumer_number == consumer_number)
            .order_by(BillExtraction.created_at.desc())
        )
        if user_id is not None:
            stmt = stmt.where(BillExtraction.created_by == user_id)
        stmt = stmt.limit(limit).offset(offset)
        return list(session.scalars(stmt).all())

