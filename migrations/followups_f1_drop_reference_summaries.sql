-- ============================================================================
-- FundLens — FOLLOWUPS #17: drop reference_summaries
-- (Findings law housekeeping, cleared August 18, 2026; the dismantling was
--  ruled at B9-T t2 and the table drop reserved to a Database-law ceremony)
--
-- WHY: the B7 reference-summary machinery is gone from the code. The
-- admin-only generate route that was this table's ONLY writer has been
-- removed, along with the reference-shape emission path, the client button
-- and generateReferenceSummaries. Nothing reads this table and nothing can
-- write to it. What remains is storage with no code on either side of it.
--
-- The summaries never served: REFERENCE_SUMMARIES_ENABLED shipped false and
-- was never raised, so no reference account ever received a row from here.
--
-- BEFORE RUNNING — the drop is irreversible and the rows are drafts nobody
-- reviewed. Run step 1 first and read the count. If it is greater than zero
-- and Robert wants those drafts kept, stop: export them before step 2.
--
-- Robert runs this file in the Supabase SQL Editor. No code path executes
-- this SQL. REFERENCE_SUMMARIES_ENABLED stays in constants.ts, unreferenced.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — LOOK FIRST. Run this alone and read the result.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT count(*) AS drafts_that_will_be_destroyed FROM reference_summaries;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE DROP. Run only after step 1 has been read and accepted.
-- ═══════════════════════════════════════════════════════════════════════════
-- No CASCADE by design. reference_summaries references funds(id); nothing
-- references reference_summaries. A plain DROP therefore succeeds on its own,
-- and if anything unexpected does depend on it, this fails loud instead of
-- quietly taking that dependent with it.

DROP TABLE IF EXISTS reference_summaries;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — Robert runs each query separately after the drop.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) The table is gone. Expected: zero rows returned.
-- SELECT tablename FROM pg_tables
--  WHERE schemaname = 'public' AND tablename = 'reference_summaries';

-- 2) funds is untouched and still carries its rows. Expected: 23.
-- SELECT count(*) AS fund_count FROM funds;
