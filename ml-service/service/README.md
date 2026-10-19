# TheftGuard AI — Backend Service (`ml-service`)

FastAPI backend providing machine learning screening inference and PostgreSQL database persistence for screening batches, investigation audit tickets, and electricity bill extraction metadata.

---

## 1. Environment Setup & Prerequisites

- **Python Version:** Python 3.10 to 3.13 (tested on Python 3.13).
- **Working Directory:** All commands below should be executed from the `ml-service` directory.

### Step 1: Create Virtual Environment & Install Dependencies
```powershell
cd ml-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Windows Command Prompt:
.\.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate

# Install exact pinned requirements
pip install -r requirements.txt
```

### Step 2: Restore the Trained Model Binary
Because machine learning binary files are ignored by Git (`*.joblib`), copy the model file from the backup location:
- **Backup Source:** `D:\TheftGuard-AI-Backups\models\validated_candidate_pipeline.joblib`
- **Destination:** `ml-service\validated_candidate_pipeline.joblib`
- **Expected SHA-256:** `442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5`

Verify the hash:
```powershell
(Get-FileHash -Path "validated_candidate_pipeline.joblib" -Algorithm SHA256).Hash.ToLower()
```

### Step 3: Configure Environment Variables (`.env`)
Copy the configuration template:
```powershell
copy .env.example .env
```
Edit `.env` to supply your configuration:
```ini
# Path to model file (relative to ml-service or absolute path)
THEFTGUARD_MODEL_PATH=validated_candidate_pipeline.joblib

# Optional hash override (defaults to recorded SHA-256)
# THEFTGUARD_MODEL_SHA256=442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5

# Enable OpenAPI interactive documentation at /docs (1 = enabled, 0 = disabled)
THEFTGUARD_ENABLE_DOCS=1

# Maximum request payload size in bytes (default 20 MiB = 20971520)
THEFTGUARD_MAX_BODY_BYTES=20971520

# PostgreSQL connection string (Supabase Session Pooler on Port 5432)
THEFTGUARD_DATABASE_URL=postgresql+psycopg://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
```

---

## 2. Database Schema Migration

The service requires the Phase 2 schema on PostgreSQL (Supabase or local).
- **Migration SQL:** [`migrations/sql/001_phase2_initial_schema.sql`](file:///c:/Users/shush/OneDrive/Desktop/TheftGuard-AI/ml-service/migrations/sql/001_phase2_initial_schema.sql)
- **Rollback SQL:** [`migrations/sql/001_phase2_rollback_initial_schema.sql`](file:///c:/Users/shush/OneDrive/Desktop/TheftGuard-AI/ml-service/migrations/sql/001_phase2_rollback_initial_schema.sql)

Apply the DDL using `psql` or the Supabase SQL Editor. The migration creates 5 tables:
- `schema_migrations`
- `screening_batches`
- `screening_records`
- `investigations`
- `bill_extractions`

---

## 3. Running Unit Tests

Run the full 86-test backend test suite from `ml-service`:
```powershell
python -m unittest discover -s tests/unit
```
Expected output: `Ran 86 tests ... OK (skipped=2)`.
(The 2 skipped tests run exclusively when a live PostgreSQL connection is detected).

---

## 4. Starting the Service

Run the Uvicorn server:
```powershell
python -m uvicorn service.main:app --host 127.0.0.1 --port 8000
```
- **Service URL:** `http://127.0.0.1:8000`
- **Swagger UI:** `http://127.0.0.1:8000/docs` (when `THEFTGUARD_ENABLE_DOCS=1`)
- **Health Check:** `http://127.0.0.1:8000/v1/health`

---

## 5. API Endpoints Catalog

### Health & Metadata
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/v1/health` | Service health, model load status, and SHA-256 verification |
| `GET` | `/v1/model-metadata` | Model facts, limitations, feature order, and confusion matrix |

### ML Scoring
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/predict` | Score a single customer row (requires all 13 features) |
| `POST` | `/v1/predict-batch` | Score a batch of up to 5,000 customer rows |

### Persistence — Screening Batches
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/batches` | Atomically persist a scored screening batch and all child records |
| `GET` | `/v1/batches` | List historical batches (supports `limit` and `offset`) |
| `GET` | `/v1/batches/{batch_id}` | Retrieve a batch and its child records (supports `limit` and `offset`) |

### Persistence — Investigations
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/investigations` | Create an investigation ticket (`INV-YYYYMMDD-XXXX`) linked to a record |
| `GET` | `/v1/investigations` | List investigations with optional filters (`status`, `origin`, pagination) |
| `GET` | `/v1/investigations/{id}` | Retrieve a single investigation ticket |
| `PATCH` | `/v1/investigations/{id}` | Update status, priority, assignee, notes, outcome, or checklist |
| `DELETE` | `/v1/investigations/{id}` | Delete an investigation ticket |

### Persistence — Bill Extractions
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/bill-extractions` | Persist bill extraction metadata (strictly numerical/categorical data) |
| `GET` | `/v1/bill-extractions` | List bill extraction records |

---

## 6. Error Codes & HTTP Mapping

- `400 Bad Request`: Invalid parameter or malformed request.
- `404 Not Found`: Batch or investigation ID not found.
- `409 Conflict`: Duplicate ticket code or record already linked to an active investigation.
- `422 Validation Error`: Missing required features, negative values, or schema violations.
- `503 Service Unavailable`:
  - `{"error": {"code": "model_unavailable"}}`: Model file missing or SHA-256 hash mismatch.
  - `{"error": {"code": "database_unavailable"}}`: Database not configured or connection failed.
