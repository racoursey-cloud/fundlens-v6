-- ============================================================================
-- FundLens v6 — Session 10: Cache Tables for Pipeline Performance
--
-- Creates the missing Supabase cache tables that v5.1 uses to achieve
-- ~2 minute pipeline runs. Without these, v6 re-fetches all external API
-- data on every pipeline run (~9 minutes).
--
-- Tables created:
--   1. fmp_cache              — FMP fundamentals (ratios + key metrics), 7-day TTL
--   2. tiingo_price_cache     — Tiingo daily prices / NAV history, 1-day TTL
--   3. finnhub_fee_cache      — Finnhub expense/fee data (12b-1, loads), 90-day TTL
--   4. sector_classifications — Claude Haiku sector labels, 15-day TTL
--
-- Run in Supabase SQL Editor before deploying Session 10 code.
-- ============================================================================


-- ─── 1. FMP FUNDAMENTALS CACHE ───────────────────────────────────────────────
-- Caches FMP ratios + key metrics per equity ticker.
-- Fundamentals change quarterly at most → 7-day TTL eliminates ~95% of API calls.
-- Shared across funds: AAPL in 5 funds = 1 API call per 7 days, not 5.

CREATE TABLE IF NOT EXISTS fmp_cache (
  ticker     TEXT PRIMARY KEY,
  ratios     JSONB        DEFAULT NULL,
  key_metrics JSONB       DEFAULT NULL,
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fmp_cache_cached_at ON fmp_cache (cached_at);

COMMENT ON TABLE fmp_cache IS 'FMP fundamentals cache — 7-day TTL, keyed by equity ticker';

-- RLS: server-only (service_role bypasses), no client policy needed
ALTER TABLE fmp_cache ENABLE ROW LEVEL SECURITY;


-- ─── 2. TIINGO PRICE CACHE ──────────────────────────────────────────────────
-- Caches Tiingo daily price data per fund ticker.
-- Prices are stale after market close → 1-day TTL.
-- Stores the full raw price array so momentum can recompute daily returns.

CREATE TABLE IF NOT EXISTS tiingo_price_cache (
  ticker     TEXT PRIMARY KEY,
  prices     JSONB NOT NULL DEFAULT '[]'::jsonb,
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiingo_cache_cached_at ON tiingo_price_cache (cached_at);

COMMENT ON TABLE tiingo_price_cache IS 'Tiingo price/NAV cache — 1-day TTL, keyed by fund ticker';

ALTER TABLE tiingo_price_cache ENABLE ROW LEVEL SECURITY;


-- ─── 3. FINNHUB FEE CACHE ───────────────────────────────────────────────────
-- Caches Finnhub mutual fund fee data (expense ratio, 12b-1, front load).
-- Fee structures change infrequently → 90-day TTL.
-- Separate from funds.expense_ratio because this stores the full fee breakdown.

CREATE TABLE IF NOT EXISTS finnhub_fee_cache (
  ticker         TEXT PRIMARY KEY,
  expense_ratio  NUMERIC(8, 6) DEFAULT NULL,
  fee_12b1       NUMERIC(8, 6) DEFAULT NULL,
  front_load     NUMERIC(8, 6) DEFAULT NULL,
  source         TEXT DEFAULT 'finnhub',
  cached_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finnhub_fee_cached_at ON finnhub_fee_cache (cached_at);

COMMENT ON TABLE finnhub_fee_cache IS 'Finnhub fee data cache — 90-day TTL, keyed by fund ticker';

ALTER TABLE finnhub_fee_cache ENABLE ROW LEVEL SECURITY;


-- ─── 4. SECTOR CLASSIFICATIONS ───────────────────────────────────────────────
-- Caches Claude Haiku sector classification per holding name.
-- Same holding (e.g. "APPLE INC") appears in multiple funds → classify once.
-- 15-day TTL matches v5.1. Keyed by holding name (not ticker) because many
-- EDGAR holdings have names but no resolved ticker.

CREATE TABLE IF NOT EXISTS sector_classifications (
  holding_name  TEXT PRIMARY KEY,
  sector        TEXT NOT NULL,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sector_class_cached_at ON sector_classifications (cached_at);

COMMENT ON TABLE sector_classifications IS 'Claude Haiku sector classifications — 15-day TTL, keyed by holding name';

ALTER TABLE sector_classifications ENABLE ROW LEVEL SECURITY;
