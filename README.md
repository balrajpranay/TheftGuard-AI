# TheftGuard AI — Electricity Theft Detection & Investigation Platform (v1.0.0)

TheftGuard AI is an integrated platform combining machine learning screening, spot-billing electricity bill OCR analysis, and database audit persistence for electricity distribution utilities.

---

## 1. System Architecture

The v1.0.0 architecture consists of three decoupled components:

```
┌─────────────────────────────────────────────────────────────┐
│                   React 18 SPA (Frontend)                   │
│   Vite dev server (port 5173) / Tailwind CSS / Recharts     │
│   Client-side Tesseract.js OCR & Arithmetic Discrepancy     │
└──────────────────────────────┬──────────────────────────────┘
                               │  Vite proxy: /ml -> port 8000
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FastAPI Service (Backend)                   │
│   Uvicorn server (127.0.0.1:8000) / Pydantic v2 validation  │
│   Scikit-learn Random Forest model (13 summary features)    │
│   SQLAlchemy repositories (Batches, Records, Investigations)│
└──────────────────────────────┬──────────────────────────────┘
                               │  psycopg v3 session pooler
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PostgreSQL Database (Storage)               │
│   Supabase PostgreSQL (or local PostgreSQL)                 │
│   Tables: screening_batches, screening_records,             │
│           investigations, bill_extractions, schema_migrations│
│   Row Level Security (RLS) enabled on all tables            │
└─────────────────────────────────────────────────────────────┘
```

### Key Subsystems:
1. **ML Screening Pipeline:** Evaluates batches of customer consumption metrics using an uncalibrated Random Forest classifier (250 trees, median imputation) trained on 13 engineered features. Verified with SHA-256 hash checking at service startup.
2. **Bill Extraction & Verification:** Performs client-side OCR on Telangana/TSSPDCL electricity spot bills using Tesseract.js, parses consumer numbers and meter readings, and flags billing discrepancies without persisting raw OCR text or document files (strict data minimization).
3. **Database Audit Persistence:** Manages screening batches, child records, investigation audit tickets (`INV-YYYYMMDD-XXXX`), and bill extraction metadata in PostgreSQL.

---

## 2. Scientific Principles & Honesty Rules

- **Uncalibrated Model Scores:** The primary output is termed **Model Score** ($0.0$ to $1.0$). It represents the Random Forest vote fraction for class 1; it is **not** a calibrated probability of electricity theft.
- **Label Interpretation:** Wording in the UI and API is strictly "Potentially Suspicious" and "Review Recommended". Scores reflect consumption patterns resembling dataset training labels, not confirmed theft or fraudulent tampering.
- **Display Bands:**
  - `Normal`: Model Score $< 0.30$
  - `Elevated Risk`: $0.30 \le \text{Score} < 0.50$
  - `Review Recommended`: $\text{Score} \ge 0.50$ (the default decision threshold)
- **Data Minimization:** No raw OCR text, camera images, or PDF binaries are ever sent to the backend or saved in the database. Only verified numerical readings and categorical discrepancy flags are retained.

---

## 3. Project Directory Structure

