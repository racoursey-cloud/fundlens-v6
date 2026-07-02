-- ============================================================================
-- FundLens v7 — A3 Task 2: cusip_cache placeholder cleanup
--
-- WHY: cusip_cache is keyed by cusip, and foreign holdings carry the literal
-- placeholder "N/A" in the CUSIP field — so ONE cached resolution was shared
-- by every "N/A" holding across all funds. Confirmed in production July 2,
-- 2026: a single unresolved row under key 'N/A' (dated 2026-04-07) was
-- blocking resolution for all 263 placeholder holdings in RNWGX alone.
--
-- The A3 code resolves placeholder-CUSIP holdings by their ISIN (cached
-- under keys like 'ISIN:JP3633400001') or name, and never caches under a
-- placeholder key again. No schema change needed (cusip is TEXT).
--
-- Run in the Supabase SQL Editor BEFORE deploying the A3 code.
-- ============================================================================

-- Delete the shared placeholder rows ('N/A' and any all-zeros keys).
DELETE FROM cusip_cache
WHERE cusip = 'N/A'
   OR cusip ~ '^0+$';
