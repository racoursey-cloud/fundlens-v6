-- ============================================================================
-- FundLens — B7: reference_summaries — storage for neutral reference summaries
-- (B-series plan, ratified July 27, 2026 — assignment B7, as amended by
-- ruling R1, Robert, July 30, 2026)
--
-- WHY: the reference tier's neutral fund summaries (summary_reference) need
-- a home of their own. Ruling R1, reason on record: today's editorial
-- summaries ride per-run inside fund_scores.factor_details and evaporate
-- nightly (the cron and retry paths never generate them), and the funds
-- table is readable by any signed-in account through the database's direct
-- read path — so Robert-reviewed drafts must not live on either. One row per
-- fund, written only by the admin-only generate route (B7 c5), served only
-- while REFERENCE_SUMMARIES_ENABLED is true (ships false).
--
-- Robert runs this file in the Supabase SQL Editor after the B7 merge.
-- No code path executes this SQL; Fabio verifies read-only afterward.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reference_summaries (
  id                UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id           UUID NOT NULL UNIQUE REFERENCES funds(id) ON DELETE CASCADE,
  summary_reference TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enabled, zero policies by design (ruling R1); service-role access only.
-- The anon and authenticated roles can do nothing here — no signed-in account
-- can read drafts through the database's direct read path. Only the service
-- role (which bypasses RLS by design) reads and writes this table, via the
-- B7 routes.
ALTER TABLE reference_summaries ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — Robert runs each query separately after the migration (B7
-- acceptance). The SQL Editor shows one result set at a time.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Table exists with rls_enabled = true:
-- SELECT tablename, rowsecurity AS rls_enabled
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename = 'reference_summaries';

-- 2) Policy count is 0 (zero policies by design, ruling R1):
-- SELECT count(*) AS policy_count
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename = 'reference_summaries';

-- 3) Row count is 0 (empty until Robert's first generate click):
-- SELECT count(*) AS row_count FROM reference_summaries;
