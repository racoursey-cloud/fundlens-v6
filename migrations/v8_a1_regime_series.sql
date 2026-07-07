-- ============================================================================
-- FundLens v8 — A1 Task 1: regime_series — the series registry
--
-- One row per approved data series the regime harness may fetch: where it
-- comes from, which axis it informs (growth / inflation / stress / rates),
-- its trust tier, how often it publishes, and how its history may be
-- replayed honestly (charter §4.2·5 source quality bar; §5 data law).
--
-- Stage 3 turns series on or off by the `enabled` flag — never by schema
-- change (A1 §2). Insurance-tier rows seed DORMANT (enabled=false) per
-- ratified ruling D1 (July 6, 2026): the registry records the channel;
-- adapters are built only on a named trigger.
--
-- Series codes for non-FRED sources (ofr, cleveland) are adapter-defined
-- internal codes, not publisher IDs — the publisher offers no series-ID
-- namespace; the adapter owns the mapping.
--
-- APPLY ORDER: 1st of 4 — regime_observations references this table.
-- Run in the Supabase SQL Editor BEFORE merging the A1 code PR
-- (charter §3 migrations-before-merges; A0 precedent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS regime_series (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT NOT NULL CHECK (source IN ('fred', 'ofr', 'cleveland', 'cboe')),
  series_code      TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  axis             TEXT NOT NULL CHECK (axis IN ('growth', 'inflation', 'stress', 'rates')),
  tier             TEXT NOT NULL CHECK (tier IN ('load_bearing', 'timeliness', 'confirmation', 'insurance')),
  cadence          TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'irregular')),
  vintage_policy   TEXT NOT NULL CHECK (vintage_policy IN ('alfred', 'never_revised', 'alfred_windowed', 'snapshot_custom')),
  fallback_channel TEXT DEFAULT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_series_source_code
  ON regime_series (source, series_code);

COMMENT ON TABLE regime_series IS
  'Registry of approved regime data series — source, axis, tier, cadence, vintage/replay policy (A1 Task 1; charter §4.2·5, §5)';
COMMENT ON COLUMN regime_series.vintage_policy IS
  'How history replays honestly: alfred = ALFRED vintages; never_revised = published value is final (watched by the Task 7 integrity alert); alfred_windowed = ALFRED but FRED clamps the window (live duty only); snapshot_custom = replay begins where our own snapshots begin (charter §4.2·6)';
COMMENT ON COLUMN regime_series.fallback_channel IS
  'Named fallback data channel (e.g. BLS/BEA direct APIs) — a channel on record, not a built adapter; a missed-publication alert is the named trigger that opens a build slice (ruling D1; charter §4.2·9)';
COMMENT ON COLUMN regime_series.enabled IS
  'Stage 3 flips this flag to admit or retire a series — never a schema change (A1 §2). Insurance tier seeds false (ruling D1)';

ALTER TABLE regime_series ENABLE ROW LEVEL SECURITY;

-- ── Seed: the Task 1 table, exactly (20 rows: 17 enabled, 3 dormant) ────────
-- ADS Index, NY Fed Nowcast, and FCI-G are deliberately ABSENT: unverified —
-- registry rows only after Stage 3 verifies (charter §4.2·7; confirmed at S1).

INSERT INTO regime_series
  (source, series_code, display_name, axis, tier, cadence, vintage_policy, fallback_channel, enabled, notes)
