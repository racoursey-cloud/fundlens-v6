-- ============================================================================
-- FundLens — B3: reference profile birth state
-- (D2 re-ruling, Fabio, July 27, 2026 — supersedes the B3 planning-session
--  no-DB-change ruling)
--
-- WHY: every profile is created by the on_auth_user_created trigger BEFORE
-- any API call runs, so profiles have been born with column defaults that
-- say two untrue things about reference accounts:
--   - setup_completed = false  ("setup pending" — but reference accounts
--     have no wizard; nothing is pending)
--   - briefs_enabled = true    ("Briefs on" — consent the user never gave;
--     inert today only because the B2 scheduler filter is tier-scoped)
-- After this migration, reference profiles are born truthful:
--   setup_completed = true, briefs_enabled = false.
--
-- THE FLIP PROCEDURE (promoting an account to the full engine) is one
-- statement, both columns together:
--
--   UPDATE public.user_profiles
--      SET access_tier = 'full', setup_completed = false
--    WHERE email = '<the account>';
--
-- setup_completed = false hands the promoted account to the existing wizard
-- machinery on next login. briefs_enabled is NEVER set by the flip or by
-- the wizard (verified: the setup route writes weights/risk/funds/setup
-- only) — Briefs remain the user's own choice in Settings.
--
-- Robert runs this file in the Supabase SQL Editor after the PR #49 merge.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: rewrite the profile-birth function
-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE keeps the existing on_auth_user_created trigger binding
-- — no trigger DDL in this file. SECURITY DEFINER and the display_name
-- COALESCE are preserved exactly; the INSERT gains two columns. Every
-- trigger-born row is 'reference' (the access_tier column default from the
-- b1 migration), so the truthful reference birth state applies to every new
-- signup; 'full' exists only via the flip procedure above.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, setup_completed, briefs_enabled)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    true,
    false
  );
  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: one-time correction of existing reference rows
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes the two existing test rows and any reference row born before this
-- file ran. Robert's full-tier row is untouched by design (the access_tier
-- filter excludes it).

UPDATE public.user_profiles
   SET setup_completed = true, briefs_enabled = false
 WHERE access_tier = 'reference';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — Robert runs each query separately after the migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) The reborn function. Expected: the definition from Part 1 — SECURITY
--    DEFINER preserved, INSERT carrying setup_completed and briefs_enabled.
SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

-- 2) Row states. Expected: every 'reference' row shows setup_completed =
--    true AND briefs_enabled = false; Robert's 'full' row is unchanged by
--    this file (his setup_completed/briefs_enabled keep their prior values).
SELECT email, access_tier, setup_completed, briefs_enabled
  FROM public.user_profiles
 ORDER BY access_tier;
