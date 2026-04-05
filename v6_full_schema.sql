-- ============================================================================
-- FundLens v6 — Complete Database Schema
-- Session 5 deliverable (supersedes v6_holdings_schema.sql from Session 2)
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- This creates ALL tables for FundLens v6 in one go.
--
-- Tables:
--   1. funds              — the 401(k) fund menu
--   2. holdings_cache     — parsed EDGAR holdings per fund per filing period
--   3. cusip_cache        — persistent CUSIP→ticker mappings from OpenFIGI
--   4. pipeline_runs      — tracks pipeline execution history and errors
--   5. user_profiles      — user preferences (risk tolerance, factor weights)
--   6. fund_scores        — raw factor scores per fund per pipeline run
--   7. investment_briefs  — generated Investment Brief documents
--   8. brief_deliveries   — tracks which briefs have been emailed to which users
--
-- Auth: Supabase Auth handles user creation via magic link.
--   The auth.users table is managed by Supabase. Our user_profiles table
--   links to auth.users(id) to store FundLens-specific preferences.
--
-- RLS: All tables have Row Level Security enabled with policies.
--   - Pipeline/engine code uses service_role key (bypasses RLS)
--   - Client-facing API routes go through Express (which validates JWTs)
--   - RLS policies are defense-in-depth, not the primary access control
--
-- NOTE: If you already ran v6_holdings_schema.sql from Session 2, the
-- IF NOT EXISTS clauses will skip the existing tables. You only need to
-- run the new tables (5-8) and the RLS policies / new columns.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION A: DATA TABLES (Holdings Pipeline — from Session 2)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. FUNDS ──────────────────────────────────────────────────────────────
-- Mutual funds in the TerrAscend 401(k) plan.

CREATE TABLE IF NOT EXISTS funds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  cik           TEXT NOT NULL DEFAULT '',
  series_id     TEXT NOT NULL DEFAULT '',
  expense_ratio NUMERIC(6, 4)    DEFAULT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funds_ticker ON funds (ticker);
CREATE INDEX IF NOT EXISTS idx_funds_active ON funds (is_active) WHERE is_active = true;

COMMENT ON TABLE funds IS 'Mutual funds in the TerrAscend 401(k) plan menu';
COMMENT ON COLUMN funds.expense_ratio IS 'Annual expense ratio as decimal (e.g. 0.0004 = 0.04%)';


-- ─── 2. HOLDINGS CACHE ────────────────────────────────────────────────────
-- Parsed EDGAR NPORT-P holdings for each fund.

