-- Session 9: Continuous Risk Slider (MISSING-11) + Allocation History (MISSING-12)
-- Run in Supabase SQL Editor before deploying Session 9 code.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: Continuous Risk Tolerance (§3.4, §6.4)
-- ═══════════════════════════════════════════════════════════════════════════

-- Change risk_tolerance from integer to float for continuous slider support.
-- Existing integer values (e.g. 4) cast cleanly to float (4.0).
ALTER TABLE user_profiles
  ALTER COLUMN risk_tolerance TYPE DOUBLE PRECISION
  USING risk_tolerance::DOUBLE PRECISION;

-- Add CHECK constraint for valid range (1.0–7.0)
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_risk_tolerance_range
  CHECK (risk_tolerance >= 1.0 AND risk_tolerance <= 7.0);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: Allocation History Table (§7.7)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS allocation_history (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  pipeline_run_id UUID NOT NULL,
  brief_id        UUID,                          -- nullable: null for pipeline-only runs
  risk_tolerance  DOUBLE PRECISION NOT NULL,      -- user's risk level at time of allocation
  allocations     JSONB NOT NULL,                 -- array of { ticker, pct, tier, tierColor }
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient "most recent allocation for user" queries
CREATE INDEX IF NOT EXISTS idx_alloc_history_user
  ON allocation_history(user_id, created_at DESC);

-- Index for joining with pipeline runs
CREATE INDEX IF NOT EXISTS idx_alloc_history_pipeline
  ON allocation_history(pipeline_run_id);

-- Enable RLS (service_role bypasses; matches pattern of other tables)
ALTER TABLE allocation_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own allocation history
CREATE POLICY "Users can read own allocation history"
  ON allocation_history FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (server-side only)
CREATE POLICY "Service role can insert allocation history"
  ON allocation_history FOR INSERT
  WITH CHECK (true);
