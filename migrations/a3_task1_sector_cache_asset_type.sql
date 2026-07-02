-- ============================================================================
-- FundLens v7 — A3 Task 1: Sector cache asset-type key + contamination wipe
--
-- WHY: sector_classifications was keyed by holding_name alone. SEC filings
-- name bonds by their ISSUER ("AMAZON.COM INC" can be a bond), so a bond
-- fund's "Fixed Income" label poisoned the same-named STOCK in equity funds
-- (verified July 2, 2026: FSPGX showed 19.5% Fixed Income). This migration:
--   1. Wipes ALL cached rows (Robert's July 2 decision — clean slate; the
--      next pipeline run reclassifies fresh, ~25-30 Claude Haiku batches).
--   2. Adds asset_type ('equity' / 'debt' / 'other', derived from EDGAR
--      metadata) and makes the primary key (holding_name, asset_type) so
--      Amazon-the-bond and Amazon-the-stock are separate cache entries.
--
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- BEFORE deploying the A3 code.
-- ============================================================================

-- 1. One-time cleanup: delete every cached classification (full wipe).
DELETE FROM sector_classifications;

-- 2. Add the asset_type column.
ALTER TABLE sector_classifications
  ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'other';

-- 3. Re-key the table: primary key becomes (holding_name, asset_type).
ALTER TABLE sector_classifications
  DROP CONSTRAINT IF EXISTS sector_classifications_pkey;
ALTER TABLE sector_classifications
  ADD PRIMARY KEY (holding_name, asset_type);

COMMENT ON TABLE sector_classifications IS
  'Claude Haiku sector classifications — 15-day TTL, keyed by (holding name, asset type). A3 Task 1: asset_type prevents bond-issuer names from poisoning same-named equities.';
COMMENT ON COLUMN sector_classifications.asset_type IS
  'equity | debt | other — derived from EDGAR isDebt/assetCategory/issuerCategory flags at classification time';
