# TheftGuard AI — Electricity Theft Detection & Investigation Platform (v1.0.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

> **Live Website:** [https://theft-guard-ai-z9tb.vercel.app](https://theft-guard-ai-z9tb.vercel.app)  
> **Backend Service:** Deployed on Render (`https://theftguard-ai.onrender.com`)

TheftGuard AI is an integrated platform combining machine learning screening, spot-billing electricity bill OCR analysis, and database audit persistence for electricity distribution utilities.

---

## 1. Executive Overview & Problem Statement

Non-technical losses (NTLs)—principally electricity theft, meter tampering, and billing discrepancies—cost electricity distribution utilities worldwide billions of dollars annually. Traditional field inspections rely on random audits or manual tip-offs, which are inefficient, resource-intensive, and prone to human oversight.

**TheftGuard AI** addresses this challenge through a multi-tier audit workflow:
1. **High-Throughput ML Screening:** Fast statistical and tree-based classification across batches of customer consumption metrics to identify abnormal consumption patterns.
2. **Transparent Decision Support:** Uncalibrated model scores categorized into clear risk tiers with feature-level explainability, avoiding black-box verdicts.
3. **Spot-Billing OCR Verification:** Client-side optical character recognition of spot bills to catch billing arithmetic discrepancies and reading falsifications before field deployment.
4. **Audit Trail Persistence:** Relational database tracking of screening batches, individual customer records, and formal investigation tickets (`INV-YYYYMMDD-XXXX`) with 5-point physical verification checklists.

---

## 2. Key Technical Highlights

- **Scikit-Learn ML Pipeline:** 250-tree Random Forest classifier utilizing median imputation and 13 engineered summary consumption features. Service startup enforces SHA-256 integrity verification (`442981aa7f...`).
- **Chunked Batch Scoring:** Frontend streams rows in configurable chunks (50 rows/chunk) with live progress feedback, preventing browser freezes on large CSV uploads.
- **Multi-Page Detail Pagination:** [`getBatchWithAllRecords`](file:///c:/Users/shush/OneDrive/Desktop/TheftGuard-AI/theftguard-ai-frontend/frontend/src/lib/dbApi.js) transparently pages through batches $> 100$ records to guarantee complete historical batch reloads without silent truncation.
- **Client-Side Tesseract OCR:** Browser-based OCR using local `eng.traineddata` for offline spot-bill extraction. Enforces **strict data minimization**: raw OCR text, document binaries, and camera images are never transmitted or persisted.
- **Atomic Database Operations:** SQLAlchemy transactions guarantee that batches and child records commit atomically or roll back completely on failure.
- **Conflict & Integrity Safeguards:** Unique partial indexes prevent opening duplicate investigations for the same screening record (HTTP 409 Conflict).
- **Graceful Offline Fallback:** If the database service is offline, the client seamlessly falls back to local in-memory session tickets (`LOCAL-XXXXXX`) so reviews and demonstrations proceed uninterrupted.
- **Verified Test Suite:** 126 automated unit tests (86 backend tests with 84 passing and 2 live PostgreSQL tests skipped; 40 frontend tests passing 100%).

---

## 3. Technology Stack

| Layer | Technologies | Role / Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 5, Tailwind CSS, Recharts | Interactive single-page application with responsive UI, charts, and drawers |
| **Client OCR** | Tesseract.js, offline `eng.traineddata` | Browser-based spot-bill reading extraction and discrepancy calculation |
| **API Reverse Proxy** | Vite Server Proxy (`/ml` -> `:8000`) | Network isolation preventing browser exposure to database credentials |
| **Backend API** | FastAPI 0.115+, Uvicorn, Starlette | High-performance asynchronous REST API with Pydantic v2 validation |
| **ML Engine** | Scikit-learn, NumPy, Pandas, Joblib | 13-feature Random Forest pipeline and data validation boundaries |
| **Persistence / ORM**| SQLAlchemy 2.0, Psycopg v3, PostgreSQL | Relational audit storage with Row Level Security (RLS) on all 5 tables |
| **Testing** | Python `unittest`, Node.js native test runner | Comprehensive unit and integration test coverage across backend and frontend |

---

## 4. System Architecture

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

---

## 5. Scientific Principles & Honesty Rules

- **Uncalibrated Model Scores:** The primary output is termed **Model Score** ($0.0$ to $1.0$). It represents the Random Forest vote fraction for class 1; it is **not** a calibrated probability of electricity theft.
- **Label Interpretation:** Wording in the UI and API is strictly "Potentially Suspicious" and "Review Recommended". Scores reflect consumption patterns resembling dataset training labels, not confirmed theft or fraudulent tampering.
- **Display Bands:**
  - `Normal`: Model Score $< 0.30$
  - `Elevated Risk`: $0.30 \le \text{Score} < 0.50$
  - `Review Recommended`: $\text{Score} \ge 0.50$ (the default decision threshold)
- **Data Minimization:** No raw OCR text, camera images, or PDF binaries are ever sent to the backend or saved in the database. Only verified numerical readings and categorical discrepancy flags are retained.

---

## 6. AI Assistant Plugins & Grounded Tools

TheftGuard AI features a dedicated, grounded conversational AI workspace (`/app/chat`) equipped with 8 selectable plugins, transparent limitations, and grounded application tools. Each plugin performs real deterministic operations against live application state, client-side OCR extractions, and authenticated database records—strictly eliminating decorative buttons or invented AI responses.

### 6.1 The 8 Grounded Assistant Plugins

| # | Plugin | Badge | Role & Grounded Data Operation | Data Sources & Prerequisites |
|---|---|---|---|---|
| 1 | **General Assistant** (`general_assistant`) | `All-in-One` | Default baseline assistant. Answers general questions, defines electrical engineering concepts (kWh, sanctioned load, power factor, power vs energy), guides application navigation, and automatically synthesizes insights across loaded bills and tickets. | None (Universal fallback) |
| 2 | **Bill Comparison** (`bill_comparison`) | `Dual-Bill` | Computes verified energy shifts (kWh), percentage changes, calendar-normalized daily burn rates (`kWh/day`), billing amounts (₹), and effective cost per unit (`₹/kWh`). | Two consecutive bills loaded in [Bill Comparison](/app/bill-comparison) or saved extractions |
| 3 | **Bill Upload & OCR** (`bill_upload_ocr`) | `OCR Audit` | Audits scanned spot-billing receipts, checks OCR extraction confidence, and verifies arithmetic consistency: `(Current Reading - Previous Reading) × Multiplier = Units Consumed` to flag reader punch errors. | Scanned receipts in [Bill Upload](/app/bill-upload) or [Bill Comparison](/app/bill-comparison) |
| 4 | **Electricity Theft Screening** (`theft_screening`) | `ML Screening` | Evaluates consumption anomaly batches, score distributions (min, avg, max), and categorizes accounts into Review (≥ 0.50), Elevated (0.30–0.50), and Normal (< 0.30) triage bands. | CSV screening batch uploaded or loaded from [Batch History](/app/batches) |
| 5 | **Usage Analyst** (`usage_analyst`) | `Appliances` | Itemizes household appliance power consumption (ACs, geysers, pumps, refrigerators) based on BEE 3-Star standards and computes what percentage of a bill increase is explained by user-reported loads. | 4-question household profile completed in [Bill Comparison](/app/bill-comparison) |
| 6 | **Reports & History** (`reports_history`) | `Audit Trail` | Summarizes field inspection tickets (`INV-YYYYMMDD-XXXX`), status lifecycles (New, In Progress, Verified, Closed), and tracks the 5-point physical verification audit checklist. | Persisted investigations in [Field Investigations](/app/investigations) |
| 7 | **Bill Calculator** (`bill_calculator`) | `Tariff Slabs` | Simulates and calculates illustrative telescopic tariff tiers (Slab 1: 0–100, Slab 2: 101–200, Slab 3: 201+ units), fixed demand charges, 6% electricity duty, and fuel surcharges (FSA) with clearly identified modeling assumptions. | Optional active bill units (or calculates reference tiers: 100, 200, 300 units) |
| 8 | **Electricity Help & Guidance** (`electricity_help`) | `Knowledge` | Step-by-step engineering guidance for the **Switch-Off Creep Test** (diagnosing phantom meter pulsing with main MCB OFF), reading multi-screen digital LCD meters, and disputing spot-billing punch errors. | None (Educational / Regulatory Protocol) |

### 6.2 Plugin Selection & Execution Model
- **General Assistant Default**: By default, the General Assistant chip is active, providing broad conversational Q&A and cross-domain guidance.
- **Specialized Focus**: Clicking any specialized plugin (e.g., *Bill Calculator* or *Theft Screening*) immediately focuses the assistant persona and data grounding on that domain, deselecting General Mode.
- **Multi-Select Capability**: Users can select multiple complementary plugins simultaneously (e.g., *Bill Comparison* + *Bill Calculator* + *Usage Analyst*).
- **One-Click Reset**: Clicking *General Assistant* clears specialized selections and restores baseline mode. Deselecting all specialized chips also smoothly reverts to General Assistant.
- **Direct 1-Click Execution**: Each plugin chip features a quick **Run** action button allowing users to execute the underlying tool with one click without typing a prompt. The Tools Menu dropdown (`ChatToolsMenu`) also provides immediate access to all 8 plugins.

### 6.3 User Data Isolation & Security Safeguards
- **Zero Cross-Account Leakage**: Demo datasets (`DEMO_CUSTOMERS`, synthetic bills) are strictly isolated from authenticated accounts. If an authenticated user runs a tool without uploaded data, the assistant reports an empty state with direct navigation links—never falling back to synthetic demo rows.
- **Client-Side Privacy**: OCR execution via Tesseract.js occurs 100% within the user's browser using local trained models. Raw OCR text, camera photos, and document binaries are **never** transmitted to backend servers or logged in database records.
- **Supabase Session Scoping**: Authenticated queries to `/ml/v1/*` carry the active Supabase JWT Bearer token, strictly enforcing Row Level Security (RLS) on all database tables.

### 6.4 Realistic Limitations & Responsible AI Principles
- **Triage Indicator, Not Proof of Theft**: Uncalibrated model screening scores identify consumption distribution anomalies to help utility managers prioritize physical site inspections. A high score **never** constitutes legal proof of electricity theft, meter tampering, or unlawful abstraction.
- **Benign Explanations**: Sharp drops in consumption frequently stem from legitimate non-theft causes, including extended family vacations, property vacancy, seasonal shutdowns, rooftop solar net-metering, or faulty meter wiring. Inspection crews must complete the physical 5-point audit checklist before drawing conclusions.
- **OCR Legibility**: Browser-based OCR depends on image clarity, lighting, and resolution of spot-billing paper slips. Creased, faded thermal paper, or low-resolution scans require manual verification via the editable field inputs in Bill Comparison.
- **Offline Deterministic Fallback**: If the backend machine learning API or remote database service is unreachable, the frontend seamlessly transitions to local deterministic rule engines so billing reviews and demonstrations continue uninterrupted.

---

## 7. Screenshot Gallery

<!-- Replace placeholders with actual application screenshots when deploying -->
| Dashboard Overview | ML Batch Screening |
| :---: | :---: |
| *[Screenshot Placeholder: Dashboard KPIs, Band Distribution & Open Tickets]* | *[Screenshot Placeholder: CSV Upload, 13-Feature Validation & Chunked Scoring]* |

| Customer Detail & Risk Scale | Investigation Audit Ticket |
| :---: | :---: |
| *[Screenshot Placeholder: Results Drawer, Model Score Scale & CSV Export]* | *[Screenshot Placeholder: Investigation Queue, Status & 5-Point Checklist]* |

| Spot-Billing OCR Extraction | Reading Discrepancy Flag |
| :---: | :---: |
| *[Screenshot Placeholder: Spot-Bill Upload & Reading Table Parser]* | *[Screenshot Placeholder: Arithmetic Discrepancy Alert & Ticket Creation]* |

---

## 8. Project Directory Structure

```
TheftGuard-AI/
├── README.md                                 # Root platform documentation & restoration guide
├── LICENSE                                   # MIT License
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

## 9. Restoration & Recovery Guide (Step-by-Step)

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

## 10. Troubleshooting & FAQ

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| `model_unavailable: model_file_not_found` | Model binary missing from `ml-service` | Copy `validated_candidate_pipeline.joblib` from backup into `ml-service\` and verify `THEFTGUARD_MODEL_PATH` in `.env`. |
| `model_unavailable: model_hash_mismatch` | Model file corrupted or modified | Re-copy `validated_candidate_pipeline.joblib` from backup; ensure SHA-256 matches `442981aa7f...`. |
| `database_unavailable` (503) / fallback to local tickets | Database URL missing or network offline | Verify `THEFTGUARD_DATABASE_URL` in `ml-service/.env`. Note: Frontend remains usable in local session fallback mode. |
| Browser shows network error calling `/ml/*` | Backend service not running on port 8000 | Ensure FastAPI backend is active in Terminal 1. Vite dev server proxies `/ml` to `http://127.0.0.1:8000`. |
| Batch with $> 100$ rows only partially showing | Legacy pagination truncation | Version 1.0.0 includes `getBatchWithAllRecords` which transparently pages through all rows. |

---

## 11. Security & Local Evaluation Boundaries

> [!WARNING]
> **Local / Demo Evaluation Only:**
> TheftGuard AI Version 1.0.0 is stabilized and verified for local development, workstation demonstration, and offline evaluation. It is **not** currently hardened or approved for public cloud exposure.

### Production Readiness Prerequisites (Required for Phase 4):
1. **Authentication & Authorization:** The persistence endpoints (`/v1/batches`, `/v1/investigations`) are unauthenticated. Production requires JWT authentication (e.g. Supabase Auth) and role-based access control.
2. **Reverse Proxy & TLS:** Production deployments must terminate TLS behind Nginx or an API gateway, not the Vite dev proxy.
3. **CORS & Rate Limiting:** Enforce restrictive CORS origins and request rate limits on `/v1/predict-batch` and `/v1/batches`.
4. **Database Connection Pooling:** Use Supabase Session Pooler (Port 5432) or PgBouncer with dedicated non-superuser credentials.

---

## 12. Author & Developer

- **Developer:** Balraj Pranay Kumar
- **GitHub Profile:** [https://github.com/balrajpranay](https://github.com/balrajpranay)
- **Repository:** [https://github.com/balrajpranay/TheftGuard-AI](https://github.com/balrajpranay/TheftGuard-AI)
