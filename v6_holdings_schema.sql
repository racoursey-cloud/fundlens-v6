-- ============================================================================
-- FundLens v6 — Holdings Cache Schema
-- Session 2 deliverable
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Creates four tables for the holdings pipeline:
--   1. funds           — the 401(k) fund menu
--   2. holdings_cache   — parsed EDGAR holdings per fund per filing period
--   3. cusip_cache      — persistent CUSIP→ticker mappings from OpenFIGI
--   4. pipeline_runs    — tracks pipeline execution history and errors
--
-- All tables use UUID primary keys (gen_random_uuid()) and include
-- created_at/updated_at timestamps. Row Level Security (RLS) is enabled
-- but policies are deferred to Session 5 (Database Schema + API session).
-- ============================================================================

-- ─── 1. FUNDS TABLE ─────────────────────────────────────────────────────────
-- Represents the mutual funds available in the TerrAscend 401(k) plan.
-- Each row is a fund the system knows about. The is_active flag marks
-- which funds are currently in the plan's menu.

CREATE TABLE IF NOT EXISTS funds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  cik           TEXT NOT NULL DEFAULT '',
  series_id     TEXT NOT NULL DEFAULT '',
  expense_ratio NUMERIC(6, 4)    DEFAULT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_funds_ticker ON funds (ticker);
CREATE INDEX IF NOT EXISTS idx_funds_active ON funds (is_active) WHERE is_active = true;

COMMENT ON TABLE funds IS 'Mutual funds in the TerrAscend 401(k) plan menu';
COMMENT ON COLUMN funds.ticker IS 'Fund ticker symbol (e.g. VFIAX)';
COMMENT ON COLUMN funds.cik IS 'SEC Central Index Key for EDGAR lookups';
COMMENT ON COLUMN funds.series_id IS 'SEC series ID for the fund';
COMMENT ON COLUMN funds.expense_ratio IS 'Annual expense ratio as decimal (e.g. 0.0004 = 0.04%)';
COMMENT ON COLUMN funds.is_active IS 'Whether this fund is currently in the 401(k) menu';


-- ─── 2. HOLDINGS CACHE TABLE ────────────────────────────────────────────────
-- Stores parsed EDGAR holdings for each fund and filing period.
-- One row per holding per fund per report_date.
--
-- The pipeline writes a complete set of holdings each time it processes
-- a fund's NPORT-P filing. Old holdings from previous filings are kept
-- for historical reference but the latest report_date is what scoring uses.

CREATE TABLE IF NOT EXISTS holdings_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id           UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  accession_number  TEXT NOT NULL,
  report_date       DATE NOT NULL,
  name              TEXT NOT NULL,
  cusip             TEXT NOT NULL,
  ticker            TEXT             DEFAULT NULL,
  pct_of_nav        NUMERIC(12, 8)  NOT NULL DEFAULT 0,
  value_usd         NUMERIC(16, 2)  NOT NULL DEFAULT 0,
  asset_category    TEXT             DEFAULT NULL,
  country           TEXT             DEFAULT NULL,
  sector            TEXT             DEFAULT NULL,
  is_look_through   BOOLEAN NOT NULL DEFAULT false,
  parent_fund_name  TEXT             DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index: look up all holdings for a fund's latest filing
CREATE INDEX IF NOT EXISTS idx_holdings_fund_date
  ON holdings_cache (fund_id, report_date DESC);

-- Look up by CUSIP (for dedup checks and cross-fund analysis)
CREATE INDEX IF NOT EXISTS idx_holdings_cusip
  ON holdings_cache (cusip);

-- Unique constraint: prevent duplicate holdings per fund per filing
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_unique
  ON holdings_cache (fund_id, accession_number, cusip);

COMMENT ON TABLE holdings_cache IS 'Parsed EDGAR NPORT-P holdings per fund per filing period';
COMMENT ON COLUMN holdings_cache.pct_of_nav IS 'Percentage of fund NAV (0.0–1.0 scale)';
COMMENT ON COLUMN holdings_cache.sector IS 'Sector classification from Claude Haiku (populated in scoring step)';
COMMENT ON COLUMN holdings_cache.is_look_through IS 'True if this holding came from looking through a sub-fund (fund-of-funds)';
COMMENT ON COLUMN holdings_cache.parent_fund_name IS 'If look-through, the name of the sub-fund this holding came from';


-- ─── 3. CUSIP CACHE TABLE ───────────────────────────────────────────────────
-- Persistent CUSIP→ticker mappings from OpenFIGI.
-- Prevents calling OpenFIGI for CUSIPs we've already resolved.
-- CUSIPs that could not be resolved are also cached (resolved = false)
-- so we don't re-query them every run.

CREATE TABLE IF NOT EXISTS cusip_cache (
  cusip          TEXT PRIMARY KEY,
  ticker         TEXT         DEFAULT NULL,
  name           TEXT         DEFAULT NULL,
  security_type  TEXT         DEFAULT NULL,
  resolved       BOOLEAN NOT NULL DEFAULT false,
  resolved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Look up by ticker (for reverse lookups or cross-referencing)
CREATE INDEX IF NOT EXISTS idx_cusip_ticker
  ON cusip_cache (ticker) WHERE ticker IS NOT NULL;

COMMENT ON TABLE cusip_cache IS 'Persistent CUSIP→ticker mappings from OpenFIGI';
COMMENT ON COLUMN cusip_cache.resolved IS 'True if OpenFIGI returned a valid ticker; false if lookup failed';


-- ─── 4. PIPELINE RUNS TABLE ─────────────────────────────────────────────────
-- Tracks each pipeline execution for monitoring and debugging.
-- The "Run Pipeline Now" button in the UI (Session 10) reads this table
-- to show the user when scores were last updated and whether it succeeded.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id         UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ          DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),
  failed_step     TEXT         DEFAULT NULL,
  error_message   TEXT         DEFAULT NULL,
  coverage_stats  JSONB        DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most recent runs per fund (for dashboard status indicator)
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_fund_status
  ON pipeline_runs (fund_id, started_at DESC);

COMMENT ON TABLE pipeline_runs IS 'Pipeline execution history per fund';
COMMENT ON COLUMN pipeline_runs.failed_step IS 'Which pipeline step failed (null if success)';
COMMENT ON COLUMN pipeline_runs.coverage_stats IS 'JSON object with holdingsIncluded, holdingsTotal, weightCovered, cutoffReason';


-- ─── AUTO-UPDATE updated_at TRIGGER ─────────────────────────────────────────
-- Automatically sets updated_at on the funds table when a row is modified.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_funds_updated_at
  BEFORE UPDATE ON funds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ─── ENABLE ROW LEVEL SECURITY ──────────────────────────────────────────────
-- RLS is enabled but no policies are added yet.
-- Session 5 (Database Schema + API) will add proper policies.
-- For now, use the service_role key in the pipeline (bypasses RLS).

ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cusip_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
