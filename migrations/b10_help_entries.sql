-- B10 c1 cure — drop the empty help_entries created minutes earlier with
-- superseded v1 header comments (structural SQL identical; Robert-approved
-- drop, August 1, 2026), then reapply with the ratified order's exact text.
DROP TABLE help_entries;
-- B10 c1 — Help grounding corpus (reviewed explainer material; ruling 3)
-- Source material handed to the reference Help agent — not the only
-- servable text (ruling 8: answers are generated). Tier isolation layer (a):
-- reference Help reads WHERE tier='reference' AND status='approved'.
CREATE TABLE IF NOT EXISTS help_entries (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL DEFAULT 'reference' CHECK (tier IN ('reference', 'full')),
  slug TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  drafted_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE help_entries IS
  'B10: reviewed grounding material for the reference Help agent (B9 Translation register — explain, never evaluate). Drafted by the admin-only generate route or Robert; grounds the model only at status=approved. Never written by the nightly pipeline.';
ALTER TABLE help_entries ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'help_entries';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'help_entries';  -- expect 0
