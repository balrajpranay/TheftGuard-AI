"""Database integration package for TheftGuard AI."""

from .config import (
    DatabaseConfigError,
    get_raw_database_url,
    mask_database_url,
    normalize_database_url,
)
from .models import (
    Base,
    BillExtraction,
    Investigation,
    ScreeningBatch,
    ScreeningRecord,
)
from .repositories import (
    BatchRepository,
    BillExtractionRepository,
    DuplicateInvestigationError,
    InvestigationRepository,
    RepositoryError,
    ResourceNotFoundError,
)
from .schemas import (
    ORIGIN_MAPPING,
    BillExtractionCreate,
    BillExtractionResponse,
    InvestigationCreate,
    InvestigationResponse,
    InvestigationUpdate,
    ScreeningBatchCreate,
    ScreeningBatchDetailResponse,
    ScreeningBatchSummaryResponse,
    ScreeningRecordCreate,
    ScreeningRecordResponse,
    normalize_origin,
)
from .session import (
    get_db_session,
    get_engine,
    get_session_factory,
    is_database_configured,
    reset_engine,
)

__all__ = [
    "Base",
    "ScreeningBatch",
    "ScreeningRecord",
    "Investigation",
    "BillExtraction",
    "BatchRepository",
    "InvestigationRepository",
    "BillExtractionRepository",
    "RepositoryError",
    "DuplicateInvestigationError",
    "ResourceNotFoundError",
    "ORIGIN_MAPPING",
    "normalize_origin",
    "ScreeningRecordCreate",
    "ScreeningRecordResponse",
    "ScreeningBatchCreate",
    "ScreeningBatchSummaryResponse",
    "ScreeningBatchDetailResponse",
    "InvestigationCreate",
    "InvestigationUpdate",
    "InvestigationResponse",
    "BillExtractionCreate",
    "BillExtractionResponse",
    "DatabaseConfigError",
    "get_raw_database_url",
    "mask_database_url",
    "normalize_database_url",
    "get_engine",
    "get_session_factory",
    "get_db_session",
    "is_database_configured",
    "reset_engine",
]
