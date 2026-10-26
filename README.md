# TheftGuard AI — Electricity Theft Detection & Field Audit Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI: 0.115+](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React: 18.3](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite: 5.4](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS: 3.4](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL: 15+](https://img.shields.io/badge/PostgreSQL-15%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase Auth & RLS](https://img.shields.io/badge/Supabase-Auth%20%26%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tests: 565 total (563 passed, 2 skipped)](https://img.shields.io/badge/Tests-565_total%2C_563_passed%2C_2_skipped-brightgreen)](#16-current-verified-test-counts)

> **Live Application:** [https://theft-guard-ai-z9tb.vercel.app](https://theft-guard-ai-z9tb.vercel.app)<br/>
> **Backend Service:** Deployed on Render (`https://theftguard-ai.onrender.com`)<br/>
> **Academic Context:** Bachelor of Technology Final-Year Machine Learning Capstone / Portfolio Project<br/>
> **Author:** Balraj Pranay Kumar ([@balrajpranay](https://github.com/balrajpranay))

---

## Table of Contents

1. [Project Overview & Summary](#1-project-overview--summary)
2. [Problem Statement](#2-problem-statement)
3. [Objectives & Intended Stakeholders](#3-objectives--intended-stakeholders)
4. [Key Implemented Features](#4-key-implemented-features)
5. [Technology Stack](#5-technology-stack)
6. [Architecture & Request/Data Flow](#6-architecture--requestdata-flow)
7. [Machine Learning Pipeline & Evaluation Metrics](#7-machine-learning-pipeline--evaluation-metrics)
8. [Electricity-Bill OCR & Comparison Workflows](#8-electricity-bill-ocr--comparison-workflows)
9. [Investigation Ticket Lifecycle & Duplicate Prevention](#9-investigation-ticket-lifecycle--duplicate-prevention)
10. [Authentication, Supabase Persistence & User Data Isolation](#10-authentication-supabase-persistence--user-data-isolation)
11. [AI Assistant Plugins & Grounded Tools](#11-ai-assistant-plugins--grounded-tools)
12. [Local Setup & Installation Instructions](#12-local-setup--installation-instructions)
13. [Environment Variable Configuration](#13-environment-variable-configuration)
14. [Running the Application Locally](#14-running-the-application-locally)
15. [Testing Instructions & Verification](#15-testing-instructions--verification)
16. [Current Verified Test Counts](#16-current-verified-test-counts)
17. [Deployment Links & Production Architecture](#17-deployment-links--production-architecture)
18. [Known Limitations & Responsible-Use Disclaimer](#18-known-limitations--responsible-use-disclaimer)
19. [Project Structure & Development Notes](#19-project-structure--development-notes)
20. [License & Citation](#20-license--citation)

---

## 1. Project Overview & Summary

**TheftGuard AI** is an end-to-end machine learning decision support and field audit platform built for electrical distribution utilities. It bridges the gap between high-dimensional statistical anomaly detection and daily utility field operations.

The platform provides:
- **High-throughput ML batch screening** of consumer consumption profiles using an audited 250-tree Random Forest pipeline.
- **Client-side optical character recognition (OCR)** for spot-billing thermal slips and paper receipts to catch meter-reader typographical punch errors before deploying field crews.
- **Relational field investigation management** with duplicate ticket prevention, status lifecycles, and a 5-point physical verification audit trail.
- **Grounded, deterministic conversational assistance** with 8 domain plugins providing zero-hallucination bill explanations, appliance load modeling, and engineering test protocols.
- **Enterprise-grade multi-tenant security** backed by PostgreSQL Row Level Security (RLS) and cryptographically verified Supabase JWTs.

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

## 2. Problem Statement

Non-technical losses (NTLs)—primarily unmetered line tapping, physical meter tampering, neutral loop tampering, and spot-billing data-entry punch errors—cause billions of dollars in revenue leakage annually for power utilities globally. In developing and transitioning networks, NTLs routinely account for 10% to 30% of supplied energy.

Traditional utility field auditing struggles with three systemic challenges:
1. **Low Hit-Rate & Resource Drain:** Field enforcement crews rely on random door-to-door checks or unverified consumer tip-offs, inspecting hundreds of compliant meters to find a single tampered installation.
2. **Billing Punch Errors Mistaken for Theft:** Spot-billing agents operating hand-held thermal printers frequently mistype digital LCD meter readings. These clerical errors produce sudden artificial consumption drops or spikes that look like energy theft on paper, triggering unwarranted disputes.
3. **Black-Box Skepticism & Legal Vulnerability:** Utility enforcement divisions and legal tribunals reject opaque machine learning scores that lack transparent feature baselines, clear triage thresholds, and physical verification audit trails.

---

## 3. Objectives & Intended Stakeholders

### Core Objectives
1. **Operational Triage:** Replace binary black-box verdicts with transparent 3-tier risk bands (`Normal`, `Elevated Risk`, `Review Recommended`) based on 13 compressed consumption features.
2. **Pre-Field Clerical Screening:** Verify spot-billing arithmetic on the consumer's receipt client-side to filter out meter-reader typographical mistakes before dispatching inspection teams.
3. **Immutable Audit Trail:** Provide end-to-end relational tracking from initial anomaly detection through on-site physical checklist execution (`INV-YYYYMMDD-XXXX`).
4. **Data Minimization & Privacy:** Guarantee that consumer camera scans, receipt photos, and raw OCR text dumps never leave browser memory.

### Intended Stakeholders
- **Utility Revenue Protection & Vigilance Teams:** Prioritize high-risk accounts and organize inspection schedules based on empirical anomaly scores.
- **Field Inspection Crews & Line Engineers:** Execute standardized 5-point physical verification protocols on site and log evidence directly into formal investigation records.
- **Billing Dispute & Grievance Adjudicators:** Validate spot-bill reading arithmetic, compare consecutive billing cycles, and resolve typographical punch errors without punitive escalations.
- **Academic Evaluators & Machine Learning Recruiters:** Review an end-to-end, production-grade implementation of applied machine learning, robust web architecture, and comprehensive test coverage.

---

## 4. Key Implemented Features

### 🔍 1. High-Throughput Machine Learning Screening
- **13 Statistical Summary Features:** Evaluates statistical consumption patterns (valid readings, zero counts, positive percentages, observed means/medians/standard deviations) instead of raw 1,000+ day time-series matrices.
- **Client-Side Pre-Validation:** Validates CSV structure, feature ranges, missing values, and data types in the browser prior to network transmission.
- **Chunked Batch Scoring:** Streams rows in 50-row chunks with live progress meters, ensuring smooth UI performance even on multi-thousand-row datasets.
- **SHA-256 Model Cryptographic Check:** Enforces integrity verification of `validated_candidate_pipeline.joblib` at FastAPI startup (`442981aa7f...`).

### 📊 2. Transparent 3-Tier Risk Triage
- **Normal (`Score < 0.30`):** Consumption profile matches typical baseline patterns in the training distribution.
- **Elevated Risk (`0.30 ≤ Score < 0.50`):** Moderate irregularities warranting routine desk review.
- **Review Recommended (`Score ≥ 0.50`):** Statistical anomaly pattern resembling labeled abnormal training accounts.

### 🧾 3. Spot-Billing OCR & Arithmetic Verification
- **In-Browser Tesseract.js OCR:** Parses paper electricity receipts locally using offline trained models (`eng.traineddata`).
- **Arithmetic Punch-Error Detection:** Validates physical billing arithmetic by comparing meter readings against billed units:
  $$\Delta = \text{Current Reading} - \text{Previous Reading}$$
  Flags a discrepancy warning if $|\Delta - \text{Units Billed}| > 1.0\text{ kWh}$, isolating typographical data-entry errors and meter multipliers (MF) from unmetered consumption.
- **Strict Data Minimization:** Full-page camera photos, PDFs, and raw OCR text dumps are processed purely in-memory and are never sent to or stored on backend servers.

### ⚖️ 4. Dual-Bill Comparison & Household Profiling
- **Calendar-Normalized Burn Rates:** Computes daily consumption rates ($\text{kWh/day}$), billing shifts (₹), and effective unit costs ($\text{₹/kWh}$) across consecutive billing cycles.
- **Appliance Load Modeling:** A 4-question household load questionnaire estimates expected consumption based on BEE 3-Star appliance standards (air conditioners, geysers, pumps, refrigeration).

### 📋 5. Field Investigation Ticketing & Duplicate Prevention
- **Relational Ticket Lifecycle:** Automatically creates formal investigation tickets (`INV-YYYYMMDD-XXXX`) tracking status progression (`New` $\rightarrow$ `Scheduled` $\rightarrow$ `In inspection` $\rightarrow$ `Evidence review` $\rightarrow$ `Closed`).
- **Duplicate Prevention with Deep Linking:** Prevents redundant ticket creation for consumers already in the queue. Displays an informational notice with a **"View Existing Investigation"** action that deep-links directly to the ticket (`/app/investigations?id=...&ticket=...`), expands its accordion, and highlights it.
- **5-Point Field Inspection Checklist:** Provides an interactive on-site audit protocol:
  1. Confirm customer and meter identity
  2. Compare meter reading with billing record
  3. Check meter seal and enclosure integrity
  4. Review connected load against sanctioned contract load
  5. Record photographs and field notes

### 💬 6. Grounded AI Assistant & 8 Specialized Plugins
- **Deterministic & Grounded Tools:** Dedicated workspace (`/app/chat`) and global floating drawer with 8 selectable plugins operating on active session data.
- **Zero Hallucination Guarantee:** Tools report missing prerequisite data rather than generating speculative answers.
- **Autonomous Local Fallback:** Runs locally in offline fallback mode if external AI provider keys are not configured.

### 🌐 7. Multilingual Support & Ergonomic UI
- **4 Languages:** Instant switching across English, Hindi (हिन्दी), Telugu (తెలుగు), and Tamil (தமிழ்).
- **Collapsible Navigation Rail:** Desktop sidebar collapses from 256px to 64px with floating tooltips and keyboard shortcuts (`Ctrl+Shift+S`).
- **Independent Workspace Scrolling:** Fixed desktop sidebar paired with an independently scrollable content workspace and dark-themed scrollbar.
- **Interactive Onboarding Tour:** 8-step product walkthrough with SVG spotlight masking, first-login Welcome Modal, and persistent Help Guide replay.

---

## 5. Technology Stack

| Layer | Technology | Version | Purpose & Architectural Role |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | `18.3.1` | Single-page application, component hierarchy, responsive state |
| **Build Tool & Bundler** | Vite | `5.4.11` | Build tooling, Hot Module Replacement, and development reverse proxy |
| **Routing** | React Router DOM | `6.28.0` | Client-side routing, protected workspace routes, public landing views |
| **Styling & Design** | Tailwind CSS | `3.4.17` | Utility-first styling with custom palette (`ink`, `gold`, `mist`, `pale`) |
| **Data Visualization** | Recharts | `2.15.0` | Risk distribution bar charts, trend curves, and metric badges |
| **Client-Side OCR** | Tesseract.js | `7.0.0` | In-browser offline OCR using local `eng.traineddata` model |
| **Client Auth SDK** | Supabase JS | `2.118.0` | Session management, Google OAuth, and JWT handling |
| **Backend Framework** | FastAPI | `0.115+` | Asynchronous REST API, Pydantic v2 schemas, and dependency injection |
| **ASGI Server** | Uvicorn (standard) | `0.30+` | High-performance production ASGI server |
| **ML Engine & Pipeline** | Scikit-Learn | `1.5+` | 250-tree Random Forest pipeline with median SimpleImputer |
| **Data Processing** | Pandas & NumPy | `2.2+` | Array operations, DataFrame parsing, and bounds validation |
| **Object Serialization** | Joblib | `1.4+` | Pipeline binary loading and metadata extraction |
| **Database ORM** | SQLAlchemy | `2.0+` | Relational mapping, transactional scopes, and repository patterns |
| **Database Driver** | Psycopg v3 | `3.1+` | High-performance PostgreSQL database adapter |
| **JWT Verification** | PyJWT (crypto) | `2.8+` | Cryptographic JWT verification (ES256, RS256, HS256) |
| **Database Service** | PostgreSQL (Supabase) | `15+` | Relational audit storage with Row Level Security (RLS) policies |
| **Frontend Unit Testing**| Node.js Test Runner | `v20+` / `v24+` | 325 unit test cases (assertions, mutations, assistant, formatters) |
| **Browser E2E Testing** | Playwright | `1.64.1` | 80 browser end-to-end tests across desktop and mobile viewports |
| **Backend Testing** | Python `unittest` | `3.10+` | 160 unit and integration tests (158 passed, 2 optional skipped) |

---

## 6. Architecture & Request/Data Flow

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

### Request & Data Flow
1. **Screening Batch Flow:** The client parses CSV files in-memory, validates feature bounds against `training_ranges.json`, and sends 50-row chunks to `POST /v1/predict-batch`. The backend verifies input schema, executes the Scikit-learn pipeline, and returns model scores and triage classifications. When authenticated, the batch and records are persisted to PostgreSQL.
2. **Reverse Proxy Security:** In development, Vite dev server proxies `/ml/*` to `http://127.0.0.1:8000`. In production, Vercel routes `/ml/:path*` to Render (`https://theftguard-ai.onrender.com/:path*`). Frontend clients never contact PostgreSQL directly or hold database connection credentials.
3. **Stateless JWT Validation:** Authenticated endpoints (`/v1/batches`, `/v1/investigations`, `/v1/bill-extractions`) require a Supabase Bearer JWT, verified against public keys or HMAC secrets. The authenticated user ID (`auth.uid()`) is passed into repository transactions to enforce multi-tenant isolation.

---

## 7. Machine Learning Pipeline & Evaluation Metrics

The core machine learning engine uses an immutable, cryptographically verified Scikit-learn candidate pipeline (`validated_candidate_pipeline.joblib`).

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

### Model Integrity & Architecture
- **Pipeline Type:** `sklearn.pipeline.Pipeline`
- **Imputer:** `SimpleImputer(strategy='median', add_indicator=True)`
- **Classifier:** `RandomForestClassifier(n_estimators=250, class_weight='balanced', random_state=42)`
- **Model Inputs:** 13 engineered features expanded to 21 inputs with missing-value indicators.
- **Cryptographic SHA-256 Hash:**
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

The candidate pipeline was evaluated on a held-out test split of 8,475 customer records with verified ground truth from the State Grid Corporation of China (SGCC) benchmark dataset:

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

### Benchmark Architecture Comparison

During model development, four candidate architectures were benchmarked under identical cross-validation conditions:

| Candidate Model | Mean Cross-Validation F1 | Notes / Selection Rationale |
| :--- | :---: | :--- |
| **Random Forest (Balanced)** | **0.3165** | **Selected candidate** — highest F1 and stable precision |
| **Logistic Regression (Balanced)** | 0.2487 | Underperformed on non-linear interaction features |
| **Random Forest (Baseline)** | 0.1095 | Severely impaired by extreme class imbalance ($91.5\% / 8.5\%$) |
| **Logistic Regression (Baseline)** | 0.0671 | Failed to converge to actionable decision boundaries |

---

## 8. Electricity-Bill OCR & Comparison Workflows

### Supported File Formats & Technical Specifications
The Spot-Bill Upload module (`/app/bill-upload`) accepts:
- **Raster Images:** `.jpg`, `.jpeg`, `.png`
- **PDF Documents:** `.pdf` (up to 10 MB maximum file size)

> [!NOTE]
> **PDF OCR Support Notice & Manual Verification:**
> Automated in-browser OCR is performed via Tesseract.js directly on raster images (`.jpg`, `.jpeg`, `.png`).
> For PDF statements, automated browser OCR is currently not supported. When a PDF file is loaded, the application provides an in-browser document preview (and a direct link to view the PDF in a new tab), displays a clear informational notice, and enables the operator to inspect and edit or verify the extracted bill fields manually.

### Arithmetic Consistency Verification
The OCR parser automatically validates the mathematical consistency of printed meter readings against billed units:
$$\Delta = \text{Current Reading} - \text{Previous Reading}$$

If $|\Delta - \text{Units Billed}| > 1.0\text{ kWh}$, the system flags a **Reading Discrepancy** warning. This immediately alerts operators to check whether a meter multiplier (MF), billing adjustment, or spot-billing typographical punch error is present, preserving the printed billed units while preventing false theft accusations.

### Dual-Bill Comparison Engine
The Bill Comparison module (`/app/bill-comparison`) allows side-by-side analysis of two consecutive billing cycles:
- **Calendar-Normalized Burn Rate:** Normalizes consumption by billing period length ($\text{kWh/day}$) to eliminate calendar-length distortions.
- **Cost Shifts:** Calculates net change in bill amount (₹) and effective tariff rate per unit ($\text{₹/kWh}$).
- **Appliance Load Modeling:** A 4-step questionnaire benchmarks reported usage against expected seasonal consumption for major electrical loads (air conditioners, water heaters/geysers, agricultural/domestic water pumps, refrigerators) calibrated to Bureau of Energy Efficiency (BEE) 3-Star appliance standards.

---

## 9. Investigation Ticket Lifecycle & Duplicate Prevention

### Formal Investigation Tickets (`INV-YYYYMMDD-XXXX`)
Field audits are organized into formal investigation tickets generated with a standardized code format (`INV-YYYYMMDD-XXXX`).

#### Status Progression Lifecycle
```
[New] ──> [Scheduled] ──> [In inspection] ──> [Evidence review] ──> [Closed]
```
- **New:** Ticket registered from anomaly screening or bill comparison escalation.
- **Scheduled:** Assigned to an inspection team with a target site visit date.
- **In inspection:** Field team actively executing on-site physical audit.
- **Evidence review:** Checklist completed; supervisor reviewing findings and photographs.
- **Closed:** Audit resolved with determination (Confirmed Tampering, Defective Meter, Billing Correction, or Compliant).

#### 5-Point Field Inspection Checklist
The investigation module provides a standardized 5-point on-site inspection checklist:
1. **Customer & Meter Identity:** Confirm physical meter serial number and consumer identification against billing master data.
2. **Reading Comparison:** Verify physical LCD register reading against the previous and current spot-billing records.
3. **Seal & Enclosure Integrity:** Inspect utility meter seals, optical port locks, and enclosure tamper indicators.
4. **Connected Load Audit:** Measure active connected household load and compare against sanctioned contract demand (kW).
5. **Photographs & Field Notes:** Record on-site evidence photographs, terminal block wiring observations, and field notes.

> [!NOTE]
> **Workflow vs. Inspection Guidance:**
> Status progression (`New` $\rightarrow$ `Scheduled` $\rightarrow$ `In inspection` $\rightarrow$ `Evidence review` $\rightarrow$ `Closed`), duplicate prevention, and outcome recording are core workflow controls. The 5-point checklist serves as interactive procedural guidance to assist and structure field audits; items can be completed progressively as evidence is gathered and do not act as rigid programmatic validation gates.

### Duplicate Prevention & Deep-Linking UX
To prevent queue clutter and redundant field visits:
- **Database & State Uniqueness:** The system prevents creating multiple open investigation tickets for the same consumer ID.
- **Friendly Escalation Feedback:** When an operator attempts to escalate a customer who already has an investigation record (e.g., from the Bill Comparison page), the system suppresses duplicate creation and displays a friendly informational notice: *“An investigation already exists for this customer (INV-YYYYMMDD-XXXX).”*
- **Seamless Deep Linking:** The notice provides a **"View Existing Investigation"** button that routes directly to `/app/investigations?id=...&ticket=...`. The Investigations page automatically switches the active filter to "All", expands the corresponding ticket accordion, scrolls smoothly to it, and highlights it with a temporary gold accent ring.

---

## 10. Authentication, Supabase Persistence & User Data Isolation

TheftGuard AI implements a robust multi-tenant security architecture combining Supabase Authentication with PostgreSQL Row Level Security (RLS).

```
┌───────────────────────────────────────────┐
│             screening_batches             │
│  - id: UUID (PK)                          │
│  - file_name: VARCHAR(255)                │
│  - total_rows: INTEGER                    │
│  - model_sha256: VARCHAR(64)              │
│  - created_by: UUID (FK auth.users)       │
└─────────────────────┬─────────────────────┘
                      │ 1:N
                      ▼
┌───────────────────────────────────────────┐       ┌───────────────────────────────────────────┐
│             screening_records             │       │               investigations              │
│  - id: UUID (PK)                          │       │  - id: UUID (PK)                          │
│  - batch_id: UUID (FK)                    │ 1:1   │  - ticket_code: VARCHAR(64) (UNIQUE)      │
│  - customer_ref: VARCHAR(128)             ├───────►  - screening_record_id: UUID (FK)         │
│  - model_score: DOUBLE PRECISION          │       │  - status: VARCHAR(32)                    │
│  - predicted_label: SMALLINT              │       │  - checklist: JSONB                       │
│  - review_category: VARCHAR(32)           │       │  - created_by: UUID (FK auth.users)       │
└───────────────────────────────────────────┘       └───────────────────────────────────────────┘
```

### Multi-Tenant Data Isolation & Security Architecture
1. **PostgreSQL RLS & PostgREST Lockdown:** All four audit tables (`screening_batches`, `screening_records`, `investigations`, `bill_extractions`) have Row Level Security enabled in PostgreSQL with default-deny semantics. Migration `001_phase2_initial_schema.sql` explicitly revokes public PostgREST API access from `anon` and standard `authenticated` roles (`REVOKE ALL ON TABLE ... FROM anon, authenticated`), blocking unauthorized direct browser-to-table access.
2. **Server-Side Stateless JWT Verification:** All persistent audit operations are brokered by the FastAPI backend service (`/ml/*`). The service inspects incoming Bearer tokens using PyJWT, validating signatures against Supabase JWKS endpoints (supporting ES256, RS256, and HS256 algorithms), audience (`authenticated`), expiration, and issuer.
3. **User-Scoped Repository Boundaries:** The verified user UUID (`auth.uid()`) is passed into SQLAlchemy repository transactions. All database queries and mutations enforce user ownership (`WHERE created_by == user_id`), ensuring that users can only view, update, or delete their own screening batches and investigation records.
4. **Client-Side Preference Partitioning:** Local browser storage (`localStorage`) partitions keys by account ID (`theftguard:onboarding:<userId>` and `theftguard:onboarding:demo`) for UI preferences and onboarding tour progression. Client-side storage is strictly a display aid and is explicitly not an authorization boundary; all access control and record tenancy are enforced server-side.

---

## 11. AI Assistant Plugins & Grounded Tools

TheftGuard AI incorporates an interactive domain assistant available via a dedicated workspace (`/app/chat`) and a global floating slide-over drawer (`⚡`).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Select Assistant Tools                               │
│ [All-in-One: General] [Dual-Bill: Comparison] [OCR: Audit] [Screening: Anomaly]  │
│ [Load: Appliances]    [Audit: Tickets]        [Tariff: Slabs] [Help: Creep Test] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### The 8 Grounded Domain Plugins

| # | Plugin Name | ID | Badge | Real Grounded Data Operation |
|---|---|---|---|---|
| 1 | **General Assistant** | `general_assistant` | `All-in-One` | Default assistant. Explains utility concepts (kWh, sanctioned load, power factor, power vs energy), guides application navigation, and synthesizes cross-domain data. |
| 2 | **Bill Comparison** | `bill_comparison` | `Dual-Bill` | Computes verified energy shifts (kWh), daily burn rates (`kWh/day`), billing amount delta (₹), and unit cost shifts (`₹/kWh`). |
| 3 | **Bill Upload & OCR** | `bill_upload_ocr` | `OCR Audit` | Audits spot-billing slips, confirms arithmetic consistency, and checks for meter punch errors before field deployment. |
| 4 | **Theft Screening** | `theft_screening` | `ML Screening` | Evaluates consumption anomaly batches, score distributions, and groups accounts into Review, Elevated, and Normal triage bands. |
| 5 | **Usage Analyst** | `usage_analyst` | `Appliances` | Itemizes household appliance consumption (ACs, geysers, pumps, refrigerators) based on BEE 3-Star standards and compares against reported usage. |
| 6 | **Reports & History** | `reports_history` | `Audit Trail` | Summarizes open field inspection tickets (`INV-YYYYMMDD-XXXX`), status lifecycles, and audits 5-point physical verification checklists. |
| 7 | **Bill Calculator** | `bill_calculator` | `Tariff Slabs` | Simulates telescopic tariff slabs, fixed demand charges, electricity duty, and fuel surcharges under clearly stated assumptions. |
| 8 | **Electricity Help** | `electricity_help` | `Knowledge` | Step-by-step engineering protocols for the **Switch-Off Creep Test** (diagnosing phantom meter pulsing with main MCB OFF) and disputing billing punch errors. |

**Grounded Execution Guarantee:** When prerequisite data is absent (e.g., asking for a bill comparison when no bills have been loaded), plugins report the exact missing inputs and provide direct navigation buttons rather than fabricating hypothetical numbers.

---

## 12. Local Setup & Installation Instructions

### Prerequisites
- **Python:** Version 3.10 to 3.13 (tested and verified on Python 3.13)
- **Node.js:** Version 18 or newer (tested and verified on Node 20 and Node 24; npm 10+)
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
- **Destination Path:** `ml-service/validated_candidate_pipeline.joblib`

Verify the file's SHA-256 cryptographic hash:
```powershell
# Windows PowerShell:
(Get-FileHash -Path "ml-service\validated_candidate_pipeline.joblib" -Algorithm SHA256).Hash.ToLower()

# Linux / macOS:
sha256sum ml-service/validated_candidate_pipeline.joblib
```
**Expected Output:** `442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5`

---

### Step 3: Apply Database Schema Migrations
Execute the SQL migration scripts in order against your Supabase or PostgreSQL database:
1. [`ml-service/migrations/sql/001_phase2_initial_schema.sql`](ml-service/migrations/sql/001_phase2_initial_schema.sql)
2. [`ml-service/migrations/sql/002_add_created_by_to_bill_extractions.sql`](ml-service/migrations/sql/002_add_created_by_to_bill_extractions.sql)

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

## 13. Environment Variable Configuration

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
# SUPABASE_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
# SUPABASE_JWT_SECRET=
```

### Frontend Configuration (`theftguard-ai-frontend/frontend/.env.local`)
Copy `theftguard-ai-frontend/frontend/.env.example` to `theftguard-ai-frontend/frontend/.env.local`:

```ini
# Supabase Client Configuration
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

> [!CAUTION]
> Never commit `.env` or `.env.local` files to version control. Both are excluded via `.gitignore`. Never place service-role keys or database passwords in frontend configuration.

---

## 14. Running the Application Locally

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

## 15. Testing Instructions & Verification

### 1. Run Frontend Unit Tests
Executes unit tests covering mutations, assistant engine, OCR validators, language dictionaries, and state stores:
```powershell
cd theftguard-ai-frontend/frontend
npm test
```
*Expected Result: `tests 325, pass 325, fail 0` in ~0.5s.*

### 2. Run Playwright Browser End-to-End Tests
Executes full-browser UI tests covering authentication, onboarding tour, collapsible sidebar, mobile navigation, and chat workspace across desktop and mobile viewports:
```powershell
cd theftguard-ai-frontend/frontend
npm run test:e2e
```
*Expected Result: `80 passed` across all spec suites.*

### 3. Run Backend Unit & Integration Tests
Executes backend tests covering ASGI lifecycle, JWT authentication, Pydantic input bounds, persistence routes, and scoring:
```powershell
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests/unit
```
*Expected Result: `Ran 160 tests ... OK (skipped=2)` (158 passed; 2 optional full-dataset tests skip cleanly when `THEFTGUARD_FEATURES_CSV` is unset).*

### 4. Verify Production Build Compilation
```powershell
cd theftguard-ai-frontend/frontend
npm run build
```
*Expected Result: Compiles cleanly into `dist/` with zero JSX/CSS syntax errors.*

---

## 16. Current Verified Test Counts

TheftGuard AI maintains an active, multi-layered automated test suite. All tests have been independently executed and verified:

```
┌────────────────────────────────────────────────────────────────────────┐
│             Total Automated Tests: 565 (563 Passed, 2 Skipped)         │
├─────────────────────────┬──────────────────────┬───────────────────────┤
│ 160 Backend Unit Tests  │ 325 Frontend Unit    │ 80 Playwright E2E     │
│ (158 Passed, 2 Skipped) │ (325 Passed, 0 Fail) │ (80 Passed, 0 Fail)   │
└─────────────────────────┴──────────────────────┴───────────────────────┘
```

| Test Category | Framework | Test Count | Passed | Skipped | Failed | Last Verification Date |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Frontend Unit Tests** | Node.js Test Runner (`node --test`) | 325 | 325 | 0 | 0 | October 26, 2026 |
| **Browser End-to-End** | Playwright (`playwright test`) | 80 | 80 | 0 | 0 | October 26, 2026 |
| **Backend Unit & API** | Python `unittest` | 160 | 158 | 2* | 0 | October 26, 2026 |
| **Total Automated Tests**| **Full Suite** | **565** | **563** | **2** | **0** | **October 26, 2026** |

*\*Note: 2 backend tests evaluate optional offline full-dataset conformance and skip gracefully when `THEFTGUARD_FEATURES_CSV` is unconfigured.*

---

## 17. Deployment Links & Production Architecture

The application is deployed across production cloud services:

1. **Frontend (Vercel):** Hosted at [https://theft-guard-ai-z9tb.vercel.app](https://theft-guard-ai-z9tb.vercel.app). Managed via [`vercel.json`](theftguard-ai-frontend/frontend/vercel.json) rewrites that route `/ml/:path*` to the backend and all client-side routes to `/index.html`.
2. **Backend (Render):** Hosted on Render (`https://theftguard-ai.onrender.com`) running the FastAPI application via Uvicorn.
3. **Database & Auth (Supabase):** PostgreSQL 15 database with Supabase Auth providing JWT generation, user management, and Row Level Security enforcement.

---

## 18. Known Limitations & Responsible-Use Disclaimer

> [!IMPORTANT]
> **Decision Support Notice:**
> A high model score ($\ge 0.50$) indicates statistical similarity to consumption anomalies present in the training dataset. **It is an operational triage signal, not legal proof of electricity theft, meter tampering, or fraud.**

### Operating Constraints & Ethical Safeguards
- **Mandatory Human-in-the-Loop Audit:** Machine learning predictions must never be used to issue penalties, disconnect service, or accuse consumers without an on-site physical inspection completing the 5-point checklist.
- **Benign Explanations for Anomalies:** A sharp drop in consumption often stems from legitimate, non-fraudulent causes:
  - Extended consumer travel or seasonal property vacancy.
  - Installation of rooftop solar photovoltaic (PV) net-metering systems.
  - Temporary commercial maintenance or seasonal business shutdowns.
  - Defective meter wiring or faulty current transformers (CTs).
- **Uncalibrated Model Scores:** The primary model output is termed **Model Score** ($0.0$ to $1.0$). It represents the Random Forest vote fraction for class 1 and must not be communicated to consumers as a calibrated probability of theft.
- **Privacy & Data Minimization:** Spot-billing OCR processes receipts purely within browser memory. Camera images, PDF files, and raw OCR text dumps are never uploaded or retained in database tables.

---

## 19. Project Structure & Development Notes

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
        ├── test/                             # 325 frontend unit tests
        └── e2e/                              # 80 Playwright browser end-to-end tests
```

### Development Notes
- **Code Style & Linting:** Frontend adheres to standard React 18 modular structure; backend follows PEP 8 conventions with explicit type annotations.
- **Git Hygiene:** Never use `git add .` or commit untracked test fixtures or binary presentation decks. Stage only explicit source files.

---

## 20. License & Citation

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

### Citation & Attribution
If you reference or use this project in an academic paper, capstone demonstration, or research study, please attribute:

```bibtex
@misc{theftguard_ai_2026,
  author = {Balraj Pranay Kumar},
  title = {TheftGuard AI: Electricity Theft Detection & Field Audit Platform for Power Distribution Utilities},
  year = {2026},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/balrajpranay/TheftGuard-AI}}
}
```

---
*Developed with precision for electrical distribution reliability, financial loss reduction, and transparent machine learning governance.*