VALUES
  -- Growth axis
  ('fred', 'CFNAI', 'Chicago Fed National Activity Index', 'growth', 'load_bearing', 'monthly', 'alfred', NULL, true,
   '85-indicator national activity composite (Record 01 §6.3)'),
  ('fred', 'SAHMREALTIME', 'Sahm rule recession indicator (real-time)', 'growth', 'timeliness', 'monthly', 'alfred', NULL, true,
   '0.50pp trigger; built from as-available unemployment data (Record 01 §6.3)'),
  ('fred', 'GDPNOW', 'Atlanta Fed GDPNow nowcast', 'growth', 'timeliness', 'irregular', 'alfred', NULL, true,
   '~6-7 updates/month within quarter; purely model-driven; irregular cadence is exempt from the expectations check (A1 Task 6)'),
  ('fred', 'WEI', 'Weekly Economic Index', 'growth', 'confirmation', 'weekly', 'alfred', NULL, true,
   'Composite of 10 high-frequency series, scaled to four-quarter GDP growth (Record 01 §6.3)'),
  -- Inflation axis
  ('fred', 'CPILFESL', 'Core CPI (less food & energy)', 'inflation', 'load_bearing', 'monthly', 'alfred', 'BLS Public Data API v2', true,
   'Official anchor (BLS). Fallback channel on record per ruling D1 — not a built adapter'),
  ('fred', 'PCEPILFE', 'Core PCE price index', 'inflation', 'load_bearing', 'monthly', 'alfred', 'BEA API', true,
   'The Fed''s target measure (BEA). Fallback channel on record per ruling D1 — not a built adapter'),
  ('fred', 'CPIAUCSL', 'Headline CPI (all urban)', 'inflation', 'load_bearing', 'monthly', 'alfred', 'BLS Public Data API v2', true,
   'Official anchor (BLS). Fallback channel on record per ruling D1 — not a built adapter'),
  ('fred', 'PCEPI', 'Headline PCE price index', 'inflation', 'load_bearing', 'monthly', 'alfred', 'BEA API', true,
   'BEA. Fallback channel on record per ruling D1 — not a built adapter'),
  ('fred', 'T10YIE', '10-year breakeven inflation rate', 'inflation', 'timeliness', 'daily', 'never_revised', NULL, true,
   'Publishes via H.15 ~16:15 ET; not revised once published — the Task 7 never-revised watch applies (Record 01 §6.4)'),
  ('fred', 'T5YIFR', '5-year, 5-year forward inflation expectation', 'inflation', 'timeliness', 'daily', 'never_revised', NULL, true,
   'The Fed''s preferred long-run market anchor; never-revised watch applies (Record 01 §6.4)'),
  ('cleveland', 'CLEV_CPI_NOWCAST', 'Cleveland Fed daily CPI nowcast', 'inflation', 'timeliness', 'daily', 'snapshot_custom', NULL, true,
   'Adapter-defined code. ~10:00 ET business days; replay begins where our snapshots begin unless Task 5 finds a publisher archive (Record 01 §6.4)'),
  ('cleveland', 'CLEV_PCE_NOWCAST', 'Cleveland Fed daily PCE nowcast', 'inflation', 'timeliness', 'daily', 'snapshot_custom', NULL, true,
   'Adapter-defined code. ~10:00 ET business days; same replay basis as the CPI nowcast (Record 01 §6.4)'),
  -- Stress axis
  ('ofr', 'OFR_FSI', 'OFR Financial Stress Index', 'stress', 'load_bearing', 'daily', 'snapshot_custom', NULL, true,
   'Adapter-defined code. Open JSON API, no registration; daily history to Jan 2000; data current through ~2 business days prior. Charter §5: the backtest mitigation for the HY OAS window (Record 01 §6.5)'),
  ('fred', 'BAMLH0A0HYM2', 'High-yield option-adjusted spread (ICE BofA)', 'stress', 'confirmation', 'daily', 'alfred_windowed', NULL, true,
   'LIVE DUTY ONLY — FRED clamps ICE BofA series to a rolling 3-year window (Apr 2026); replay past the window rides OFR FSI per charter §5 (Record 01 §6.1, §6.5)'),
  ('fred', 'VIXCLS', 'CBOE Volatility Index (VIX), daily close', 'stress', 'confirmation', 'daily', 'never_revised', NULL, true,
   'Cboe full-history public file (1990-present) is the backstop — belt and suspenders (charter §5; Record 01 §6.5). Never-revised watch applies'),
  ('fred', 'NFCI', 'Chicago Fed National Financial Conditions Index', 'stress', 'confirmation', 'weekly', 'alfred', NULL, true,
   'Wed 8:30 ET, through prior Friday; published history revises week to week — vintage policy is load-bearing here (Record 01 §6.5)'),
  -- Rates axis
  ('fred', 'T10Y3M', '10-year minus 3-month Treasury spread', 'rates', 'confirmation', 'daily', 'never_revised', NULL, true,
   'An input, NEVER a sole trigger (charter §5 yield-curve clause; Record 01 honesty flag 1). Stage 3 may swap for Treasury-direct or GSW curves (charter §4.2·7)'),
  -- Insurance tier — seeded DORMANT per ruling D1
  ('fred', 'STLFSI4', 'St. Louis Fed Financial Stress Index v4', 'stress', 'insurance', 'weekly', 'alfred', NULL, false,
   'Dormant (ruling D1). 18 series; zero = normal; history to Dec 1993 (Record 01 §6.5)'),
  ('fred', 'EXPINF1YR', 'Cleveland Fed 1-year expected inflation', 'inflation', 'insurance', 'monthly', 'alfred', NULL, false,
   'Dormant (ruling D1). One of the two-row Cleveland expectations pair — one series code per row (confirmed at S1, July 6)'),
  ('fred', 'EXPINF10YR', 'Cleveland Fed 10-year expected inflation', 'inflation', 'insurance', 'monthly', 'alfred', NULL, false,
   'Dormant (ruling D1). Second of the two-row Cleveland expectations pair (confirmed at S1, July 6)');