```
TheftGuard-AI/
├── README.md                                 # Root platform documentation & restoration guide
├── API_CONTRACTS.md                          # Endpoint contracts, schemas, and error codes
├── .gitignore                                # Global Git exclusion rules
├── Phase2A/                                  # Baseline HTTP verification suites & reports
├── ml-service/                               # Backend FastAPI application
│   ├── .env.example                          # Environment variable configuration template
│   ├── .gitignore                            # Backend-specific ignore rules
│   ├── requirements.txt                      # Pinned Python dependencies
│   ├── service/                              # Application source code
│   │   ├── main.py                           # FastAPI entrypoint & router assembly
│   │   ├── persistence_routes.py             # Phase 3 database persistence endpoints
│   │   ├── scoring.py                        # Model loading & batch scoring logic
│   │   ├── v1_handlers.py                    # Pure request handlers
│   │   ├── validation.py                     # 13-feature bounds and rule enforcement
│   │   ├── validation_config.py              # Feature schemas & bounds
│   │   ├── model_metadata.json               # Recorded metrics and SHA-256 hash
│   │   ├── training_ranges.json              # Historical feature boundaries
│   │   └── db/                               # Database access layer
│   │       ├── config.py                     # Connection settings & URL normalization
│   │       ├── models.py                     # SQLAlchemy ORM models (5 tables)
│   │       ├── repositories.py               # Atomicity & database CRUD operations
│   │       ├── schemas.py                    # Pydantic v2 request/response schemas
│   │       └── session.py                    # Engine lifecycle & session generators
│   ├── migrations/sql/
│   │   ├── 001_phase2_initial_schema.sql     # PostgreSQL DDL migration
│   │   └── 001_phase2_rollback_initial_schema.sql
│   ├── scripts/                              # Disposable DB and connection test scripts
│   ├── tests/unit/                           # 86 backend unit tests
│   └── tools/                                # Benchmark & dataset tools
└── theftguard-ai-frontend/                   # Frontend React application
    ├── package-lock.json
    └── frontend/
        ├── package.json                      # Pinned npm dependencies & scripts
        ├── vite.config.js                    # Vite configuration with /ml reverse proxy
        ├── tailwind.config.js                # Custom styling & color palette
        ├── postcss.config.js
        ├── index.html                        # Application root
        ├── eng.traineddata                   # Offline OCR language model
        ├── src/
        │   ├── App.jsx                       # Main application router
        │   ├── components/                   # UI primitives, panels, badges, shell
        │   ├── data/                         # Synthetic demo data & feature definitions
        │   ├── lib/                          # API clients (dbApi, mlApi), parsers, CSV export
        │   ├── pages/                        # Dashboard, Screening, Results, Investigations, BillUpload, Reports
        │   └── state/                        # Global AppState store & DB fallback logic
        └── test/                             # 40 frontend unit tests (Node test runner)
```

---

## 4. Restoration & Recovery Guide (Step-by-Step)

Follow these steps to restore and run TheftGuard AI v1.0.0 from an unpacked source archive or Git repository.

### Prerequisites
- **Python:** Version 3.10 to 3.13 (tested on 3.13)
- **Node.js:** Version 18 or newer (tested on Node 20 and 24; npm 10+)
- **Database:** Supabase PostgreSQL instance (or local PostgreSQL 14+)

---

### Step 1: Restore the ML Model Binary
Because machine learning binaries are excluded from Git and the source ZIP, retrieve the model from the external backup location:
- **Backup Source:** `D:\TheftGuard-AI-Backups\models\validated_candidate_pipeline.joblib`
- **Expected Destination:** Place the file in `ml-service\validated_candidate_pipeline.joblib`

Verify the file's SHA-256 hash matches the expected value before proceeding:
```powershell
# PowerShell verification:
(Get-FileHash -Path "ml-service\validated_candidate_pipeline.joblib" -Algorithm SHA256).Hash.ToLower()
# Expected: 442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5
```

---

### Step 2: Configure Backend Environment Variables
Inside the `ml-service` directory, copy the configuration template to `.env`:
```powershell
cd ml-service
copy .env.example .env
```
Edit `ml-service\.env` with your editor:
```ini
# Path to the restored model file (relative to ml-service or absolute)
THEFTGUARD_MODEL_PATH=validated_candidate_pipeline.joblib
THEFTGUARD_ENABLE_DOCS=1
THEFTGUARD_MAX_BODY_BYTES=20971520

# Supabase Session Pooler connection string (Port 5432)
# Format: postgresql+psycopg://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
THEFTGUARD_DATABASE_URL=postgresql+psycopg://postgres.yourprojectref:yourpassword@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
```
> [!CAUTION]
> Never commit `ml-service/.env` to version control. It is explicitly ignored in `.gitignore`.

---

