-- v8 A0 (Gap 5): heartbeat-based pipeline-run liveness.
-- A live run stamps heartbeat_at every ~60 seconds while its process is
-- alive; the shared liveness check (monitor.ts runIsStale) reads it.
-- Nullable, no default, no backfill — rows from before this migration
-- fall back to started_at in the liveness check.
--
-- Applied to the production Supabase project 2026-07-05 (Robert-authorized,
-- migration name v8_a0_pipeline_runs_heartbeat) BEFORE the code PR merged,
-- per charter §3 migrations-before-merges law.
ALTER TABLE pipeline_runs ADD COLUMN heartbeat_at timestamptz;
