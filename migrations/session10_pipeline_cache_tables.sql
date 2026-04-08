-- ============================================================================
-- FundLens v6 — Session 10 Migration: Pipeline Cache Tables
-- ============================================================================
-- MISSING-13: Reduce pipeline runtime from ~9min to <3min
--
-- Two new cache tables that dramatically reduce external API calls
-- on subsequent pipeline runs:
--
--   1. fundamentals_cache  — FMP ratios + key metrics (7-day TTL)
--      Eliminates ~80-90% of FMP API calls after first run.
--      Fundamentals change quarterly; 7 days is conservative.
--
--   2. sector_classifications — Claude Haiku sector labels (15-day TTL)
--      Eliminates ~90% of Claude classification calls after first run.
--      Sectors are very stable; 15 days matches v5.1 production.
--
-- Run this BEFORE deploying Session 10 code.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ============================================================================


-- ── Part 1: fundamentals_cache ─────────────────────────────────────────────
-- Stores FMP company fundamentals (ratios, key metrics) per ticker.
-- Keyed by ticker (e.g., 'AAPL', 'MSFT'). 7-day TTL enforced in application.

CREATE TABLE IF NOT EXISTS fundamentals_cache (
  ticker        TEXT PRIMARY KEY,
  ratios        JSONB,
  key_metrics   JSONB,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for TTL cleanup queries (if we add a cron job to prune stale rows)
CREATE INDEX IF NOT EXISTS idx_fundamentals_cache_cached_at
  ON fundamentals_cache (cached_at);

COMMENT ON TABLE fundamentals_cache IS
  'Session 10: FMP fundamentals cache (7-day TTL). Reduces FMP API calls by ~80-90% on subsequent pipeline runs.';

-- RLS: service_role key bypasses RLS. Enable for defense-in-depth.
ALTER TABLE fundamentals_cache ENABLE ROW LEVEL SECURITY;


-- ── Part 2: sector_classifications ─────────────────────────────────────────
-- Stores Claude Haiku sector classifications per holding name.
-- Keyed by holding_name (e.g., 'APPLE INC', 'MICROSOFT CORP'). 15-day TTL.
-- Ported from v5.1's sector_classifications table design.

CREATE TABLE IF NOT EXISTS sector_classifications (
  holding_name  TEXT PRIMARY KEY,
  sector        TEXT NOT NULL,
  confidence    TEXT DEFAULT 'claude',
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_sector_classifications_cached_at
  ON sector_classifications (cached_at);

COMMENT ON TABLE sector_classifications IS
  'Session 10: Claude Haiku sector classification cache (15-day TTL). Eliminates ~90% of Claude calls after first run.';

-- RLS: service_role key bypasses RLS. Enable for defense-in-depth.
ALTER TABLE sector_classifications ENABLE ROW LEVEL SECURITY;


-- ── Verification ───────────────────────────────────────────────────────────
-- Run these after the migration to verify tables exist:

-- SELECT COUNT(*) FROM fundamentals_cache;      -- Should return 0
-- SELECT COUNT(*) FROM sector_classifications;   -- Should return 0