### Step 3: Apply Database Schema Migration
Apply the Phase 2 initial schema migration deliberately to your target database.
- **Migration Script:** [`ml-service/migrations/sql/001_phase2_initial_schema.sql`](file:///c:/Users/shush/OneDrive/Desktop/TheftGuard-AI/ml-service/migrations/sql/001_phase2_initial_schema.sql)
- **Methods:**
  - **Option A (Supabase Dashboard):** Open the Supabase SQL Editor, paste the contents of `001_phase2_initial_schema.sql`, and execute.
  - **Option B (psql):**
    ```powershell
    psql -d "your-connection-string" -f "migrations/sql/001_phase2_initial_schema.sql"
    ```
This creates the 5 required tables (`schema_migrations`, `screening_batches`, `screening_records`, `investigations`, `bill_extractions`) with unique constraints and Row Level Security enabled.

---

### Step 4: Setup Python Backend & Run Verification Tests
```powershell
cd ml-service

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install exact pinned dependencies
pip install -r requirements.txt

# Run the 86 backend unit tests
python -m unittest discover -s tests/unit
```
Expected result: `Ran 86 tests ... OK (skipped=2)`. (2 tests skip cleanly when live PostgreSQL is offline).

---

### Step 5: Setup React Frontend & Run Verification Tests
Open a second terminal:
```powershell
cd theftguard-ai-frontend\frontend

# Install node dependencies
npm install

# Run the 40 frontend unit tests
npm test

# Verify production build compilation
npm run build
```
Expected result: `tests 40, pass 40, fail 0` and `built in ~3.5s`.

---

### Step 6: Start Application Services (Dual-Terminal)

**Terminal 1 — FastAPI Backend:**
```powershell
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn service.main:app --host 127.0.0.1 --port 8000
```
Backend runs at `http://127.0.0.1:8000`. Health check: `http://127.0.0.1:8000/v1/health`.

**Terminal 2 — React Frontend:**
```powershell
cd theftguard-ai-frontend\frontend
npm run dev
```
Frontend runs at `http://localhost:5173`. Open your browser to begin screening.

---

## 5. Troubleshooting & FAQ

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| `model_unavailable: model_file_not_found` | Model binary missing from `ml-service` | Copy `validated_candidate_pipeline.joblib` from backup into `ml-service\` and verify `THEFTGUARD_MODEL_PATH` in `.env`. |
| `model_unavailable: model_hash_mismatch` | Model file corrupted or modified | Re-copy `validated_candidate_pipeline.joblib` from backup; ensure SHA-256 matches `442981aa7f...`. |
| `database_unavailable` (503) / fallback to local tickets | Database URL missing or network offline | Verify `THEFTGUARD_DATABASE_URL` in `ml-service/.env`. Note: Frontend remains usable in local session fallback mode. |
| Browser shows network error calling `/ml/*` | Backend service not running on port 8000 | Ensure FastAPI backend is active in Terminal 1. Vite dev server proxies `/ml` to `http://127.0.0.1:8000`. |
| Batch with $> 100$ rows only partially showing | Legacy pagination truncation | Version 1.0.0 includes `getBatchWithAllRecords` which transparently pages through all rows. |

---

## 6. Security & Local Evaluation Boundaries

> [!WARNING]
> **Local / Demo Evaluation Only:**
> TheftGuard AI Version 1.0.0 is stabilized and verified for local development, workstation demonstration, and offline evaluation. It is **not** currently hardened or approved for public cloud exposure.

### Production Readiness Prerequisites (Required for Phase 4):
1. **Authentication & Authorization:** The persistence endpoints (`/v1/batches`, `/v1/investigations`) are unauthenticated. Production requires JWT authentication (e.g. Supabase Auth) and role-based access control.
2. **Reverse Proxy & TLS:** Production deployments must terminate TLS behind Nginx or an API gateway, not the Vite dev proxy.
3. **CORS & Rate Limiting:** Enforce restrictive CORS origins and request rate limits on `/v1/predict-batch` and `/v1/batches`.
4. **Database Connection Pooling:** Use Supabase Session Pooler (Port 5432) or PgBouncer with dedicated non-superuser credentials.
