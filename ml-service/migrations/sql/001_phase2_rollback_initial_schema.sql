-- ==============================================================================
-- TheftGuard AI: Phase 2 Rollback Migration (Final Revised)
-- Target: PostgreSQL 15+ / Supabase
-- Version: 001_phase2_rollback_initial_schema.sql
-- Description: Safely drops Phase 2 tables and migration ledger in reverse order.
--
-- CAUTION / WARNING:
-- Running this script drops all Phase 2 tables and permanently deletes all
-- stored screening batches, scoring results, investigation tickets, and bill
-- extractions. Only run this against disposable test environments or during an
-- intentional, authorized schema rollback.
-- ==============================================================================

BEGIN;

-- Drop tables in reverse order of foreign key dependencies
DROP TABLE IF EXISTS bill_extractions CASCADE;
DROP TABLE IF EXISTS investigations CASCADE;
DROP TABLE IF EXISTS screening_records CASCADE;
DROP TABLE IF EXISTS screening_batches CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

COMMIT;
