-- ============================================================================
-- FundLens v7 — A5 Task 2: Dossier v3 — the confidence profile
--
-- WHY (ratified July 5, 2026): coverage becomes total (A5 Task 1) but
-- CERTAINTY still varies per holding — that variance is fact, not failure.
-- Each fund gets a per-run confidence ladder rolled up from per-holding
-- facts A4 already stores (industry_source, listing_tier, momentum_eligible,
-- structural-unresolvability). Arithmetic only; no new data collection.
--
-- The four rungs (per positive-weight holding, first match wins — the exact
-- field-to-rung mapping is pinned in A5_SESSION_PLANS.md and dossier.ts):
--   1. Structurally opaque    — bullion, derivatives, cash/repo, no-identifier
--   2. Fully verified         — filed data end to end: resolved ticker with
--                               FMP-sourced industry, OR debt/inv-company
--                               rows the filing itself identifies (Robert-
--                               ratified: bonds count as fully verified)
--   3. Identity only          — known security, unenrichable on our plan
--                               (home listing / liquidity-firewalled /
--                               profile served no industry)
--   4. Identified, model-classified — certain identity, Haiku-sourced label
--
-- The four rungs + the short-overlay field + the derived "not identified
-- this run" remainder reconcile to 100% ± rounding. The remainder is NOT
-- stored — it is 100 − (four rungs) − overlay, displayed honestly.
--
-- DOSSIER_VERSION bumps to 3 in dossier.ts. v2 rows keep version=2; new
-- runs write version=3. No data rewrite needed.
--
-- Run in the Supabase SQL Editor BEFORE merging/deploying the A5 Task 2 code.
-- ============================================================================

ALTER TABLE fund_dossiers
  ADD COLUMN IF NOT EXISTS conf_fully_verified_pct   NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conf_model_classified_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conf_identity_only_pct    NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conf_opaque_pct           NUMERIC(6, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN fund_dossiers.conf_fully_verified_pct IS
  'Confidence rung 1 (v3): % of positive NAV verified filed-data end to end — resolved identity + FMP industry, or debt/investment-company rows the filing itself identifies (A5 Task 2)';
COMMENT ON COLUMN fund_dossiers.conf_model_classified_pct IS
  'Confidence rung 2 (v3): % of positive NAV with certain identity (CUSIP/ISIN/SEDOL-resolved) and a Haiku-sourced industry label (A5 Task 2)';
COMMENT ON COLUMN fund_dossiers.conf_identity_only_pct IS
  'Confidence rung 3 (v3): % of positive NAV identified but unenrichable on our plan — home listing, liquidity-firewalled, or profile without industry (A5 Task 2)';
COMMENT ON COLUMN fund_dossiers.conf_opaque_pct IS
  'Confidence rung 4 (v3): % of positive NAV structurally opaque by nature — bullion, derivatives, cash/repo, no-identifier rows (A5 Task 2)';
