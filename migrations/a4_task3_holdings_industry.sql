-- ============================================================================
-- FundLens v7 — A4 Task 3: industry + liquidity fields on holdings_cache,
--                          company profile on fmp_cache
--
-- WHY: the scoring model's real goal is knowing WHAT COMPANIES a fund owns.
-- FMP's profile endpoint returns a fine-grained `industry` field (100+
-- categories) alongside the broad sector, for any symbol the Starter plan
-- covers — including OTC ADRs (verified July 2, 2026: TCEHY and SSNLF both
-- returned full profiles). This migration adds the storage for that harvest.
--
--   holdings_cache — per-fund holding rows gain the harvested fields:
--     industry          fine-grained FMP industry (or Haiku fallback, Task 5)
--     industry_source   'fmp' | 'haiku' | NULL — provenance per holding
--     is_adr            FMP's ADR flag (UNRELIABLE for unsponsored tickers —
--                       SSNLF returned false; stored as data, never the sole
--                       ADR signal)
--     exchange          exchange short name from the profile
--     average_volume    average daily share volume (liquidity firewall input)
--     momentum_eligible false = classification data only; the symbol is too
--                       thin for price series (A4 Task 4 writes this)
--
--   fmp_cache — gains the raw profile JSON (7-day TTL like the rest of the
--   row) so each company's profile is fetched once per week across all funds.
--
-- Run in the Supabase SQL Editor BEFORE merging/deploying the A4 code.
-- ============================================================================

ALTER TABLE holdings_cache
  ADD COLUMN IF NOT EXISTS industry          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS industry_source   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_adr            BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS average_volume    NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS momentum_eligible BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN holdings_cache.industry_source IS
  'fmp | haiku | NULL — where this holding''s industry tag came from (A4 Task 3)';
COMMENT ON COLUMN holdings_cache.momentum_eligible IS
  'false = below the liquidity firewall; classification data only, never price series (A4 Task 4)';

ALTER TABLE fmp_cache
  ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT NULL;

COMMENT ON COLUMN fmp_cache.profile IS
  'Raw FMP company profile (industry, sector, isAdr, exchange, averageVolume) — same 7-day TTL as the row (A4 Task 3)';
