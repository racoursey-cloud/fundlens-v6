-- ============================================================================
-- FundLens v7 — A4 Task 5: Haiku industry classification cache
--
-- For holdings with no FMP-coverable symbol (home-exchange-only foreign
-- names — roughly the smallest 15% of weight), Claude Haiku classifies
-- against the SAME 159-industry FMP menu (pinned in src/engine/industries.ts)
-- so the whole dataset speaks one taxonomy.
--
-- Keyed by (holding_name, asset_type) — the A3 keying scheme, so a bond
-- issuer's name can never poison a same-named stock. 15-day TTL, matching
-- sector_classifications. 'Other' rows are cached too (avoids re-asking
-- Haiku about unclassifiable names every run) but count as UNCLASSIFIED
-- in the Dossier coverage metric (July 2 decision).
--
-- Run in the Supabase SQL Editor BEFORE merging/deploying the A4 code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS industry_classifications (
  holding_name  TEXT NOT NULL,
  asset_type    TEXT NOT NULL DEFAULT 'other',
  industry      TEXT NOT NULL,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (holding_name, asset_type)
);

CREATE INDEX IF NOT EXISTS idx_industry_class_cached_at
  ON industry_classifications (cached_at);

COMMENT ON TABLE industry_classifications IS
  'Claude Haiku industry classifications against the pinned FMP menu — 15-day TTL, keyed by (holding name, asset type) (A4 Task 5)';

ALTER TABLE industry_classifications ENABLE ROW LEVEL SECURITY;
