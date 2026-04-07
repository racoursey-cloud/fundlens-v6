-- Session 7: Add tier badge columns to fund_scores (§6.3)
-- Run in Supabase SQL Editor before deploying.
-- Existing rows get 'Neutral' as default; next pipeline run populates real tiers.

ALTER TABLE fund_scores
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'Neutral',
  ADD COLUMN IF NOT EXISTS tier_color TEXT NOT NULL DEFAULT '#6B7280';

-- Optional index for filtering by tier
CREATE INDEX IF NOT EXISTS idx_fund_scores_tier ON fund_scores (tier);
