# TheftGuard AI — Electricity Theft Detection & Investigation Audit Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI: 0.115+](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React: 18.3](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite: 5.4](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS: 3.4](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL: 15+](https://img.shields.io/badge/PostgreSQL-15%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase Auth](https://img.shields.io/badge/Supabase-Auth%20%26%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tests: 533 total, 531 passed, 2 skipped](https://img.shields.io/badge/Tests-533_total%2C_531_passed%2C_2_skipped-brightgreen)](theftguard-ai-frontend/frontend/test)

> **Live Application:** [https://theft-guard-ai-z9tb.vercel.app](https://theft-guard-ai-z9tb.vercel.app)
> **Backend Service:** Deployed on Render (`https://theftguard-ai.onrender.com`)
> **Academic Context:** Bachelor of Technology Final-Year Machine Learning Capstone / Portfolio Project
> **Author:** Balraj Pranay Kumar ([@balrajpranay](https://github.com/balrajpranay))

---

## Table of Contents

1. [Executive Overview & Problem Statement](#1-executive-overview--problem-statement)
2. [Key Implemented Capabilities](#2-key-implemented-capabilities)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture & Data Flow](#4-system-architecture--data-flow)
5. [Machine Learning Pipeline & Evaluation Metrics](#5-machine-learning-pipeline--evaluation-metrics)
6. [Dataset Description & Attribution](#6-dataset-description--attribution)
7. [Application UI Tour & Workflow](#7-application-ui-tour--workflow)
8. [AI Assistant Plugins & Grounded Tools](#8-ai-assistant-plugins--grounded-tools)
9. [Database Schema & Row Level Security](#9-database-schema--row-level-security)
10. [Local Installation & Setup Guide](#10-local-installation--setup-guide)
11. [Environment Variables Configuration](#11-environment-variables-configuration)
12. [Running the Application](#12-running-the-application)
13. [Verification & Automated Test Suite](#13-verification--automated-test-suite)
14. [Deployment Architecture](#14-deployment-architecture)
15. [Responsible AI Principles & Ethical Use](#15-responsible-ai-principles--ethical-use)
16. [Current Limitations & Future Enhancements](#16-current-limitations--future-enhancements)
17. [Repository Structure](#17-repository-structure)
18. [License & Attribution](#18-license--attribution)

---

## 1. Executive Overview & Problem Statement

Non-technical losses (NTLs)—primarily electricity theft, meter tampering, illegal line tapping, and spot-billing punch errors—cause billions of dollars in lost revenue for electrical distribution utilities worldwide. In emerging distribution networks, utilities often lose between 10% and 30% of supplied energy to unmetered consumption.

Traditional utility field auditing relies heavily on random manual inspections or tip-offs. This approach has critical flaws:
- **Low Hit-Rate & Resource Drain:** Field teams inspect hundreds of compliant consumers to locate a handful of tampered meters.
- **Billing Punch Errors:** Billing personnel frequently mistype digital meter LCD readings on spot-billing thermal printers, creating artificial billing disputes that are mistakenly flagged as theft.
- **Black-Box Skepticism:** Field engineers and legal adjudicators reject opaque machine learning predictions without transparent decision thresholds, feature baselines, or physical verification audit trails.

**TheftGuard AI** is an integrated machine learning decision support and field audit platform designed for utility operators. It combines high-throughput statistical anomaly screening, client-side optical character recognition (OCR) of spot bills, relational investigation ticket management, and an interactive domain-grounded conversational assistant.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  TheftGuard AI Workflow                                 │
├─────────────────┬─────────────────┬───────────────────┬────────────────┬────────────────┤
│ 1. Batch Upload │  2. ML Anomaly  │ 3. Client-Side    │ 4. Relational  │ 5. Physical    │
│    (13-Feature  │     Screening   │    Spot-Bill OCR  │    Audit Trail │    Verification│
│    CSV Records) │  (Random Forest)│  (Arithmetic Check│ (INV-YYYYMMDD) │    Checklist   │
└─────────────────┴─────────────────┴───────────────────┴────────────────┴────────────────┘
```

---

## 2. Key Implemented Capabilities

### 🔍 1. High-Throughput Machine Learning Screening
- **13 Engineered Consumption Features:** Evaluates statistical consumption metrics (valid readings, zero counts, positive percentages, observed means/medians/standard deviations) instead of raw 1,000+ day time-series.
- **Client-Side Data Validation:** Pre-validates CSV uploads against feature ranges, missing values, and formatting rules before network transmission.
- **Chunked Batch Scoring:** Streams rows in 50-row chunks with live progress meters, preventing browser freezes during multi-thousand-row uploads.
- **SHA-256 Model Integrity Check:** Enforces cryptographic hash verification (`442981aa7f...`) at FastAPI server startup before accepting scoring requests.

### 📊 2. Transparent 3-Tier Risk Classification
Avoids opaque binary verdicts by segmenting uncalibrated model scores into clear operational triage bands:
- **Normal (`Score < 0.30`):** Consistent with typical consumer profiles in the training distribution.
- **Elevated Risk (`0.30 ≤ Score < 0.50`):** Moderate consumption irregularities warranting routine review.
- **Review Recommended (`Score ≥ 0.50`):** Significant statistical anomaly pattern resembling labeled abnormal training records.

### 🧾 3. Spot-Billing OCR & Arithmetic Audit
- **In-Browser Tesseract.js OCR:** Scans paper electricity receipts locally using offline trained data (`eng.traineddata`).
- **Arithmetic Punch-Error Detection:** Validates physical billing arithmetic:
  $$\text{Units Billed} \stackrel{?}{=} (\text{Current Reading} - \text{Previous Reading}) \times \text{Multiplier}$$
  Distinguishes meter reader typographical errors from actual consumer energy theft.
- **Strict Data Minimization:** Full-page camera photos, PDFs, and raw OCR text dumps are processed purely in-memory and are never stored or transmitted to backend servers.

### ⚖️ 4. Dual-Bill Comparison & Household Profiling
- **Calendar-Normalized Burn Rates:** Computes normalized daily consumption rates ($\text{kWh/day}$), billing shifts (₹), and effective unit costs ($\text{₹/kWh}$) across consecutive billing cycles.
- **Appliance Load Modeling:** A 4-question household load questionnaire estimates expected consumption based on BEE 3-Star appliance standards (air conditioners, geysers, pumps, refrigeration).

### 📋 5. Field Investigation Ticketing & 5-Point Audit
- **Relational Ticket Lifecycle:** Automatically creates formal investigation tickets (`INV-YYYYMMDD-XXXX`) tracking status progression (`New` $\rightarrow$ `In Progress` $\rightarrow$ `Verified` $\rightarrow$ `Closed`).
- **5-Point Physical Inspection Checklist:** Requires on-site verification before drawing conclusions:
  1. Meter box seal integrity (unbroken / tampered / missing)
  2. Terminal cover and bypass wiring check
  3. Optical port test and display pulse inspection
  4. Neutral loop and earth leakage measurement
  5. Connected load verification against sanctioned load (kW)

### 💬 6. Grounded AI Assistant & 8 Specialized Plugins
- **Deterministic & Grounded Tools:** Dedicated chat workspace (`/app/chat`) and global floating drawer with 8 selectable plugins operating on real session data.
- **Zero Hallucination Guarantee:** Tools report missing prerequisite data rather than generating speculative or fabricated responses.
- **Offline Fallback Engine:** Operates autonomously in local/offline mode if external AI provider keys are unconfigured.

### 🌐 7. Multilingual Support & Accessible Ergonomics
- **4 Languages Supported:** Dynamic real-time language switching across English, Hindi (हिन्दी), Telugu (తెలుగు), and Tamil (தமிழ்).
- **Collapsible Desktop Rail:** Collapsible navigation rail (expanded 256px to collapsed 64px) with floating tooltips and keyboard shortcuts (`Ctrl+Shift+S`).
- **Independent Workspace Scrolling:** Stationary full-height desktop sidebar (`h-screen`) paired with an independently scrollable content area (`overflow-y-auto`).
- **Interactive Onboarding Guide:** 8-step product walkthrough with spotlight SVG masking, first-login Welcome Modal, and persistent Help Guide replay.

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose & Architectural Role |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | `18.3.1` | Single-page application, component hierarchy, responsive UI |
| **Build Tool & Bundler** | Vite | `5.4.11` | Build tooling, Hot Module Replacement, and development reverse proxy |
| **Routing** | React Router DOM | `6.28.0` | Client-side routing, protected workspace routes, public views |
| **Styling & Design** | Tailwind CSS | `3.4.17` | Utility-first styling with custom palette (`ink`, `gold`, `mist`, `pale`) |
| **Data Visualization** | Recharts | `2.15.0` | Risk distribution bar charts, trend curves, and metric badges |
| **Client-Side OCR** | Tesseract.js | `7.0.0` | Browser-based offline OCR using local `eng.traineddata` model |
| **Client Auth SDK** | Supabase JS | `2.118.0` | Authentication session management, Google OAuth, and JWT handling |
| **Backend Framework** | FastAPI | `0.115+` | Asynchronous REST API, Pydantic v2 schemas, and dependency injection |
| **ASGI Server** | Uvicorn (standard) | `0.30+` | High-performance ASGI production server |
| **ML Engine & Pipeline** | Scikit-Learn | `1.5+` | 250-tree Random Forest pipeline with median SimpleImputer |
| **Data Processing** | Pandas & NumPy | `2.2+` | Array operations, DataFrame parsing, and bounds validation |
| **Object Serialization** | Joblib | `1.4+` | Pipeline binary loading and model metadata extraction |
| **Database ORM** | SQLAlchemy | `2.0+` | Relational mapping, transactional scopes, and repository patterns |
| **Database Driver** | Psycopg v3 | `3.1+` | High-performance PostgreSQL database adapter |
| **JWT Verification** | PyJWT (crypto) | `2.8+` | Cryptographic JWT verification (ES256, RS256, HS256) |
| **Database Service** | PostgreSQL (Supabase) | `15+` | Relational audit storage with Row Level Security (RLS) policies |
| **Testing Frameworks** | Node.js Test / Playwright | `v20+` / `1.64` | 296 frontend unit tests + 77 end-to-end browser tests |
| **Backend Testing** | Python `unittest` | `3.10+` | 160 backend unit and integration test cases |

---

## 4. System Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Client Browser (SPA)                                  │
│   React 18 / Tailwind CSS / Recharts / Tesseract.js OCR / Context Stores               │
│   Routes: /app/dashboard, /app/screening, /app/results, /app/investigations, /app/chat  │
└────────────────────────────┬───────────────────────────────┬────────────────────────────┘
                             │                               │
                Vite Proxy / │ (Direct Browser SDK)          │ HTTP Bearer JWT
                Vercel API   │                               │ to /ml/v1/*
                             ▼                               ▼
               ┌───────────────────────────┐   ┌──────────────────────────────────────────┐
               │    Supabase Auth & RLS    │   │         FastAPI Backend Service          │
               │  - Email/Password Auth    │   │  - Uvicorn (port 8000 / Render)          │
               │  - Google OAuth 2.0       │   │  - PyJWT Token Signature Verification    │
               │  - Auto-Confirmed Signup  │   │  - Pydantic v2 Input Bounds Validation   │
               └─────────────┬─────────────┘   └─────────────┬────────────────────────────┘
                             │                               │
                             │ Authenticated                 │ SQLAlchemy 2.0 ORM
                             │ Queries                       │ (Psycopg v3 pool)
                             ▼                               ▼
               ┌──────────────────────────────────────────────────────────────────────────┐
               │                  PostgreSQL Database (Supabase / Local)                  │
               │  Tables: screening_batches, screening_records, investigations,           │
               │          bill_extractions, schema_migrations                             │
               │  Security: Row Level Security (RLS) enabled on all tables                │
               └──────────────────────────────────────────────────────────────────────────┘
```

### Network Security & Data Flow Guarantees
1. **Network Isolation:** Browser clients connect to backend persistence endpoints through the reverse proxy (`/ml/*` mapped to `:8000`), preventing public exposure of database connection strings or infrastructure credentials.
2. **Stateless JWT Validation:** Every request to `/v1/batches`, `/v1/investigations`, and `/v1/bill-extractions` carries a Supabase Bearer token verified against Supabase public keys or HMAC secrets.
3. **Data Minimization:** No raw billing slip photographs, PDFs, or unparsed text dumps are accepted by the backend or stored in database columns. Only parsed meter readings and numerical discrepancy flags are retained.

---

## 5. Machine Learning Pipeline & Evaluation Metrics

The machine learning core uses an immutable, cryptographically verified Scikit-learn candidate pipeline (`validated_candidate_pipeline.joblib`).

```
Raw Readings Time-Series (1,034 dates)
  │
  ▼ [Feature Engineering]
13 Statistical Summary Features per Customer
  │
  ▼ [Scikit-learn Pipeline]
Median SimpleImputer (with missing value indicators) ──> 21 Total Model Inputs
  │
  ▼
RandomForestClassifier (250 Trees, class_weight='balanced')
  │
  ▼
Uncalibrated Vote Fraction (model_score: 0.0 to 1.0)
```

### Verified Model Architecture & Integrity
- **Pipeline Type:** `scikit-learn.pipeline.Pipeline`
- **Imputer:** `SimpleImputer(strategy='median', add_indicator=True)`
- **Classifier:** `RandomForestClassifier(n_estimators=250, class_weight='balanced', random_state=42)`
- **Model Inputs:** 13 engineered features expanded to 21 inputs with missing-value indicators.
- **Expected SHA-256 Hash:**
  ```
  442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5
  ```

### The 13 Engineered Input Features

| # | Feature Identifier | Mathematical Basis | Missing in Training |
|---|---|---|:---:|
| 1 | `valid_readings` | Count of finite, recorded daily readings | No |
| 2 | `missing_percent` | Percentage of unrecorded dates ($[1034 - \text{valid}] / 1034 \times 100$) | No |
| 3 | `zero_count` | Number of days with zero electricity consumption | No |
| 4 | `zero_percent_of_observed` | Zero days divided by valid recorded days ($\%$) | Yes (5 rows) |
| 5 | `mean_observed` | Arithmetic mean across observed non-null days | Yes (5 rows) |
| 6 | `median_observed` | Median consumption across observed days | Yes (5 rows) |
| 7 | `std_observed` | Standard deviation across observed days | Yes (5 rows) |
| 8 | `min_observed` | Minimum daily consumption recorded | Yes (5 rows) |
| 9 | `max_observed` | Peak daily consumption recorded | Yes (5 rows) |
| 10 | `mean_positive` | Mean consumption excluding zero-reading days | Yes (2,114 rows) |
| 11 | `median_positive` | Median consumption excluding zero-reading days | Yes (2,114 rows) |
| 12 | `positive_readings` | Count of days with consumption $> 0$ | No |
| 13 | `positive_percent_of_all_dates` | Positive days divided by total monitoring window | No |

### Quantitative Evaluation on Held-Out Test Split (8,475 Rows)

The candidate pipeline was evaluated on a held-out test split of 8,475 customer records with verified ground truth:

| Metric | Measured Result | Interpretation / Operational Meaning |
| :--- | :---: | :--- |
| **Accuracy** | **87.04%** | Overall correct classifications across both classes |
| **Balanced Accuracy** | **64.14%** | Average recall across normal and anomalous classes |
| **ROC-AUC** | **0.7407** | Ranking quality across discrimination thresholds |
| **PR-AUC (Avg Precision)** | **0.2742** | Precision-Recall curve area (benchmark baseline: 0.0853) |
| **Precision (FLAG = 1)** | **29.24%** | True positive rate among all flagged customer accounts |
| **Recall (FLAG = 1)** | **36.51%** | Fraction of actual labeled anomalies successfully flagged |
| **F1 Score (FLAG = 1)** | **0.3247** | Harmonic mean of precision and recall for class 1 |

### Confusion Matrix (Test Split: 8,475 Customers)

| Actual \ Predicted | Predicted Normal (0) | Predicted Suspicious (1) | Total Actual |
| :--- | :---: | :---: | :---: |
| **Actual Normal (0)** | **7,113** (True Negatives) | **639** (False Positives) | 7,752 |
| **Actual Flagged (1)** | **459** (False Negatives) | **264** (True Positives) | 723 |
| **Total Predicted** | 7,572 | 903 | **8,475** |

### Cross-Validation Model Comparison

During model development, four candidate architectures were benchmarked under identical cross-validation conditions:

| Candidate Model | Mean Cross-Validation F1 | Notes / Selection Rationale |
| :--- | :---: | :--- |
| **Random Forest (Balanced)** | **0.3165** | **Selected candidate** — highest F1 and stable precision |
| **Logistic Regression (Balanced)** | 0.2487 | Underperformed on non-linear interaction features |
| **Random Forest (Baseline)** | 0.1095 | Severely impaired by extreme class imbalance ($91.5\% / 8.5\%$) |
| **Logistic Regression (Baseline)** | 0.0671 | Failed to converge to actionable decision boundaries |

---

## 6. Dataset Description & Attribution

The model was developed using the benchmark electricity consumption dataset originally released by the State Grid Corporation of China (SGCC), widely adopted in academic research for non-technical loss detection.

### Dataset Profile
- **Total Customer Records:** 42,372 accounts
- **Time-Series Monitoring Window:** 1,034 consecutive daily consumption readings (~2.8 years)
- **Total Data Cells:** 43,897,392 readings
- **Missing Reading Rate:** 25.59% (11,233,528 missing readings) reflecting real-world AMI communication drops
- **Zero-Consumption Days:** 5,788,603 readings
- **Class Distribution:**
  - `FLAG = 0` (Normal Consumption): 38,757 customers (**91.47%**)
  - `FLAG = 1` (Anomalous / Flagged): 3,615 customers (**8.53%**)
- **Customer Feature Compression:** To enable real-time web screening without uploading multi-megabyte raw time-series matrices, the 1,034 daily columns were compressed into the 13 statistical summary features described above.

---

## 7. Application UI Tour & Workflow

The TheftGuard AI authenticated interface is organized into a clean, purpose-driven navigation workflow:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] TheftGuard AI      [Language: EN/HI/TE/TA]             [Signed in as: Operator] │
├─────────────────┬──────────────────────────────────────────────────────────────────────┤
│  Navigation     │  Workspace Content                                                   │
│  ├ Dashboard    │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  ├ Screening    │  │ High Risk (≥0.50)│  │ Elevated (0.3-0.5│  │ Normal (<0.30)   │    │
│  ├ Results      │  │     264 Accounts │  │     639 Accounts │  │   7,113 Accounts │    │
│  ├ Bill Upload  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
│  ├ Bill Compare │                                                                      │
│  ├ Tickets      │  Recent Screening Batches & Investigation Tickets                    │
│  ├ Reports      │  ┌────────────────────────────────────────────────────────────────┐  │
│  ├ AI Chat      │  │ INV-20261025-0104 | Meter Bypass Detected | Status: In Progress│  │
│  └ Model Info   │  └────────────────────────────────────────────────────────────────┘  │
└─────────────────┴──────────────────────────────────────────────────────────────────────┘
```

1. **Dashboard Overview (`/app/dashboard`):** High-level operational command center showing total screened accounts, risk distribution bar charts, active investigation tickets, and immediate quick-action cards.
2. **ML Screening (`/app/screening`):** Drag-and-drop CSV batch upload. Pre-validates feature boundaries in the browser and streams chunks to `/v1/predict-batch` with real-time progress visualization.
3. **Customer Results (`/app/results`):** Interactive results table sortable by Model Score. Clicking any customer opens a sliding detail drawer showing all 13 feature values, visual risk gauges, and a 1-click **Create Investigation Ticket** button.
4. **Spot-Bill OCR Upload (`/app/bill-upload`):** Scans spot-billing paper slips. Automatically parses Consumer Number, Previous Reading, Current Reading, Units Billed, and Multiplier.
5. **Dual-Bill Comparison (`/app/bill-comparison`):** Compares consecutive utility bills side by side with calendar-normalized daily burn rates and an appliance load itemizer.
6. **Field Investigations (`/app/investigations`):** Manages formal audit tickets (`INV-YYYYMMDD-XXXX`), assigning field teams and tracking completion of the mandatory 5-point physical verification checklist.
7. **Reports & Export (`/app/reports`):** Generates executive compliance audit summaries with instant CSV export and formatted print-ready PDF generation.
8. **Model Information (`/app/model`):** Transparently exposes model metadata, the SHA-256 integrity hash, training boundaries, confusion matrices, and scientific disclaimer notes.

---

## 8. AI Assistant Plugins & Grounded Tools

TheftGuard AI incorporates an interactive domain-grounded assistant available through both a dedicated full-screen workspace (`/app/chat`) and a persistent slide-over drawer accessible via the floating lightning bolt (`⚡`) button.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Select Assistant Tools                               │
│ [All-in-One: General] [Dual-Bill: Comparison] [OCR: Audit] [Screening: Anomaly]  │
│ [Load: Appliances]    [Audit: Tickets]        [Tariff: Slabs] [Help: Creep Test] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### The 8 Grounded Plugins

| # | Plugin Name | ID | Badge | Real Grounded Data Operation |
|---|---|---|---|---|
| 1 | **General Assistant** | `general_assistant` | `All-in-One` | Default assistant. Explains concepts (kWh, sanctioned load, power factor, power vs energy), guides application navigation, and synthesizes cross-domain data. |
| 2 | **Bill Comparison** | `bill_comparison` | `Dual-Bill` | Computes verified energy shifts (kWh), daily burn rates (`kWh/day`), billing amount delta (₹), and unit cost shifts (`₹/kWh`). |
| 3 | **Bill Upload & OCR** | `bill_upload_ocr` | `OCR Audit` | Audits spot-billing slips, confirms arithmetic consistency, and checks for meter punch errors before field deployment. |
| 4 | **Theft Screening** | `theft_screening` | `ML Screening` | Evaluates consumption anomaly batches, score distributions, and groups accounts into Review, Elevated, and Normal triage bands. |
| 5 | **Usage Analyst** | `usage_analyst` | `Appliances` | Itemizes household appliance consumption (ACs, geysers, pumps, refrigerators) based on BEE 3-Star standards and compares against reported usage. |
| 6 | **Reports & History** | `reports_history` | `Audit Trail` | Summarizes open field inspection tickets (`INV-YYYYMMDD-XXXX`), status lifecycles, and audits 5-point physical verification checklists. |
| 7 | **Bill Calculator** | `bill_calculator` | `Tariff Slabs` | Simulates telescopic tariff slabs, fixed demand charges, electricity duty, and fuel surcharges under clearly stated assumptions. |
| 8 | **Electricity Help** | `electricity_help` | `Knowledge` | Step-by-step engineering protocols for the **Switch-Off Creep Test** (diagnosing phantom meter pulsing with main MCB OFF) and disputing billing punch errors. |

---

## 9. Database Schema & Row Level Security

The persistent audit backend uses PostgreSQL (hosted on Supabase) configured with Row Level Security (RLS) on all tables.

```
┌───────────────────────────────────────────┐
│             screening_batches             │
│  - id: UUID (PK)                          │
│  - file_name: VARCHAR(255)                │
│  - record_count: INTEGER                  │
│  - model_sha256: VARCHAR(64)              │
│  - created_by: UUID (FK auth.users)       │
└─────────────────────┬─────────────────────┘
                      │ 1:N
                      ▼
┌───────────────────────────────────────────┐       ┌───────────────────────────────────────────┐
│             screening_records             │       │               investigations              │
│  - id: UUID (PK)                          │       │  - id: UUID (PK)                          │
│  - batch_id: UUID (FK)                    │ 1:1   │  - ticket_code: VARCHAR(32) (UNIQUE)      │
│  - customer_id: VARCHAR(64)               ├───────►  - screening_record_id: UUID (FK)         │
│  - model_score: DOUBLE PRECISION          │       │  - status: VARCHAR(32)                    │
│  - predicted_label: INTEGER               │       │  - checklist_state: JSONB                 │
│  - risk_band: VARCHAR(32)                 │       │  - created_by: UUID (FK auth.users)       │
└───────────────────────────────────────────┘       └───────────────────────────────────────────┘
```

### Table Specifications
1. `screening_batches`: Records metadata for each uploaded CSV batch, including row count, model SHA-256 hash, and uploading user ID.
2. `screening_records`: Holds individual screened consumer rows with their 13 feature values, model score, predicted label, and triage band.
3. `investigations`: Manages audit tickets (`INV-YYYYMMDD-XXXX`), status lifecycle, notes, and the 5-point physical verification checklist state.
4. `bill_extractions`: Stores verified numerical meter readings and discrepancy flags extracted via spot-bill OCR.
5. `schema_migrations`: Immutable ledger tracking applied migration scripts (`001_phase2_initial_schema.sql`, `002_add_created_by_to_bill_extractions.sql`).

---

## 10. Local Installation & Setup Guide

### Prerequisites
- **Python:** Version 3.10 to 3.13 (tested on 3.13)
- **Node.js:** Version 18 or newer (tested on Node 20 and 24; npm 10+)
- **Git:** Standard version control
- **Database:** Supabase PostgreSQL instance (or local PostgreSQL 15+)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/balrajpranay/TheftGuard-AI.git
cd TheftGuard-AI
```

---

### Step 2: Restore the ML Model Binary
Because machine learning binary files (`.joblib`) are excluded from Git version control, ensure the verified pipeline binary is placed in `ml-service/`:
- **Destination:** `ml-service/validated_candidate_pipeline.joblib`

Verify the file's SHA-256 hash:
```powershell
# Windows PowerShell:
(Get-FileHash -Path "ml-service\validated_candidate_pipeline.joblib" -Algorithm SHA256).Hash.ToLower()

# Linux / macOS:
sha256sum ml-service/validated_candidate_pipeline.joblib
```
**Expected Output:** `442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5`

---

### Step 3: Apply Database Schema Migrations
Execute the SQL migration scripts in order against your Supabase or local PostgreSQL database using the Supabase SQL Editor or `psql`:
1. `ml-service/migrations/sql/001_phase2_initial_schema.sql`
2. `ml-service/migrations/sql/002_add_created_by_to_bill_extractions.sql`

---

### Step 4: Install Backend Dependencies
```bash
cd ml-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Install exact pinned requirements
pip install -r requirements.txt
```

---

### Step 5: Install Frontend Dependencies
```bash
cd ../theftguard-ai-frontend/frontend
npm install
```

---

## 11. Environment Variables Configuration

### Backend Configuration (`ml-service/.env`)
Copy `ml-service/.env.example` to `ml-service/.env`:

```ini
# Path to the restored model pipeline
THEFTGUARD_MODEL_PATH=validated_candidate_pipeline.joblib
THEFTGUARD_MODEL_SHA256=442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5
THEFTGUARD_ENABLE_DOCS=1
THEFTGUARD_MAX_BODY_BYTES=20971520

# Supabase PostgreSQL Session Pooler connection string (Port 5432)
THEFTGUARD_DATABASE_URL=postgresql+psycopg://postgres.[PROJECT-REF]:[DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require

# Supabase Auth token validation settings
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_JWT_ALGORITHMS=ES256,RS256,HS256
# Optional static public key PEM or HMAC secret:
# SUPABASE_JWT_SECRET=your-jwt-secret
```

### Frontend Configuration (`theftguard-ai-frontend/frontend/.env.local`)
Copy `theftguard-ai-frontend/frontend/.env.example` to `theftguard-ai-frontend/frontend/.env.local`:

```ini
# Supabase Client Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

> [!CAUTION]
> Never commit `.env` or `.env.local` files to version control. Both are excluded in `.gitignore`. Never place service-role keys or database passwords in frontend configuration.

---

## 12. Running the Application

To run the complete application locally, open two terminal windows:

### Terminal 1: FastAPI Backend Service
```powershell
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn service.main:app --host 127.0.0.1 --port 8000
```
- **Service Root:** `http://127.0.0.1:8000`
- **Health Endpoint:** `http://127.0.0.1:8000/v1/health`
- **Interactive OpenAPI Documentation:** `http://127.0.0.1:8000/docs`

### Terminal 2: React Vite Frontend
```powershell
cd theftguard-ai-frontend/frontend
npm run dev
```
- **Local Application:** `http://localhost:5173`
- The Vite development server automatically proxies `/ml/*` requests to the FastAPI backend on `http://127.0.0.1:8000`.
- Click **"Continue to the demo workspace"** on the Sign-in page for instant offline exploration without creating an account.

---

## 13. Verification & Automated Test Suite

TheftGuard AI maintains a comprehensive **533-test automated test suite** (531 passed, 2 skipped) covering backend APIs, frontend unit logic, and full-browser end-to-end user flows.

```
┌────────────────────────────────────────────────────────────────────────┐
│             Total Automated Tests: 533 (531 Passed, 2 Skipped)         │
├─────────────────────────┬──────────────────────┬───────────────────────┤
│ 160 Backend Unit Tests  │ 296 Frontend Unit    │ 77 Playwright E2E     │
│ (158 Passed, 2 Skipped) │ (296 Passed, 0 Fail) │ (77 Passed, 0 Fail)   │
└─────────────────────────┴──────────────────────┴───────────────────────┘
```

- **533 total tests** defined across the project
- **158 backend unit tests passed**
- **2 optional backend tests skipped** (requires `THEFTGUARD_FEATURES_CSV`)
- **296 frontend unit tests passed** (100% pass rate)
- **77 Playwright E2E tests passed** (100% pass rate across desktop, tablet, and mobile)

### 1. Run Backend Unit Tests (160 Tests: 158 Passed, 2 Skipped)
```powershell
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests/unit
```
*Result: `Ran 160 tests ... OK (skipped=2)` (158 passed; 2 optional full-dataset conformance tests skip cleanly when `THEFTGUARD_FEATURES_CSV` is unset).*

### 2. Run Frontend Unit Tests (296 Tests)
```powershell
cd theftguard-ai-frontend/frontend
npm test
```
*Result: `tests 296, pass 296, fail 0` in ~0.5s.*

### 3. Run Playwright End-to-End Tests (77 Tests)
```powershell
cd theftguard-ai-frontend/frontend
npm run test:e2e
```
*Result: `77 passed` across desktop, tablet, and mobile Chromium viewports.*

### 4. Verify Production Build Compilation
```powershell
cd theftguard-ai-frontend/frontend
npm run build
```
*Result: Compiles cleanly with zero JSX/CSS syntax errors.*

---

## 14. Deployment Architecture

The application is deployed across production cloud services:

1. **Frontend (Vercel):** Hosted at [https://theft-guard-ai-z9tb.vercel.app](https://theft-guard-ai-z9tb.vercel.app). Managed via `vercel.json` rewrites that route `/ml/:path*` to the backend and all other routes to `/index.html`.
2. **Backend (Render):** Hosted on Render (`https://theftguard-ai.onrender.com`) running the FastAPI application via Uvicorn.
3. **Database & Auth (Supabase):** PostgreSQL 15 database with Supabase Auth providing JWT generation, user management, and Row Level Security enforcement.

---

## 15. Responsible AI Principles & Ethical Use

> [!IMPORTANT]
> **Decision Support Notice:**
> A high model score ($\ge 0.50$) indicates statistical similarity to consumption anomalies present in the training dataset. **It is an operational triage signal, not legal proof of electricity theft, meter tampering, or fraud.**

### Ethical Safeguards & Operating Constraints
- **Human-in-the-Loop Requirement:** Field inspectors must complete the mandatory 5-point physical verification checklist on-site before issuing any notice or penalty.
- **Benign Explanations for Anomalies:** A sharp drop in electricity consumption frequently results from legitimate non-theft causes, including:
  - Extended consumer travel or seasonal property vacancy
  - Installation of rooftop solar net-metering systems
  - Commercial facility temporary maintenance shutdowns
  - Defective meter wiring or faulty current transformers (CTs)
- **Uncalibrated Model Scores:** The primary model output is termed **Model Score** ($0.0$ to $1.0$). It represents the Random Forest vote fraction for class 1 and must not be communicated to consumers as a calibrated probability of theft.
- **Privacy & Data Minimization:** Spot-billing OCR processes receipts purely within browser memory. Camera images, PDF files, and raw OCR text dumps are never uploaded or retained in database tables.

---

## 16. Current Limitations & Future Enhancements

### Current System Limitations
1. **Whole-Period Summary Features:** The model evaluates aggregate statistical metrics across a monitoring period rather than sequential time-series change detection.
2. **Imbalanced Test Precision:** Precision on the held-out test split is 29.24%, reflecting real-world utility class imbalance ($91.5\% / 8.5\%$). Approximately 2 out of 3 flagged accounts in the top band are false positives that must be filtered through desk review.
3. **Paper Slip OCR Variability:** Browser-based OCR depends on lighting, paper crease conditions, and camera focus. Faded thermal receipts require manual verification via the editable input fields.

### Planned Enhancements
- [ ] **Automated Metering Infrastructure (AMI) Streaming:** Real-time ingestion of hourly smart-meter telemetry via Apache Kafka / MQTT.
- [ ] **Solar Disentanglement Module:** Net-metering solar generation profile subtraction to reduce false-positive rates on green prosumers.
- [ ] **Calibrated Probability Outputs:** Isotonic regression or Platt scaling calibration on recent geographic validation splits.
- [ ] **Mobile Field PWA:** Progressive Web App with offline caching and GPS-stamped photo capture for field inspection crews.

---

## 17. Repository Structure

```
TheftGuard-AI/
├── README.md                                 # Master platform documentation
├── LICENSE                                   # MIT License
├── API_CONTRACTS.md                          # REST API endpoint specifications & contracts
├── .gitignore                                # Git ignore rules
│
├── ml-service/                               # Backend FastAPI application
│   ├── requirements.txt                      # Pinned Python dependencies
│   ├── .env.example                          # Backend environment template
│   ├── service/                              # Core application code
│   │   ├── main.py                           # FastAPI application & router assembly
│   │   ├── auth.py                           # Supabase JWT token verification
│   │   ├── persistence_routes.py             # Authenticated database persistence endpoints
│   │   ├── assistant_routes.py               # AI Assistant endpoints & tool execution
│   │   ├── scoring.py                        # Model loading & batch scoring logic
│   │   ├── validation.py                     # Pydantic input bounds validation
│   │   ├── validation_config.py              # Feature schemas & allowed ranges
│   │   ├── model_metadata.json               # Recorded evaluation metrics & SHA-256 hash
│   │   ├── training_ranges.json              # Historical dataset feature boundaries
│   │   └── db/                               # Database access layer
│   │       ├── models.py                     # SQLAlchemy ORM models (5 tables)
│   │       ├── repositories.py               # Database CRUD operations
│   │       ├── schemas.py                    # Pydantic request/response schemas
│   │       └── session.py                    # Session engine lifecycle
│   ├── migrations/sql/                       # PostgreSQL schema migrations
│   │   ├── 001_phase2_initial_schema.sql
│   │   └── 002_add_created_by_to_bill_extractions.sql
│   └── tests/unit/                           # 160 backend unit tests
│
└── theftguard-ai-frontend/                   # Frontend React application
    └── frontend/
        ├── package.json                      # Pinned npm dependencies & scripts
        ├── vite.config.js                    # Vite configuration with /ml reverse proxy
        ├── tailwind.config.js                # Custom color palette & responsive typography
        ├── vercel.json                       # Production Vercel deployment configuration
        ├── .env.example                      # Frontend environment template
        ├── eng.traineddata                   # Offline OCR language model
        ├── src/
        │   ├── App.jsx                       # Master client-side routing
        │   ├── components/                   # UI primitives, AppShell, drawers, modals
        │   ├── context/                      # Auth, Onboarding, and Language state providers
        │   ├── lib/                          # API clients (dbApi, mlApi), parsers, CSV export
        │   ├── pages/                        # Dashboard, Screening, Results, Investigations,
        │   │                                 # BillUpload, BillComparison, Reports, Chat, Model
        │   └── state/                        # Global state management & offline fallback
        ├── test/                             # 296 frontend unit tests
        └── e2e/                              # 77 Playwright browser end-to-end tests
```

---

## 18. License & Attribution

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

### Citation & Attribution
If you reference or use this project in an academic paper, capstone demonstration, or research study, please attribute:

```bibtex
@misc{theftguard_ai_2026,
  author = {Balraj Pranay Kumar},
  title = {TheftGuard AI: Machine Learning Decision Support & Field Audit Platform for Electricity Distribution Utilities},
  year = {2026},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/balrajpranay/TheftGuard-AI}}
}
```

---
*Developed with precision for electrical distribution reliability, financial loss reduction, and transparent machine learning governance.*
