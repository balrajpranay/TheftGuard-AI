-- ==============================================================================
-- TheftGuard AI: Phase 2 Initial Database Schema Migration (Final Revised)
-- Target: PostgreSQL 15+ / Supabase
-- Version: 001_phase2_initial_schema.sql
-- Description: Creates normalized tables for screening batches, records,
--              investigation tickets, and bill OCR extractions.
--
-- SECURITY & COMPLIANCE:
-- - No consumer personal identifiable information (PII) is stored.
-- - Unparsed full-page OCR text dump is excluded to prevent accidental address/name capture.
-- - created_by columns are UUID (ready for future Supabase auth.users.id).
-- - Tables are locked down with RLS + REVOKE against anonymous PostgREST access.
-- - Model scores are uncalibrated decision-support scores, not proof of theft.
--
-- DO NOT RUN AUTOMATICALLY - PENDING USER REVIEW AND APPROVAL
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PRE-FLIGHT COMPATIBILITY & IDEMPOTENCY CHECKS
-- ==============================================================================
-- Ensures existing incompatible legacy tables cannot silently pass as valid.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'screening_batches'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'screening_batches' AND column_name = 'model_sha256'
    ) THEN
        RAISE EXCEPTION 'Incompatible existing table "screening_batches" detected. It lacks the required "model_sha256" column. Migration aborted to prevent silent failure.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'screening_records'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'screening_records' AND column_name = 'model_score'
    ) THEN
        RAISE EXCEPTION 'Incompatible existing table "screening_records" detected. It lacks the required "model_score" column. Migration aborted to prevent data corruption.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'investigations'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'investigations' AND column_name = 'ticket_code'
    ) THEN
        RAISE EXCEPTION 'Incompatible existing table "investigations" detected. It lacks the required "ticket_code" column. Migration aborted.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bill_extractions'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bill_extractions' AND column_name = 'consumer_number'
    ) THEN
        RAISE EXCEPTION 'Incompatible existing table "bill_extractions" detected. It lacks the required "consumer_number" column. Migration aborted.';
    END IF;
END $$;

-- 1. SCREENING BATCHES
CREATE TABLE IF NOT EXISTS screening_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64),
    total_rows INTEGER NOT NULL DEFAULT 0,
    scored_rows INTEGER NOT NULL DEFAULT 0,
    rejected_rows INTEGER NOT NULL DEFAULT 0,
    warning_rows INTEGER NOT NULL DEFAULT 0,
    model_version VARCHAR(32) NOT NULL DEFAULT 'v1.0.0',
    model_sha256 VARCHAR(64) NOT NULL,
    score_note VARCHAR(128) NOT NULL DEFAULT 'Uncalibrated; not a probability',
    threshold_elevated DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    threshold_review DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_screening_batches_status CHECK (status IN ('processing', 'completed', 'failed')),
    CONSTRAINT ck_screening_batches_thresholds CHECK (
        threshold_elevated >= 0.0 AND threshold_elevated < threshold_review AND threshold_review <= 1.0
    ),
    CONSTRAINT ck_screening_batches_counts_non_negative CHECK (
        total_rows >= 0 AND scored_rows >= 0 AND rejected_rows >= 0 AND warning_rows >= 0
    )
);

CREATE INDEX IF NOT EXISTS ix_screening_batches_created_at ON screening_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_screening_batches_file_hash ON screening_batches (file_hash);

-- 2. SCREENING RECORDS (PER-CUSTOMER PREDICTION RESULTS)
CREATE TABLE IF NOT EXISTS screening_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES screening_batches(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    customer_ref VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'scored',
    model_score DOUBLE PRECISION,
    predicted_label SMALLINT,
    label_name VARCHAR(32),
    review_category VARCHAR(32) NOT NULL DEFAULT 'unscored',
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_screening_records_status CHECK (status IN ('scored', 'rejected', 'unscored')),
    CONSTRAINT ck_screening_records_score_range CHECK (
        model_score IS NULL OR (model_score >= 0.0 AND model_score <= 1.0)
    ),
    CONSTRAINT ck_screening_records_predicted_label CHECK (
        predicted_label IS NULL OR predicted_label IN (0, 1)
    ),
    CONSTRAINT ck_screening_records_label_name CHECK (
        label_name IS NULL OR label_name IN ('Normal', 'Suspicious')
    ),
    CONSTRAINT ck_screening_records_category CHECK (
        review_category IN ('normal', 'elevated', 'review', 'rejected', 'unscored')
    )
);

