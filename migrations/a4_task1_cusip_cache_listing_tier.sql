-- ============================================================================
-- FundLens v7 — A4 Task 1: cusip_cache listing tier + full cache wipe
--
-- WHY (production evidence, July 2, 2026): when one identifier maps to
-- several listings, resolution took "whatever came back" — home-exchange
-- tickers FMP Starter cannot serve (HY9H.F for SK Hynix, .T/.DE/.KS/.SW/.SR
-- suffixes throughout), a wrong-company fuzzy match ("Bank of China Ltd" →
-- 601398.SS, which is Industrial & Commercial Bank of China), and a retired
-- ticker ("Shell PLC" → RDSA.L, dead since 2022).
--
-- This migration:
--   1. Wipes ALL cusip_cache rows (Robert's decision, July 5, 2026).
--      A targeted delete of suffix-style tickers is unsafe — a share-class
--      dot (BRK.B) is indistinguishable from a London listing dot (RDSA.L).
--      The cache is only a cache: OpenFIGI is free and batched, and one
--      pipeline run rebuilds it under the new preference rules.
--   2. Adds listing_tier so every future resolution records which class of
--      symbol it landed on:
--        'us'   — NYSE/Nasdaq listing or ADR (fully enrichable via FMP)
--        'otc'  — OTC-market ADR (FMP Starter serves profiles for these)
--        'home' — home-exchange listing, kept as identity only (FMP Starter
--                 cannot serve it; excluded from enrichment)
--      NULL = resolved before A4 or unresolved.
--
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- BEFORE merging/deploying the A4 code.
-- ============================================================================

-- 1. Full wipe — the next pipeline run re-resolves everything fresh.
DELETE FROM cusip_cache;

-- 2. Listing tier column.
ALTER TABLE cusip_cache
  ADD COLUMN IF NOT EXISTS listing_tier TEXT DEFAULT NULL;

COMMENT ON COLUMN cusip_cache.listing_tier IS
  'us | otc | home | NULL — symbol class of the resolved ticker (A4 Task 1). home = identity only, not FMP-enrichable.';
