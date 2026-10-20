"""TheftGuard AI — Phase 2: Secure Database Persistence Endpoints.

FastAPI router implementing user-scoped REST persistence endpoints for:
- Screening batches (/v1/batches)
- Field investigations (/v1/investigations)
- Electricity bill extraction metadata (/v1/bill-extractions)

Security & Architecture Notice:
- All persistence endpoints require a verified Supabase JWT Bearer token via `get_current_user`.
- Missing, expired, or invalid tokens return HTTP 401 Unauthorized with standard Bearer challenges.
- Record ownership is anchored strictly on the authenticated user's verified UUID (`current_user.user_id`).
  Any client-supplied `created_by` or owner claims in request bodies are ignored.
- Object-level authorization is enforced on every query, read, update, and deletion.
- Inaccessible or non-existent records return HTTP 404 without leaking whether records exist.
- Data minimization is preserved: raw_ocr_text is never accepted or stored.
- Errors are sanitized: API response bodies never expose database connection strings,
  SQL statements, parameters, stack traces, or internal error text.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Generator, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .auth import AuthenticatedUser, get_current_user
from .db import (
    BatchRepository,
    BillExtractionCreate,
    BillExtractionRepository,
    BillExtractionResponse,
    DatabaseConfigError,
    DuplicateInvestigationError,
    InvestigationCreate,
    InvestigationRepository,
    InvestigationResponse,
    InvestigationUpdate,
    RepositoryError,
    ResourceNotFoundError,
    ScreeningBatchCreate,
    ScreeningBatchDetailResponse,
    ScreeningBatchSummaryResponse,
    ScreeningRecordResponse,
    get_db_session,
)
from .v1_handlers import error_body

logger = logging.getLogger("theftguard.persistence")

persistence_router = APIRouter(prefix="/v1", tags=["persistence"])


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency providing a transactional database session scope."""
    try:
        with get_db_session() as session:
            yield session
    except DatabaseConfigError as exc:
        logger.warning("Database configuration error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "database_unavailable", "message": "Database is not configured or unavailable."}},
        ) from exc


# ==============================================================================
# 1. Screening Batches
# ==============================================================================

@persistence_router.post(
    "/batches",
    status_code=status.HTTP_201_CREATED,
    response_model=ScreeningBatchDetailResponse,
    summary="Create and persist a screening batch atomically",
)
def create_batch(
    payload: ScreeningBatchCreate,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a screening batch and all associated screening records atomically in a single transaction.

    The batch is owned by the authenticated user (`current_user.user_id`).
    If any row or constraint fails, the entire batch is rolled back.
    """
    try:
        batch = BatchRepository.create_batch(session, payload, user_id=current_user.user_id)
        return ScreeningBatchDetailResponse(
            id=batch.id,
            file_name=batch.file_name,
            file_hash=batch.file_hash,
            total_rows=batch.total_rows,
            scored_rows=batch.scored_rows,
            rejected_rows=batch.rejected_rows,
            warning_rows=batch.warning_rows,
            model_version=batch.model_version,
            model_sha256=batch.model_sha256,
            score_note=batch.score_note,
            threshold_elevated=batch.threshold_elevated,
            threshold_review=batch.threshold_review,
            status=batch.status,
            created_by=batch.created_by,
            created_at=batch.created_at,
            updated_at=batch.updated_at,
            records=[ScreeningRecordResponse.model_validate(r) for r in batch.records],
        )
    except RepositoryError as exc:
        logger.error("Failed to create batch: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to persist screening batch."),
        )


@persistence_router.get(
    "/batches",
    response_model=List[ScreeningBatchSummaryResponse],
    summary="List historical screening batches",
)
def list_batches(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum batches to return (1-100)."),
    offset: int = Query(default=0, ge=0, description="Pagination offset index."),
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """List historical screening batches owned by the authenticated user, ordered by most recent first."""
    try:
        batches = BatchRepository.list_batches(
            session, user_id=current_user.user_id, limit=limit, offset=offset
        )
        return [ScreeningBatchSummaryResponse.model_validate(b) for b in batches]
    except RepositoryError as exc:
        logger.error("Failed to list batches: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve screening batches."),
        )


@persistence_router.get(
    "/batches/{batch_id}",
    response_model=ScreeningBatchDetailResponse,
    summary="Retrieve batch metadata and associated records",
)
def get_batch(
    batch_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=100, description="Page size for associated child records (1-100)."),
    offset: int = Query(default=0, ge=0, description="Offset for associated child records."),
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Fetch a single screening batch along with its paginated child records, scoped to current user."""
    try:
        result = BatchRepository.get_batch_with_records(
            session, batch_id, user_id=current_user.user_id, limit=limit, offset=offset
        )
        if result is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Screening batch '{batch_id}' was not found."),
            )
        batch, records, total_records = result
        return ScreeningBatchDetailResponse(
            id=batch.id,
            file_name=batch.file_name,
            file_hash=batch.file_hash,
            total_rows=batch.total_rows,
            scored_rows=batch.scored_rows,
            rejected_rows=batch.rejected_rows,
            warning_rows=batch.warning_rows,
            model_version=batch.model_version,
            model_sha256=batch.model_sha256,
            score_note=batch.score_note,
            threshold_elevated=batch.threshold_elevated,
            threshold_review=batch.threshold_review,
            status=batch.status,
            created_by=batch.created_by,
            created_at=batch.created_at,
            updated_at=batch.updated_at,
            records=[ScreeningRecordResponse.model_validate(r) for r in records],
        )
    except RepositoryError as exc:
        logger.error("Failed to retrieve batch %s: %s", batch_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve screening batch."),
        )


