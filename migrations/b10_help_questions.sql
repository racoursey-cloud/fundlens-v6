-- B10 c2 — Help exchange log (rulings 5, 7: the post-review mechanism)
-- One row per exchange: what was asked, what was served, how it resolved.
-- With pre-review overridden (ruling 8), this table is how Robert and HR
-- review what members were actually told. Disclosed in the UI in one line.
CREATE TABLE IF NOT EXISTS help_questions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'refused', 'rejected', 'error')),
  reject_reason TEXT
);
COMMENT ON TABLE help_questions IS
  'B10: log of reference Help exchanges (question, served answer, outcome). rejected = a generated reply tripped a post-check and was not served (reject_reason names the tripped word). Zero-policy RLS, service-role only. Never written by the nightly pipeline.';
ALTER TABLE help_questions ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'help_questions';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'help_questions';  -- expect 0