CREATE TABLE IF NOT EXISTS holdings_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id           UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  accession_number  TEXT NOT NULL,
  report_date       DATE NOT NULL,
  name              TEXT NOT NULL,
  cusip             TEXT NOT NULL,
  ticker            TEXT             DEFAULT NULL,
  pct_of_nav        NUMERIC(12, 8)  NOT NULL DEFAULT 0,
  value_usd         NUMERIC(16, 2)  NOT NULL DEFAULT 0,
  asset_category    TEXT             DEFAULT NULL,
  country           TEXT             DEFAULT NULL,
  sector            TEXT             DEFAULT NULL,
  is_look_through   BOOLEAN NOT NULL DEFAULT false,
  parent_fund_name  TEXT             DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holdings_fund_date
  ON holdings_cache (fund_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_cusip
  ON holdings_cache (cusip);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_unique
  ON holdings_cache (fund_id, accession_number, cusip);

COMMENT ON TABLE holdings_cache IS 'Parsed EDGAR NPORT-P holdings per fund per filing period';


-- ─── 3. CUSIP CACHE ───────────────────────────────────────────────────────
-- Persistent CUSIP→ticker mappings from OpenFIGI.

CREATE TABLE IF NOT EXISTS cusip_cache (
  cusip          TEXT PRIMARY KEY,
  ticker         TEXT         DEFAULT NULL,
  name           TEXT         DEFAULT NULL,
  security_type  TEXT         DEFAULT NULL,
  resolved       BOOLEAN NOT NULL DEFAULT false,
  resolved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cusip_ticker
  ON cusip_cache (ticker) WHERE ticker IS NOT NULL;

COMMENT ON TABLE cusip_cache IS 'Persistent CUSIP→ticker mappings from OpenFIGI';


-- ─── 4. PIPELINE RUNS ─────────────────────────────────────────────────────
-- Tracks each pipeline execution for monitoring.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ          DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),
  failed_step     TEXT         DEFAULT NULL,
  error_message   TEXT         DEFAULT NULL,
  /** Number of funds processed */
  funds_processed INTEGER      DEFAULT 0,
  funds_succeeded INTEGER      DEFAULT 0,
  funds_failed    INTEGER      DEFAULT 0,
  total_holdings  INTEGER      DEFAULT 0,
  duration_ms     INTEGER      DEFAULT NULL,
  /** Full error details as JSON array */
  errors          JSONB        DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most recent runs (for dashboard status indicator)
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status
  ON pipeline_runs (started_at DESC);

COMMENT ON TABLE pipeline_runs IS 'Pipeline execution history — one row per full pipeline run';
COMMENT ON COLUMN pipeline_runs.errors IS 'JSON array of { fund, step, error } objects for detailed debugging';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION B: USER & SCORING TABLES (New in Session 5)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 5. USER PROFILES ──────────────────────────────────────────────────────
-- FundLens-specific user preferences. Links to Supabase auth.users via id.
--
-- Created automatically when a user first logs in via magic link.
-- The Express API creates the profile row on first authenticated request
-- (if it doesn't exist yet) with default values.

CREATE TABLE IF NOT EXISTS user_profiles (
  /** Same UUID as auth.users(id) — this IS the user's Supabase auth ID */
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  /** Display name (from magic link email or manually set) */
  display_name        TEXT         DEFAULT NULL,
  email               TEXT         DEFAULT NULL,

  -- Factor weights (defaults match Master Reference §4)
  weight_cost         NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
  weight_quality      NUMERIC(4, 2) NOT NULL DEFAULT 0.30,
  weight_positioning  NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
  weight_momentum     NUMERIC(4, 2) NOT NULL DEFAULT 0.20,

  -- Risk tolerance: affects allocation sizing only, not scoring
  risk_tolerance      TEXT NOT NULL DEFAULT 'moderate'
                        CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),

  -- Setup wizard completion tracking
  setup_completed     BOOLEAN NOT NULL DEFAULT false,
  /** Which funds the user selected during setup (JSON array of fund UUIDs) */
  selected_fund_ids   JSONB        DEFAULT '[]'::jsonb,

  -- Investment Brief scheduling
  /** When the user signed up (used to calculate first Brief delivery) */
  signup_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
  /** When the last Brief was sent to this user */
  last_brief_sent_at  TIMESTAMPTZ          DEFAULT NULL,
  /** User can opt out of automatic Brief emails */
  briefs_enabled      BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: factor weights must sum to 1.0 (within rounding tolerance)
-- This prevents invalid weight combinations from being saved.
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_weights_sum
  CHECK (
    ABS((weight_cost + weight_quality + weight_positioning + weight_momentum) - 1.0) < 0.02
  );

COMMENT ON TABLE user_profiles IS 'User preferences for scoring and Brief delivery';
COMMENT ON COLUMN user_profiles.id IS 'Same UUID as auth.users(id) — foreign key to Supabase auth';
COMMENT ON COLUMN user_profiles.risk_tolerance IS 'Affects allocation sizing only. Same scores, different position sizes.';
COMMENT ON COLUMN user_profiles.selected_fund_ids IS 'JSON array of fund UUIDs the user cares about (selected in setup wizard)';


-- ─── 6. FUND SCORES ───────────────────────────────────────────────────────
-- Raw factor scores per fund per pipeline run.
-- These are the SAME for every user — personalization happens client-side
-- when the user's custom weights are applied to these raw scores.

CREATE TABLE IF NOT EXISTS fund_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id           UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  pipeline_run_id   UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,

  -- Raw factor scores (0–100 each)
  cost_efficiency   NUMERIC(5, 2) NOT NULL DEFAULT 0,
  holdings_quality  NUMERIC(5, 2) NOT NULL DEFAULT 0,
  positioning       NUMERIC(5, 2) NOT NULL DEFAULT 0,
  momentum          NUMERIC(5, 2) NOT NULL DEFAULT 0,

  -- Composite score using default weights (for server-side ranking)
  composite_default NUMERIC(5, 2) NOT NULL DEFAULT 0,

  -- Detailed per-factor data (for the fund detail sidebar in UI)
  factor_details    JSONB NOT NULL DEFAULT '{}'::jsonb,

  scored_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One score row per fund per pipeline run (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_scores_unique
  ON fund_scores (fund_id, pipeline_run_id);

-- Latest scores per fund (most common query from the UI)
CREATE INDEX IF NOT EXISTS idx_fund_scores_latest
  ON fund_scores (fund_id, scored_at DESC);

-- Scores by pipeline run (for loading all scores from a specific run)
CREATE INDEX IF NOT EXISTS idx_fund_scores_run
  ON fund_scores (pipeline_run_id);

COMMENT ON TABLE fund_scores IS 'Raw factor scores per fund per pipeline run. Same for all users.';
COMMENT ON COLUMN fund_scores.composite_default IS 'Composite using default weights (25/30/25/20). Client recalculates with user weights.';
COMMENT ON COLUMN fund_scores.factor_details IS 'JSON with per-factor detail (cost efficiency result, quality breakdown, etc.)';


-- ─── 7. INVESTMENT BRIEFS ──────────────────────────────────────────────────
-- Generated Investment Brief documents. Each Brief is personalized per user.
-- The content is Markdown, rendered in the UI and also sent via email.

CREATE TABLE IF NOT EXISTS investment_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_run_id   UUID             REFERENCES pipeline_runs(id) ON DELETE SET NULL,

  -- Brief content (Markdown)
  title             TEXT NOT NULL DEFAULT '',
  content_md        TEXT NOT NULL DEFAULT '',

  -- The structured data that was fed to Claude to generate this Brief
  -- Stored for auditability: you can see exactly what Claude received
  data_packet       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  /** Which Claude model generated this Brief */
  model_used        TEXT NOT NULL DEFAULT '',
  /** How long generation took (ms) */
  generation_ms     INTEGER      DEFAULT NULL,

  -- The macro thesis at the time of generation (for historical context)
  thesis_narrative  TEXT         DEFAULT NULL,

  /** 'generated' = created, 'sent' = emailed, 'failed' = generation error */
  status            TEXT NOT NULL DEFAULT 'generated'
                      CHECK (status IN ('generated', 'sent', 'failed')),

  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User's brief history (newest first)
CREATE INDEX IF NOT EXISTS idx_briefs_user_date
  ON investment_briefs (user_id, generated_at DESC);

-- Find briefs that need to be sent
CREATE INDEX IF NOT EXISTS idx_briefs_status
  ON investment_briefs (status) WHERE status = 'generated';

COMMENT ON TABLE investment_briefs IS 'Personalized Investment Brief documents per user';
COMMENT ON COLUMN investment_briefs.data_packet IS 'Structured input sent to Claude — fund scores, holdings, user profile, relevance tags';
COMMENT ON COLUMN investment_briefs.thesis_narrative IS 'Macro thesis at generation time — preserved so historical briefs show what the model was thinking';


-- ─── 8. BRIEF DELIVERIES ──────────────────────────────────────────────────
-- Tracks email delivery of Briefs. Separate from the Brief itself so we can
-- retry failed sends without regenerating the Brief.

CREATE TABLE IF NOT EXISTS brief_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id        UUID NOT NULL REFERENCES investment_briefs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  /** Email address the Brief was sent to */
  email_to        TEXT NOT NULL,
  /** Resend message ID for tracking */
  resend_id       TEXT         DEFAULT NULL,

  /** 'pending', 'sent', 'failed', 'bounced' */
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  error_message   TEXT         DEFAULT NULL,

  sent_at         TIMESTAMPTZ          DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_brief
  ON brief_deliveries (brief_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user
  ON brief_deliveries (user_id, sent_at DESC);

COMMENT ON TABLE brief_deliveries IS 'Email delivery tracking for Investment Briefs via Resend';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION C: MACRO THESIS CACHE
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 9. THESIS CACHE ───────────────────────────────────────────────────────
-- Stores generated macro theses for historical reference and to avoid
-- regenerating during a pipeline run if one was already produced recently.

CREATE TABLE IF NOT EXISTS thesis_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id     UUID             REFERENCES pipeline_runs(id) ON DELETE SET NULL,

  narrative           TEXT NOT NULL DEFAULT '',
  sector_preferences  JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_themes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_used          TEXT NOT NULL DEFAULT '',

  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_latest
  ON thesis_cache (generated_at DESC);

COMMENT ON TABLE thesis_cache IS 'Macro thesis history — one per pipeline run';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION D: TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at on modified rows

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
DO $$
BEGIN
  -- funds
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_funds_updated_at') THEN
    CREATE TRIGGER set_funds_updated_at
      BEFORE UPDATE ON funds
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- user_profiles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_profiles_updated_at') THEN
    CREATE TRIGGER set_profiles_updated_at
      BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Auto-create user_profiles when a new user signs up via magic link.
-- This Supabase trigger fires on auth.users INSERT and creates a matching
-- profile row with default values.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create the trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION E: ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These are defense-in-depth. The Express server is the primary access
-- control layer. RLS catches any direct Supabase client access that might
-- bypass the Express proxy (shouldn't happen, but just in case).
--
-- Two roles matter:
--   1. service_role — used by the Express server. Bypasses ALL RLS.
--   2. anon/authenticated — used by the Supabase JS client on the React
--      side (only for magic link auth, but policies protect data just in case).

-- Enable RLS on all tables
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cusip_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE thesis_cache ENABLE ROW LEVEL SECURITY;

-- ─── FUNDS: readable by any authenticated user ─────────────────────────────
-- The fund list is not user-specific — everyone sees the same 401(k) menu.
CREATE POLICY "Authenticated users can read funds"
  ON funds FOR SELECT
  TO authenticated
  USING (true);

-- ─── HOLDINGS CACHE: readable by any authenticated user ────────────────────
-- Holdings data is fund-level, not user-specific.
CREATE POLICY "Authenticated users can read holdings"
  ON holdings_cache FOR SELECT
  TO authenticated
  USING (true);

-- ─── CUSIP CACHE: no client access needed ──────────────────────────────────
-- Only the server pipeline reads/writes this. No RLS SELECT policy means
-- authenticated users cannot read it (which is fine — it's internal).

-- ─── PIPELINE RUNS: readable by any authenticated user ─────────────────────
-- Users see when scores were last updated (the "last refreshed" indicator).
CREATE POLICY "Authenticated users can read pipeline runs"
  ON pipeline_runs FOR SELECT
  TO authenticated
  USING (true);

-- ─── USER PROFILES: users can only see/edit their own ──────────────────────
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT policy for authenticated users — the trigger handles creation.
-- No DELETE policy — users can't delete their own profiles.

-- ─── FUND SCORES: readable by any authenticated user ───────────────────────
-- Raw scores are the same for everyone. Personalization is client-side.
CREATE POLICY "Authenticated users can read fund scores"
  ON fund_scores FOR SELECT
  TO authenticated
  USING (true);

-- ─── INVESTMENT BRIEFS: users can only read their own ──────────────────────
CREATE POLICY "Users can read own briefs"
  ON investment_briefs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── BRIEF DELIVERIES: users can only read their own ──────────────────────
CREATE POLICY "Users can read own deliveries"
  ON brief_deliveries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── THESIS CACHE: readable by any authenticated user ──────────────────────
-- The macro thesis is shared context — everyone sees the same market view.
CREATE POLICY "Authenticated users can read thesis cache"
  ON thesis_cache FOR SELECT
  TO authenticated
  USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════════════════
-- After running this SQL:
--   1. Verify all 9 tables exist in the Supabase Table Editor
--   2. Verify RLS is enabled on each table (lock icon should appear)
--   3. Verify the auth trigger exists: Database → Triggers → on_auth_user_created
--   4. The old v6_holdings_schema.sql can be deleted from the repo