@persistence_router.delete(
    "/batches/{batch_id}",
    summary="Delete a screening batch",
)
def delete_batch(
    batch_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a screening batch owned by the authenticated user.

    Screening records cascade delete automatically.
    Associated investigations survive with batch_id and screening_record_id SET NULL.
    """
    try:
        deleted = BatchRepository.delete_batch(session, batch_id, user_id=current_user.user_id)
        if not deleted:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Screening batch '{batch_id}' was not found."),
            )
        return {"deleted": True, "id": str(batch_id)}
    except RepositoryError as exc:
        logger.error("Failed to delete batch %s: %s", batch_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to delete screening batch."),
        )


# ==============================================================================
# 2. Investigations
# ==============================================================================

@persistence_router.get(
    "/investigations",
    response_model=List[InvestigationResponse],
    summary="List investigation tickets with optional filtering",
)
def list_investigations(
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status."),
    customer_ref: Optional[str] = Query(default=None, description="Filter by customer identifier."),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum tickets to return (1-100)."),
    offset: int = Query(default=0, ge=0, description="Pagination offset index."),
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """List investigation audit tickets owned by the authenticated user, ordered by creation time descending."""
    try:
        investigations = InvestigationRepository.list_investigations(
            session,
            user_id=current_user.user_id,
            status=status_filter,
            customer_ref=customer_ref,
            limit=limit,
            offset=offset,
        )
        return [InvestigationResponse.model_validate(inv) for inv in investigations]
    except RepositoryError as exc:
        logger.error("Failed to list investigations: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve investigations."),
        )


@persistence_router.post(
    "/investigations",
    status_code=status.HTTP_201_CREATED,
    response_model=InvestigationResponse,
    summary="Create a new investigation ticket",
)
def create_investigation(
    payload: InvestigationCreate,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Open an investigation audit ticket owned by the authenticated user.

    Enforces ownership and scoped uniqueness rules:
    - Referenced batch or screening record must belong to the authenticated user.
    - A screening record can only be attached to ONE investigation.
    - A customer cannot have duplicate active tickets in the same screening batch.
    - Duplicate ticket_code values are rejected.
    Conflicts return HTTP 409. Inaccessible/missing resources return HTTP 404.
    """
    try:
        inv = InvestigationRepository.create_investigation(
            session, payload, user_id=current_user.user_id
        )
        return InvestigationResponse.model_validate(inv)
    except ResourceNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_body("not_found", str(exc)),
        )
    except DuplicateInvestigationError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=error_body("conflict", str(exc)),
        )
    except RepositoryError as exc:
        logger.error("Failed to create investigation: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to create investigation ticket."),
        )


@persistence_router.get(
    "/investigations/by-ticket/{ticket_code}",
    response_model=InvestigationResponse,
    summary="Retrieve an investigation ticket by ticket code",
)
def get_investigation_by_ticket_code(
    ticket_code: str,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Fetch an individual investigation ticket by unique ticket code owned by the authenticated user."""
    try:
        inv = InvestigationRepository.get_investigation_by_ticket_code(
            session, ticket_code, user_id=current_user.user_id
        )
        if inv is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Investigation with ticket code '{ticket_code}' was not found."),
            )
        return InvestigationResponse.model_validate(inv)
    except RepositoryError as exc:
        logger.error("Failed to retrieve investigation by ticket code %s: %s", ticket_code, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve investigation."),
        )


@persistence_router.get(
    "/investigations/{investigation_id}",
    response_model=InvestigationResponse,
    summary="Retrieve an investigation ticket by ID",
)
def get_investigation(
    investigation_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Fetch an individual investigation ticket by primary key UUID owned by the authenticated user."""
    try:
        inv = InvestigationRepository.get_investigation(
            session, investigation_id, user_id=current_user.user_id
        )
        if inv is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Investigation '{investigation_id}' was not found."),
            )
        return InvestigationResponse.model_validate(inv)
    except RepositoryError as exc:
        logger.error("Failed to retrieve investigation %s: %s", investigation_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve investigation."),
        )


