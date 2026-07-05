-- ============================================================================
-- FundLens v7 — A5 Task 4: admin flag on user_profiles
--
-- WHY (lessons of July 5, 2026): /pipeline was reachable by any logged-in
-- account, and admin identity lived only in a hardcoded email list. This
-- column makes admin a per-account fact the server checks in the database.
-- requireAdmin (routes.ts) reads it; the client shows the Pipeline nav link
-- and the Refresh Analysis button only when it is true.
--
-- Run in the Supabase SQL Editor BEFORE merging/deploying the A5 Task 4 code.
-- (The code keeps the old email list as a read-only fallback, so running
-- this late cannot lock Robert out — but run it first anyway.)
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_admin IS
  'Admin accounts see /pipeline and its endpoints; everyone else gets a clean redirect home (A5 Task 4)';

-- Robert's account is the only admin.
UPDATE user_profiles SET is_admin = true WHERE email = 'racoursey@gmail.com';

-- Verify (should return exactly one row, Robert's):
-- SELECT id, email, is_admin FROM user_profiles WHERE is_admin = true;
