-- ============================================================================
-- FundLens — B1: account tiers, signup exceptions, example allocations
-- (B-series plan, ratified July 27, 2026 — §1.2, §1.3, assignment B1)
--
-- WHY: the reference tier (HR Edition) needs three things in the database
-- before the B2 server-enforcement code can merge:
--   1. A per-account access tier — 'reference' (default for every new signup)
--      or 'full' — that the server reads and enforces on every request.
--   2. An allowlist for non-company-domain signups (e.g., former employees
--      with balances). Empty at launch; rows added by Robert only.
--   3. Storage for self-authored "example mix" allocations (B5/B6):
--      one row per user, private, deletable.
--
-- Robert runs this file in the Supabase SQL Editor. It must run BEFORE the
-- B2 code merges. No code deploy accompanies this migration.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: access_tier column on user_profiles
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'reference'
  CHECK (access_tier IN ('reference','full'));

COMMENT ON COLUMN user_profiles.access_tier IS
  'Server-enforced account tier (B-series §1.2): ''reference'' (default — factual data only, never scores/tiers/verdicts) or ''full''. Flipped to ''full'' by Robert only.';

-- Robert's account is the only full-tier account at launch.
-- (Email mirrors a5_task4_user_profiles_admin.sql.)
UPDATE user_profiles SET access_tier = 'full' WHERE email = 'racoursey@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: access_exceptions — signup allowlist for non-company domains
-- ═══════════════════════════════════════════════════════════════════════════

-- Purpose: non-company-domain plan participants (e.g., former employees with
-- balances) whom Robert explicitly permits. Empty at launch; rows added by
-- Robert only. The B2 domain gate consults this table server-side.

CREATE TABLE IF NOT EXISTS access_exceptions (
  email    TEXT PRIMARY KEY,
  note     TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- RLS enabled with NO policies: the anon and authenticated roles can do
-- nothing here. Only the service role — which bypasses RLS by design —
-- reads this table during the B2 domain gate check.
ALTER TABLE access_exceptions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: example_allocations — self-authored example mixes (B5/B6)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS example_allocations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  allocations JSONB NOT NULL,                 -- array of { fund_id, pct }
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS patterned on session9_continuous_risk_and_alloc_history.sql, with one
-- deliberate difference ruled by Robert at the B1 Evidence Gate (July 27,
-- 2026): no write policies at all. The service role bypasses RLS, so
-- server-side writes need no policy; omitting session9's permissive
-- CHECK (true) insert policy means no logged-in account can write rows
-- directly — user A can never write user B's mix (B5 acceptance).
ALTER TABLE example_allocations ENABLE ROW LEVEL SECURITY;

-- Users can read their own example mix
CREATE POLICY "Users can read own example allocations"
  ON example_allocations FOR SELECT
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — Robert runs each query separately after the migration (B1
-- acceptance). The SQL Editor shows one result set at a time.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Exactly one full-tier row, Robert's:
SELECT id, email, access_tier FROM user_profiles WHERE access_tier = 'full';

-- 2) Both new tables exist with rls_enabled = true:
SELECT tablename, rowsecurity AS rls_enabled
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('access_exceptions', 'example_allocations')
 ORDER BY tablename;
