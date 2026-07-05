-- ============================================================================
-- FundLens v7 — A4 Task 6: Dossier v2 — resolvable-NAV grading columns
--
-- WHY: the v1 gate conflated three facts. Seven funds (VADFX, PRPFX, WFPRX,
-- DRRYX, RTRIX, TGEPX, WEGRX) resolve 98.9–100% of what they examine yet
-- FAIL v1 on denominator artifacts — PRPFX's "missing" 34% is its gold and
-- silver bullion, working as designed. Root cause (A3 session, confirmed in
-- code A4 Evidence Gate): the EDGAR parser silently dropped every no-CUSIP
-- holding since Session 2.
--
-- EVIDENCE OF RECORD (Robert, July 5, 2026 — parsed from the actual filings;
-- raw XML preserved, sha256 DRRYX a428d661…, PRPFX 01866004…):
--   DRRYX: 134 of 187 holdings dropped, 55.30% of NAV — DBT 45/33.11% (all
--     with ISINs), EC 26/15.23% (all with ISINs), STIV 1/5.92% (sweep, no
--     identifier), derivatives DE/DIR/DCR/DFE ~61/~0.46% net (incl. negatives)
--   PRPFX: 11 of 196 dropped, 33.20% — EC 1/14.13% (GOLD BULLION, no
--     identifier), STIV 3/11.18% (bullion/coins), DBT 7/7.89% (Swiss govies,
--     all with ISINs)
-- Consequence: bullion files as EC and STIV, so asset category cannot define
-- "structurally unresolvable" — the pinned test is derivative category OR
-- (no CUSIP and no ISIN). Negative-weight rows are excluded from all
-- coverage metrics and reported in their own column.
--
-- v2 separates three visible numbers per fund (nothing hidden, Principle 1):
--   weight_covered_pct         (existing) % of NAV examined by the cutoff
--   resolvable_pct             % of examined (positive-weight) NAV that is
--                              structurally resolvable
--   resolved_of_resolvable_pct % of resolvable NAV resolved — THE GRADED
--                              NUMBER, threshold 90
--
-- Also lands here (Robert-approved bundling, July 5 — if Task 6 had stalled
-- these would have shipped as a4_task3b):
--   industry_fmp_pct / industry_haiku_pct / industry_none_pct  (Task 3)
--   momentum_firewalled_weight_pct                             (Task 4)
--
-- Run in the Supabase SQL Editor BEFORE merging/deploying the A4 code.
-- ============================================================================

ALTER TABLE fund_dossiers
  -- Task 6: resolvable-NAV grading (whole-percent)
  ADD COLUMN IF NOT EXISTS resolvable_pct             NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_of_resolvable_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unresolvable_weight_pct    NUMERIC(6, 2) NOT NULL DEFAULT 0,
  -- Net weight of negative-weight rows (short/overlay derivative legs);
  -- can be negative, excluded from the ratios above
  ADD COLUMN IF NOT EXISTS short_overlay_weight_pct   NUMERIC(6, 2) NOT NULL DEFAULT 0,
  -- Task 4: % of positive included weight flagged classification-only
  ADD COLUMN IF NOT EXISTS momentum_firewalled_weight_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  -- Task 3: industry-tag provenance shares of positive included weight
  ADD COLUMN IF NOT EXISTS industry_fmp_pct           NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS industry_haiku_pct         NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS industry_none_pct          NUMERIC(6, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN fund_dossiers.resolved_of_resolvable_pct IS
  'THE GRADED NUMBER (v2, threshold 90): % of structurally resolvable NAV resolved to identified securities (A4 Task 6)';
COMMENT ON COLUMN fund_dossiers.short_overlay_weight_pct IS
  'Net weight of negative-weight rows (short/overlay legs) — excluded from coverage ratios, shown not hidden (A4 Task 6)';

-- v1 rows keep version=1; new runs write version=2. No data rewrite needed.