@persistence_router.patch(
    "/investigations/{investigation_id}",
    response_model=InvestigationResponse,
    summary="Update permitted mutable fields on an investigation",
)
def update_investigation(
    investigation_id: uuid.UUID,
    payload: InvestigationUpdate,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Partially update mutable fields on an investigation ticket owned by the authenticated user."""
    try:
        inv = InvestigationRepository.update_investigation(
            session, investigation_id, payload, user_id=current_user.user_id
        )
        if inv is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Investigation '{investigation_id}' was not found."),
            )
        return InvestigationResponse.model_validate(inv)
    except RepositoryError as exc:
        logger.error("Failed to update investigation %s: %s", investigation_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to update investigation ticket."),
        )


@persistence_router.delete(
    "/investigations/{investigation_id}",
    summary="Delete an investigation ticket",
)
def delete_investigation(
    investigation_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete an investigation ticket owned by the authenticated user.

    Any linked bill extractions survive with investigation_id SET NULL.
    """
    try:
        deleted = InvestigationRepository.delete_investigation(
            session, investigation_id, user_id=current_user.user_id
        )
        if not deleted:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Investigation '{investigation_id}' was not found."),
            )
        return {"deleted": True, "id": str(investigation_id)}
    except RepositoryError as exc:
        logger.error("Failed to delete investigation %s: %s", investigation_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to delete investigation ticket."),
        )


# ==============================================================================
# 3. Bill Extractions
# ==============================================================================

@persistence_router.post(
    "/bill-extractions",
    status_code=status.HTTP_201_CREATED,
    response_model=BillExtractionResponse,
    summary="Persist OCR bill extraction metadata",
)
def create_bill_extraction(
    payload: BillExtractionCreate,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Persist structured electricity bill readings and discrepancy analysis owned by current user.

    Notice: raw_ocr_text is explicitly excluded from schemas and persistence.
    If linked to an investigation, the investigation must be owned by current user.
    """
    try:
        extraction = BillExtractionRepository.create_extraction(
            session, payload, user_id=current_user.user_id
        )
        return BillExtractionResponse.model_validate(extraction)
    except ResourceNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_body("not_found", str(exc)),
        )
    except RepositoryError as exc:
        logger.error("Failed to persist bill extraction: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to persist bill extraction metadata."),
        )


@persistence_router.get(
    "/bill-extractions",
    response_model=List[BillExtractionResponse],
    summary="List persisted bill extractions",
)
def list_bill_extractions(
    consumer_number: Optional[str] = Query(default=None, description="Filter by consumer reference number."),
    investigation_id: Optional[uuid.UUID] = Query(default=None, description="Filter by linked investigation ticket."),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum extractions to return (1-100)."),
    offset: int = Query(default=0, ge=0, description="Pagination offset index."),
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """List persisted bill extraction readings owned by the authenticated user with optional filtering."""
    try:
        extractions = BillExtractionRepository.list_extractions(
            session,
            user_id=current_user.user_id,
            consumer_number=consumer_number,
            investigation_id=investigation_id,
            limit=limit,
            offset=offset,
        )
        return [BillExtractionResponse.model_validate(ext) for ext in extractions]
    except RepositoryError as exc:
        logger.error("Failed to list bill extractions: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve bill extractions."),
        )


@persistence_router.get(
    "/bill-extractions/by-consumer/{consumer_number}",
    response_model=List[BillExtractionResponse],
    summary="List bill extractions by consumer number",
)
def list_bill_extractions_by_consumer(
    consumer_number: str,
    limit: int = Query(default=50, ge=1, le=100, description="Maximum extractions to return (1-100)."),
    offset: int = Query(default=0, ge=0, description="Pagination offset index."),
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Fetch all bill extractions for a specific consumer owned by the authenticated user."""
    try:
        extractions = BillExtractionRepository.list_by_consumer(
            session, consumer_number, user_id=current_user.user_id, limit=limit, offset=offset
        )
        return [BillExtractionResponse.model_validate(ext) for ext in extractions]
    except RepositoryError as exc:
        logger.error("Failed to retrieve extractions for consumer %s: %s", consumer_number, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve bill extractions."),
        )


@persistence_router.get(
    "/bill-extractions/{extraction_id}",
    response_model=BillExtractionResponse,
    summary="Retrieve a bill extraction by ID",
)
def get_bill_extraction(
    extraction_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Fetch an individual bill extraction by primary key UUID owned by the authenticated user."""
    try:
        ext = BillExtractionRepository.get_extraction(
            session, extraction_id, user_id=current_user.user_id
        )
        if ext is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=error_body("not_found", f"Bill extraction '{extraction_id}' was not found."),
            )
        return BillExtractionResponse.model_validate(ext)
    except RepositoryError as exc:
        logger.error("Failed to retrieve bill extraction %s: %s", extraction_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("database_error", "Failed to retrieve bill extraction."),
        )
