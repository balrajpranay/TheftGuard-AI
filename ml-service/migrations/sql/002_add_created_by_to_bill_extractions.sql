-- ==============================================================================
-- TheftGuard AI: Phase 2 Migration 002
-- Add created_by column to bill_extractions for user-level record ownership
-- Target: PostgreSQL 15+ / Supabase
-- Version: 002_add_created_by_to_bill_extractions.sql
--
-- SECURITY & OWNERSHIP:
-- - Sets up created_by UUID column mapping to Supabase auth.users(id).
-- - Column is nullable to preserve existing legacy rows without assigning them
--   to an arbitrary user. Existing ownerless rows remain administrative or unassigned.
-- - Creates an index on created_by for performant user-scoped queries.
--
-- DO NOT RUN AUTOMATICALLY AGAINST PRODUCTION - PENDING ADMINISTRATOR REVIEW
-- ==============================================================================

BEGIN;

ALTER TABLE bill_extractions
ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS ix_bill_extractions_created_by ON bill_extractions (created_by);

COMMENT ON COLUMN bill_extractions.created_by IS 'User UUID who created or confirmed the bill extraction (maps to Supabase auth.users.id).';

-- Record migration version in ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('002_add_created_by_to_bill_extractions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
