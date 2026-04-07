-- ============================================================================
-- Session 4 Migration: Add z-score columns to fund_scores
--
-- The z-space + CDF scoring pipeline (spec §2.1) computes z-scores on the
-- server during pipeline runs. These z-scores are persisted so the client
-- can do instant rescore when users adjust weight sliders:
--   client composite = 100 × Φ(z_cost × w_cost + z_quality × w_quality + ...)
--
-- Run this in Supabase SQL Editor before deploying Session 4 code.
-- ============================================================================

-- Add z-score columns (default 0 for existing rows — will be populated on next pipeline run)
ALTER TABLE fund_scores ADD COLUMN IF NOT EXISTS z_cost_efficiency NUMERIC(8, 5) NOT NULL DEFAULT 0;
ALTER TABLE fund_scores ADD COLUMN IF NOT EXISTS z_holdings_quality NUMERIC(8, 5) NOT NULL DEFAULT 0;
ALTER TABLE fund_scores ADD COLUMN IF NOT EXISTS z_positioning NUMERIC(8, 5) NOT NULL DEFAULT 0;
ALTER TABLE fund_scores ADD COLUMN IF NOT EXISTS z_momentum NUMERIC(8, 5) NOT NULL DEFAULT 0;

COMMENT ON COLUMN fund_scores.z_cost_efficiency IS 'Z-score for cost efficiency (Bessel-corrected, across fund universe). Session 4, §2.1.';
COMMENT ON COLUMN fund_scores.z_holdings_quality IS 'Z-score for holdings quality (Bessel-corrected, across fund universe). Session 4, §2.1.';
COMMENT ON COLUMN fund_scores.z_positioning IS 'Z-score for positioning (Bessel-corrected, across fund universe). Session 4, §2.1.';
COMMENT ON COLUMN fund_scores.z_momentum IS 'Z-score for momentum (Bessel-corrected, across fund universe). Session 4, §2.1.';
