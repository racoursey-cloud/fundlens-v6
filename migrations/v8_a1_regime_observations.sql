-- ============================================================================
-- FundLens v8 — A1 Task 2: regime_observations — the vintage memory
--
-- Shaped like ALFRED itself: every value carries the date it DESCRIBES
-- (obs_date) and the date it was PUBLISHED (realtime_start). Revisions
-- insert new rows and close the superseded row's realtime_end; NO row is
-- ever updated in place except to close realtime_end (charter §2.5
-- regime-of-record law; §4.2·6 vintage law; A1 §2 "Memory").
--
-- This is what makes "same inputs → same regime" physically true: the race
-- replays history through rows exactly as they were published, never a
-- revised number before its revision existed (charter §2.3 race law).
--
-- realtime_end semantics (ALFRED): NULL = this vintage is still current;
-- a date = the day a later vintage superseded it.
--
-- APPLY ORDER: 3rd of 4 — references regime_series AND regime_ingest_runs.
-- Run in the Supabase SQL Editor BEFORE merging the A1 code PR
-- (charter §3 migrations-before-merges; A0 precedent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS regime_observations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id      UUID NOT NULL REFERENCES regime_series(id) ON DELETE CASCADE,
  -- The period the value describes (e.g. May 2026 for May CPI)
  obs_date       DATE NOT NULL,
  value          NUMERIC NOT NULL,
  -- The load-bearing column: the date this value was published / first
  -- available to an observer (ALFRED vintage date)
  realtime_start DATE NOT NULL,
  -- NULL = still the current vintage; set (never any other in-place edit)
  -- when a later vintage supersedes this row
  realtime_end   DATE DEFAULT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingest_run_id  UUID DEFAULT NULL REFERENCES regime_ingest_runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_obs_vintage
  ON regime_observations (series_id, obs_date, realtime_start);
-- As-of queries: "newest vintage of series S published on or before date D"
CREATE INDEX IF NOT EXISTS idx_regime_obs_asof
  ON regime_observations (series_id, realtime_start, obs_date);

COMMENT ON TABLE regime_observations IS
  'ALFRED-shaped vintage memory: every value stored as published on the day we saw it; revisions are new rows, never overwrites (A1 Task 2; charter §2.5, §4.2·6)';
COMMENT ON COLUMN regime_observations.realtime_start IS
  'Publication/vintage date — the load-bearing column; the as-of replay interface (A1 Task 8) filters on it';
COMMENT ON COLUMN regime_observations.realtime_end IS
  'ALFRED semantics: NULL = still current; a date = when a later vintage superseded this row. Closing it is the ONLY permitted in-place update';

ALTER TABLE regime_observations ENABLE ROW LEVEL SECURITY;
