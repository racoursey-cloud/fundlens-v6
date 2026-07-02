-- ============================================================================
-- FundLens v7 — A3 Task 4: Fund Dossier table
--
-- One row per fund per pipeline run: a persisted, versioned record of the
-- fund's data-quality state, graded against the ratified pass thresholds
-- (July 1, 2026: >= 90% of NAV resolved, >= 95% classified).
--
-- "Classified" counts only real signals (EDGAR metadata, cache, Claude) —
-- holdings labeled 'Other' by the pipeline's last-resort rule count as
-- UNCLASSIFIED (Robert's July 2 decision; Founding Principle 2).
--
-- Money market funds pass as a special case (identity + expenses + NAV;
-- no N-PORT holdings) per Founding §3 Layer 0.
--
-- Run in the Supabase SQL Editor BEFORE deploying the A3 code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_dossiers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                   UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  pipeline_run_id           UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  -- Dossier schema version (bump when the contract's fields/meanings change)
  version                   INT NOT NULL DEFAULT 1,
  -- Source filing identity (also enables A4+ skip-if-unchanged)
  accession_number          TEXT DEFAULT NULL,
  report_date               DATE DEFAULT NULL,
  -- Coverage metrics (whole-percent, e.g. 92.50 = 92.5%)
  nav_resolved_pct          NUMERIC(6, 2) NOT NULL DEFAULT 0,
  classified_pct            NUMERIC(6, 2) NOT NULL DEFAULT 0,
  weight_covered_pct        NUMERIC(6, 2) NOT NULL DEFAULT 0,
  holdings_included         INT NOT NULL DEFAULT 0,
  holdings_total            INT NOT NULL DEFAULT 0,
  -- Fund-of-funds look-through status
  lookthrough_detected      BOOLEAN NOT NULL DEFAULT false,
  lookthrough_subfunds      INT NOT NULL DEFAULT 0,
  -- Scoring data-quality flags
  fallback_count            INT NOT NULL DEFAULT 0,
  coverage_scaling_applied  BOOLEAN NOT NULL DEFAULT false,
  quality_coverage_pct      NUMERIC(6, 2) NOT NULL DEFAULT 0,
  -- Gate result against ratified thresholds (90 / 95)
  is_money_market           BOOLEAN NOT NULL DEFAULT false,
  passes_gate               BOOLEAN NOT NULL DEFAULT false,
  fail_reasons              JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dossier_unique
  ON fund_dossiers (fund_id, pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_dossier_run
  ON fund_dossiers (pipeline_run_id);

COMMENT ON TABLE fund_dossiers IS
  'Per-fund per-run data-quality Dossier, graded against the ratified 90/95 thresholds (A3 Task 4)';

ALTER TABLE fund_dossiers ENABLE ROW LEVEL SECURITY;
