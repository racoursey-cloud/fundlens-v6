-- B9 c1 — Official fund descriptions (SEC-filed verbatim text + translation)
CREATE TABLE IF NOT EXISTS fund_descriptions (
  fund_id UUID PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
  objective_text TEXT NOT NULL,
  strategies_text TEXT NOT NULL,
  source_accession TEXT NOT NULL,
  source_series_id TEXT NOT NULL,
  filing_ddate DATE NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  translation_text TEXT,
  translation_generated_at TIMESTAMPTZ,
  translation_model TEXT
);
COMMENT ON TABLE fund_descriptions IS
  'B9: per-fund SEC-filed Investment Objective + Principal Investment Strategies (verbatim; conduit principle) plus the app-authored plain-English translation (flag-gated). Seeded by operator-run SQL; never written by the nightly pipeline.';
ALTER TABLE fund_descriptions ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'fund_descriptions';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'fund_descriptions';  -- expect 0