CREATE INDEX IF NOT EXISTS ix_screening_records_batch_id ON screening_records (batch_id);
CREATE INDEX IF NOT EXISTS ix_screening_records_customer_ref ON screening_records (customer_ref);
CREATE INDEX IF NOT EXISTS ix_screening_records_batch_score ON screening_records (batch_id, model_score DESC);
CREATE INDEX IF NOT EXISTS ix_screening_records_batch_category ON screening_records (batch_id, review_category);

-- 3. INVESTIGATIONS (FIELD AUDIT TICKETS)
CREATE TABLE IF NOT EXISTS investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_code VARCHAR(64) NOT NULL UNIQUE,
    customer_ref VARCHAR(128) NOT NULL,
    origin VARCHAR(32) NOT NULL DEFAULT 'screening',
    basis TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'New',
    priority VARCHAR(32) NOT NULL DEFAULT 'Normal',
    assignee VARCHAR(128),
    notes TEXT NOT NULL DEFAULT '',
    outcome VARCHAR(64),
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    screening_record_id UUID REFERENCES screening_records(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES screening_batches(id) ON DELETE SET NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_investigations_status CHECK (status IN ('New', 'Scheduled', 'In inspection', 'Evidence review', 'Closed')),
    CONSTRAINT ck_investigations_priority CHECK (priority IN ('Low', 'Normal', 'High')),
    CONSTRAINT ck_investigations_origin CHECK (origin IN ('screening', 'comparison', 'bill')),
    CONSTRAINT ck_investigations_outcome CHECK (
        outcome IS NULL OR outcome IN (
            'Irregularity verified on site',
            'No irregularity found',
            'Inconclusive, more information needed'
        )
    )
);

CREATE INDEX IF NOT EXISTS ix_investigations_ticket_code ON investigations (ticket_code);
CREATE INDEX IF NOT EXISTS ix_investigations_customer_ref ON investigations (customer_ref);
CREATE INDEX IF NOT EXISTS ix_investigations_status_priority ON investigations (status, priority);
CREATE INDEX IF NOT EXISTS ix_investigations_created_at ON investigations (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_investigations_screening_record_id ON investigations (screening_record_id);

-- Scoped duplicate prevention:
-- 1. A single screening record row can only ever be attached to ONE investigation
CREATE UNIQUE INDEX IF NOT EXISTS uq_investigations_screening_record
    ON investigations (screening_record_id)
    WHERE screening_record_id IS NOT NULL;

-- 2. Prevents duplicate active tickets for the same customer within the same batch run
CREATE UNIQUE INDEX IF NOT EXISTS uq_investigations_active_customer_batch
    ON investigations (customer_ref, batch_id)
    WHERE batch_id IS NOT NULL AND status != 'Closed';

-- 4. BILL EXTRACTIONS (OCR READINGS AND DISCREPANCIES)
CREATE TABLE IF NOT EXISTS bill_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_number VARCHAR(64) NOT NULL,
    discom VARCHAR(32),
    
    -- Typed temporal attributes
    period_start DATE,
    period_end DATE,
    bill_date DATE,
    
    -- Typed numeric readings
    previous_reading NUMERIC(12, 2),
    current_reading NUMERIC(12, 2),
    units_consumed NUMERIC(10, 2),
    calculated_units NUMERIC(10, 2),
    billing_days INTEGER,
    amount_payable NUMERIC(10, 2),
    has_discrepancy BOOLEAN NOT NULL DEFAULT FALSE,
    discrepancy_warning TEXT,
    
    -- Preserved raw OCR strings for audit verification (strictly readings/dates, no consumer PII)
    raw_billing_period VARCHAR(64),
    raw_bill_date VARCHAR(32),
    raw_previous_reading VARCHAR(32),
    raw_current_reading VARCHAR(32),
    
    investigation_id UUID REFERENCES investigations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT ck_bill_extractions_units_consumed CHECK (units_consumed IS NULL OR units_consumed >= 0),
    CONSTRAINT ck_bill_extractions_amount_payable CHECK (amount_payable IS NULL OR amount_payable >= 0),
    CONSTRAINT ck_bill_extractions_billing_days CHECK (billing_days IS NULL OR billing_days > 0),
    CONSTRAINT ck_bill_extractions_prev_reading CHECK (previous_reading IS NULL OR previous_reading >= 0),
    CONSTRAINT ck_bill_extractions_curr_reading CHECK (current_reading IS NULL OR current_reading >= 0),
    CONSTRAINT ck_bill_extractions_period_range CHECK (
        period_end IS NULL OR period_start IS NULL OR period_end >= period_start
    )
);

