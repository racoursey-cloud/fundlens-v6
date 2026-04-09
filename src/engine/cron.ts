/**
 * FundLens v6 — Cron Scheduler
 *
 * Manages all scheduled jobs that run on Railway. This module starts
 * when the Express server boots and registers two recurring jobs:
 *
 *   1. Pipeline Run — scores all active 401(k) funds on a schedule
 *   2. Brief Delivery — checks daily for users due a 30-day Investment Brief
 *
 * Railway keeps the server running 24/7, so node-cron works reliably.
 * All times are in UTC (Railway servers run UTC).
 *
 * IMPORTANT: Both jobs are sequential and potentially long-running.
 * The pipeline can take 10–30 minutes depending on fund count.
 * Brief delivery can take 100+ minutes with ~200 users.
 * Built-in guards prevent overlapping runs.
 *
 * Session 7 deliverable. Destination: src/engine/cron.ts
 * References: Master Reference §7 (Brief Delivery), §8 (Pipeline).
 */

import cron from 'node-cron';
import { supaFetch, supaSelect, supaInsert, supaUpdate } from './supabase.js';
import { runFullPipeline } from './pipeline.js';
import { persistPipelineResults } from './persist.js';
import { checkAndSendBriefs } from './brief-scheduler.js';
import type { FundRow, PipelineRunRow } from './types.js';

// ─── State ─────────────────────────────────────────────────────────────────

/** Track whether each job is currently running to prevent overlap */
const jobState = {
  pipelineRunning: false,
  briefsRunning: false,
};

/** References to scheduled tasks so we can stop them if needed */
let pipelineTask: cron.ScheduledTask | null = null;
let briefTask: cron.ScheduledTask | null = null;

// ─── Pipeline Cron Job ─────────────────────────────────────────────────────

/**
 * Scheduled pipeline run.
 *
 * Runs the full scoring pipeline (Steps 1–14), then persists results
 * to Supabase. Creates a pipeline_runs record to track status.
 *
 * Guard: if a pipeline is already running (from cron OR manual trigger
 * via POST /api/pipeline/run), this job skips.
 */
async function scheduledPipelineRun(): Promise<void> {
  // Guard: don't overlap with another pipeline run
  if (jobState.pipelineRunning) {
    console.log('[cron] Pipeline already running — skipping scheduled run');
    return;
  }

  // Also check Supabase for a running pipeline (could be from manual trigger)
  const { data: runningInDb } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.running',
      limit: '1',
    },
    single: true,
  });

  if (runningInDb) {
    console.log(`[cron] Pipeline run ${runningInDb.id} already in progress (started ${runningInDb.started_at}) — skipping`);
    return;
  }

  jobState.pipelineRunning = true;
  console.log('[cron] Starting scheduled pipeline run');

  // Create pipeline_runs record
  const { data: run, error: createError } = await supaInsert<PipelineRunRow>(
    'pipeline_runs',
    { status: 'running' },
    { single: true }
  );

  if (createError || !run) {
    console.error(`[cron] Failed to create pipeline_runs record: ${createError}`);
    jobState.pipelineRunning = false;
    return;
  }

  try {
    // Get active funds
    const { data: funds } = await supaSelect<FundRow[]>('funds', {
      is_active: 'eq.true',
    });

    if (!funds || funds.length === 0) {
      console.warn('[cron] No active funds found — marking run as failed');
      await supaUpdate('pipeline_runs', {
        status: 'failed',
        error_message: 'No active funds found',
        completed_at: new Date().toISOString(),
      }, { id: `eq.${run.id}` });
      jobState.pipelineRunning = false;
      return;
    }

    // Run the full pipeline
    const result = await runFullPipeline(funds);

    // Persist results
    const persistResult = await persistPipelineResults(run.id, result, funds);

    console.log(
      `[cron] Scheduled pipeline run ${run.id} completed: ` +
      `${persistResult.scoresWritten} scores, ` +
      `${persistResult.holdingsWritten} holding sectors, ` +
      `${persistResult.errors.length} errors`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron] Pipeline run ${run.id} failed: ${msg}`);

    await supaUpdate('pipeline_runs', {
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }, { id: `eq.${run.id}` });
  } finally {
    jobState.pipelineRunning = false;
  }
}

// ─── Brief Delivery Cron Job ───────────────────────────────────────────────

/**
 * Scheduled Brief delivery check.
 *
 * Calls checkAndSendBriefs() from brief-scheduler.ts, which finds
 * users whose 30-day window is up and generates + emails their Briefs.
 *
 * Guard: prevents overlapping Brief runs. With ~200 users at
 * ~30 seconds per Brief, this can run for 100+ minutes.
 */
async function scheduledBriefDelivery(): Promise<void> {
  if (jobState.briefsRunning) {
    console.log('[cron] Brief delivery already running — skipping');
    return;
  }

  jobState.briefsRunning = true;
  console.log('[cron] Starting scheduled Brief delivery check');

  try {
    const result = await checkAndSendBriefs();

    console.log(
      `[cron] Brief delivery complete: ` +
      `${result.briefsGenerated}/${result.usersEligible} generated, ` +
      `${result.briefsSent} sent, ` +
      `${result.errors.length} errors, ` +
      `${(result.durationMs / 1000 / 60).toFixed(1)} min`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron] Brief delivery failed: ${msg}`);
  } finally {
    jobState.briefsRunning = false;
  }
}

