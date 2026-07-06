-- ============================================================================
-- FundLens v8 — A1 Task 2: regime_ingest_runs — ingest run tracking
--
-- One row per harness run (daily sweep, morning expectations check, backfill,
-- or manual trigger), mirroring the pipeline_runs liveness shape so the A0
-- heartbeat machinery and THE shared staleness rule (monitor.ts runIsStale)
-- read both tables with one definition of "stale" (charter §6·1; A1 Task 7).
--
-- Column vocabulary matches pipeline_runs: completed_at, not finished_at
-- (amended at S1, July 6).
--
-- APPLY ORDER: 2nd of 4 — regime_observations references this table.
-- Run in the Supabase SQL Editor BEFORE merging the A1 code PR
-- (charter §3 migrations-before-merges; A0 precedent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS regime_ingest_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('sweep', 'expectations_check', 'backfill', 'manual')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A0 pattern: stamped ~every 60s by the running process; the shared
  -- liveness rule falls back to started_at when stamps never land
  heartbeat_at     TIMESTAMPTZ DEFAULT NULL,
  completed_at     TIMESTAMPTZ DEFAULT NULL,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  series_attempted INT NOT NULL DEFAULT 0,
  rows_written     INT NOT NULL DEFAULT 0,
  error            TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_regime_ingest_runs_status
  ON regime_ingest_runs (status, started_at DESC);

COMMENT ON TABLE regime_ingest_runs IS
  'Regime harness run history — sweep / expectations_check / backfill / manual — with A0-pattern heartbeat liveness (A1 Task 2; charter §6·1)';
COMMENT ON COLUMN regime_ingest_runs.heartbeat_at IS
  'Last sign of life, stamped ~every 60s by the running process; read by the shared runIsStale rule (A0 pattern, v8_a0_pipeline_runs_heartbeat precedent)';

ALTER TABLE regime_ingest_runs ENABLE ROW LEVEL SECURITY;