CREATE INDEX IF NOT EXISTS ix_bill_extractions_consumer_number ON bill_extractions (consumer_number);
CREATE INDEX IF NOT EXISTS ix_bill_extractions_has_discrepancy ON bill_extractions (has_discrepancy);
CREATE INDEX IF NOT EXISTS ix_bill_extractions_bill_date ON bill_extractions (bill_date DESC);
CREATE INDEX IF NOT EXISTS ix_bill_extractions_investigation_id ON bill_extractions (investigation_id);

-- ==============================================================================
-- 5. ACCESS CONTROL & SUPABASE DATA API LOCKDOWN
-- ==============================================================================
-- Enable Row Level Security (RLS) on all tables (Default Deny for anon / authenticated)
ALTER TABLE screening_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_extractions ENABLE ROW LEVEL SECURITY;

-- Revoke public PostgREST API access from anonymous and standard authenticated roles if present.
-- (On Supabase, anon and authenticated exist by default; on vanilla test PostgreSQL, this safely skips or revokes if created).
-- Access is strictly managed server-side via the FastAPI backend using the postgres owner or application runtime role.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE screening_batches, screening_records, investigations, bill_extractions FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE screening_batches, screening_records, investigations, bill_extractions FROM authenticated;
    END IF;
END $$;

-- ==============================================================================
-- 6. MIGRATION LEDGER
-- ==============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_phase2_initial_schema')
ON CONFLICT (version) DO NOTHING;

-- ==============================================================================
-- 7. TABLE & COLUMN DOCUMENTATION COMMENTS
-- ==============================================================================
COMMENT ON TABLE screening_batches IS 'Batch metadata and scoring summary statistics for uploaded CSV screenings.';
COMMENT ON TABLE screening_records IS 'Individual customer row scoring results, ML model scores, review bands, and 13 consumption features.';
COMMENT ON TABLE investigations IS 'Field audit tickets, checklist items, evidence files, and inspection outcomes.';
COMMENT ON TABLE bill_extractions IS 'OCR-extracted utility meter readings and discrepancy calculations.';

COMMENT ON COLUMN screening_batches.score_note IS 'Mandatory advisory note clarifying that model score is uncalibrated and not a probability.';
COMMENT ON COLUMN screening_batches.model_sha256 IS 'Verified SHA-256 hash of the Random Forest model pipeline joblib file.';
COMMENT ON COLUMN screening_records.features IS 'Exact 13 consumption features in JSONB preserving numeric precision.';
COMMENT ON COLUMN investigations.ticket_code IS 'External ticket reference (e.g. inv-171350... or INV-2026-001).';
COMMENT ON COLUMN bill_extractions.raw_previous_reading IS 'Raw unparsed OCR reading text preserved for audit verification.';
COMMENT ON COLUMN bill_extractions.raw_current_reading IS 'Raw unparsed OCR reading text preserved for audit verification.';

COMMIT;