// ─── Stale Pipeline Detection ──────────────────────────────────────────────

/**
 * Check for pipeline runs stuck in "running" status.
 *
 * If a pipeline has been "running" for more than 2 hours, something
 * went wrong (server restart, crash, etc.). Mark it as failed so
 * the next scheduled run can proceed.
 */
async function cleanupStaleRuns(): Promise<void> {
  // BUG-12 fix: Pipeline runs in ~70s. 15 minutes is generous but catches stalls
  // much faster than the previous 2-hour threshold.
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: staleRuns } = await supaSelect<PipelineRunRow[]>('pipeline_runs', {
    status: 'eq.running',
    'started_at': `lt.${fifteenMinutesAgo}`,
  });

  if (staleRuns && staleRuns.length > 0) {
    for (const stale of staleRuns) {
      console.warn(`[cron] Marking stale pipeline run ${stale.id} as failed (started ${stale.started_at})`);
      await supaUpdate('pipeline_runs', {
        status: 'failed',
        error_message: 'Marked as failed by stale run cleanup — exceeded 15-minute timeout',
        completed_at: new Date().toISOString(),
      }, { id: `eq.${stale.id}` });
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Start all cron jobs.
 *
 * Called once from server.ts at startup. Registers three scheduled tasks:
 *
 *   1. Pipeline: runs daily at 2:00 AM UTC (9:00 PM ET / 10:00 PM ET DST)
 *      - Late enough that US markets have closed and settled
 *      - Early enough that scores are fresh for morning users
 *
 *   2. Brief delivery: runs daily at 6:00 AM UTC (1:00 AM ET / 2:00 AM ET DST)
 *      - After pipeline completes, so Briefs use the freshest scores
 *      - Users receive Briefs in their inbox before their workday starts
 *
 *   3. Stale run cleanup: runs every 30 minutes
 *      - Catches pipeline runs stuck in "running" after a crash/restart
 *
 * Cron expressions use 5 fields: minute hour dayOfMonth month dayOfWeek
 * Railway servers run in UTC.
 */
export function startCronJobs(): void {
  console.log('[cron] Registering scheduled jobs');

  // ── Pipeline: daily at 2:00 AM UTC ──
  pipelineTask = cron.schedule('0 2 * * *', () => {
    scheduledPipelineRun().catch(err => {
      console.error('[cron] Unhandled error in pipeline job:', err);
      jobState.pipelineRunning = false;
    });
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log('[cron] Pipeline scheduled: daily at 02:00 UTC');

  // ── Brief delivery: daily at 6:00 AM UTC ──
  briefTask = cron.schedule('0 6 * * *', () => {
    scheduledBriefDelivery().catch(err => {
      console.error('[cron] Unhandled error in brief delivery job:', err);
      jobState.briefsRunning = false;
    });
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log('[cron] Brief delivery scheduled: daily at 06:00 UTC');

  // ── Stale run cleanup: every 30 minutes ──
  cron.schedule('*/30 * * * *', () => {
    cleanupStaleRuns().catch(err => {
      console.error('[cron] Stale run cleanup error:', err);
    });
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log('[cron] Stale run cleanup scheduled: every 30 minutes');

  // Run stale cleanup once at startup (in case server restarted mid-pipeline)
  cleanupStaleRuns().catch(err => {
    console.error('[cron] Initial stale run cleanup error:', err);
  });
}

/**
 * Stop all cron jobs.
 *
 * Called during graceful shutdown. Stops scheduling new runs but
 * does NOT interrupt a run that's already in progress.
 */
export function stopCronJobs(): void {
  console.log('[cron] Stopping scheduled jobs');
  pipelineTask?.stop();
  briefTask?.stop();
  pipelineTask = null;
  briefTask = null;
}

/**
 * Get current state of all cron jobs.
 *
 * Used by the monitoring API to show whether jobs are running
 * and when they're scheduled to fire next.
 */
export function getCronStatus(): CronStatus {
  return {
    pipeline: {
      isRunning: jobState.pipelineRunning,
      schedule: 'Daily at 02:00 UTC (9:00 PM ET)',
      cronExpression: '0 2 * * *',
    },
    briefDelivery: {
      isRunning: jobState.briefsRunning,
      schedule: 'Daily at 06:00 UTC (1:00 AM ET)',
      cronExpression: '0 6 * * *',
    },
    staleCleanup: {
      schedule: 'Every 30 minutes',
      cronExpression: '*/30 * * * *',
    },
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CronStatus {
  pipeline: {
    isRunning: boolean;
    schedule: string;
    cronExpression: string;
  };
  briefDelivery: {
    isRunning: boolean;
    schedule: string;
    cronExpression: string;
  };
  staleCleanup: {
    schedule: string;
    cronExpression: string;
  };
}
