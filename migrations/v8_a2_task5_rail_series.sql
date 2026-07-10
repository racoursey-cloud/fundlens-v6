-- ============================================================================
-- FundLens v8 — A2 Task 5: the race rail's signal series (S4-ratified)
--
-- CONTENDER_B.md §4.3 (frozen at blob c7e21270…, S4 ruling July 10, 2026)
-- names one new registry row: RACE_EQ_TR — the daily U.S. equity total-return
-- index built from the D2 library (Ken French), served to contenders through
-- asOf() exclusively. Its source ('french') and axis ('price') are new column
-- VALUES that trip two CHECK constraints — that makes this file DDL, and DDL
-- goes through the Database law whole: Robert runs this file himself in the
-- Supabase SQL Editor (or types explicit approval naming it), and the
-- committed file byte-matches what ran. Constraint names verified read-only
-- in production July 10, 2026 (pg_constraint).
--
-- What this migration does:
--   1. Widens regime_series_source_check to admit 'french'.
--   2. Widens regime_series_axis_check to admit 'price'.
--   3. Inserts the RACE_EQ_TR registry row, DORMANT (enabled = false): the
--      rail is FROZEN AT ADOPTION (S4 ruling) — never swept, never updated.
--      The one-time ingest is code-gated (french.ts, reconciliation-gated
--      against the S4 primary prints); asOf() serves the series regardless
--      of the enabled flag (asof.ts reads the registry without filtering).
--
-- APPLY ORDER: run BEFORE merging the A2 Task 5 code PR
-- (charter §3 migrations-before-merges; A1 precedent).
-- ============================================================================

ALTER TABLE regime_series
  DROP CONSTRAINT regime_series_source_check;
ALTER TABLE regime_series
  ADD CONSTRAINT regime_series_source_check
  CHECK (source IN ('fred', 'ofr', 'cleveland', 'cboe', 'french'));

ALTER TABLE regime_series
  DROP CONSTRAINT regime_series_axis_check;
ALTER TABLE regime_series
  ADD CONSTRAINT regime_series_axis_check
  CHECK (axis IN ('growth', 'inflation', 'stress', 'rates', 'price'));

INSERT INTO regime_series
  (source, series_code, display_name, axis, tier, cadence, vintage_policy, fallback_channel, enabled, notes)
VALUES
  ('french', 'RACE_EQ_TR', 'Race rail: U.S. equity total-return index (D2 library, frozen at adoption)', 'price', 'load_bearing', 'daily', 'never_revised', NULL, false,
   'CONTENDER_B §4.2–§4.3, S4-ratified. Cumulative index from the D2 daily three-factor file (Mkt-RF + RF). FROZEN AT ADOPTION per the S4 ruling: one-time ingest only (french.ts, reconciliation-gated against the S4 primary prints), never swept — dormant row by design; asOf() serves it regardless. Restatement caveat and full adoption evidence: SOURCE_VINTAGE_POLICIES.md §7.');
