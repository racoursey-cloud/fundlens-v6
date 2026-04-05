/**
 * FundLens v6 — Pipeline Monitor
 *
 * Provides system health assessment, data quality metrics, and retry
 * logic for failed pipeline runs. This is the "ops dashboard" data
 * layer — it reads pipeline_runs, fund_scores, and thesis_cache to
 * answer questions like:
 *
 *   - Are my scores fresh or stale?
 *   - Did the last pipeline run succeed?
 *   - Which funds are missing scores?
 *   - How many holdings were scored?
 *   - Should I retry the pipeline?
 *
 * The React UI will surface this via a Pipeline Status indicator
 * (Session 10) so Robert can see at a glance whether the system
 * is healthy.
 *
 * Session 7 deliverable. Destination: src/engine/monitor.ts
 * References: Master Reference §7, §8.
 */

import { supaFetch, supaSelect, supaInsert, supaUpdate } from '../services/supabase.js';
import { runFullPipeline } from './pipeline.js';
import { persistPipelineResults } from './persist.js';
import type { FundRow, PipelineRunRow, FundScoresRow, ThesisCacheRow } from './types.js';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Scores older than this many hours are considered stale */
const STALE_THRESHOLD_HOURS = 36;

/** Maximum automatic retries for a failed pipeline run */
const MAX_RETRIES = 2;

/** Delay before retrying a failed pipeline (5 minutes) */
const RETRY_DELAY_MS = 5 * 60 * 1000;

// ─── Health Assessment ─────────────────────────────────────────────────────

/**
 * Overall system health check.
 *
 * Returns a simple traffic-light status (healthy / degraded / unhealthy)
 * plus the details that drive it. The UI shows this as a colored dot
 * next to "Scores last updated: X hours ago."
 *
 * Health criteria:
 *   - healthy: scores are fresh (< 36 hours old), last run succeeded
 *   - degraded: scores exist but are stale, OR last run had partial failures
 *   - unhealthy: no scores at all, OR last run fully failed, OR no pipeline runs
 */
export async function getSystemHealth(): Promise<SystemHealthReport> {
  const now = Date.now();

  // Get the 5 most recent pipeline runs
  const { data: recentRuns } = await supaSelect<PipelineRunRow[]>('pipeline_runs', {
    order: 'started_at.desc',
    limit: '5',
  });

  const latestRun = recentRuns && recentRuns.length > 0 ? recentRuns[0] : null;

  // Get score count and freshness
  let latestScoreTime: string | null = null;
  let totalScoredFunds = 0;

  if (latestRun && latestRun.status === 'completed') {
    const { data: scores } = await supaSelect<FundScoresRow[]>('fund_scores', {
      pipeline_run_id: `eq.${latestRun.id}`,
      select: 'id,scored_at',
    });

    if (scores && scores.length > 0) {
      totalScoredFunds = scores.length;
      latestScoreTime = scores[0].scored_at;
    }
  }

  // Get total active funds for comparison
  const { data: activeFunds } = await supaSelect<FundRow[]>('funds', {
    is_active: 'eq.true',
    select: 'id',
  });

  const totalActiveFunds = activeFunds?.length || 0;

  // Get latest thesis
  const { data: latestThesis } = await supaFetch<ThesisCacheRow>('thesis_cache', {
    params: {
      order: 'generated_at.desc',
      limit: '1',
    },
    single: true,
  });

  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy';
  const issues: string[] = [];

  if (!latestRun) {
    status = 'unhealthy';
    issues.push('No pipeline runs found — run the pipeline to generate scores');
  } else if (latestRun.status === 'failed') {
    status = 'unhealthy';
    issues.push(`Last pipeline run failed: ${latestRun.error_message || 'Unknown error'}`);
  } else if (latestRun.status === 'running') {
    status = 'degraded';
    issues.push('Pipeline is currently running');
  } else {
    // Latest run completed — check freshness
    const scoreAgeMs = latestScoreTime ? now - new Date(latestScoreTime).getTime() : Infinity;
    const staleMs = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

    if (scoreAgeMs > staleMs) {
      status = 'degraded';
      const hoursAgo = Math.round(scoreAgeMs / (60 * 60 * 1000));
      issues.push(`Scores are ${hoursAgo} hours old (stale threshold: ${STALE_THRESHOLD_HOURS}h)`);
    } else if (totalScoredFunds < totalActiveFunds) {
      status = 'degraded';
      issues.push(`Only ${totalScoredFunds}/${totalActiveFunds} funds scored — some funds may have failed`);
    } else {
      status = 'healthy';
    }

    // Check for high error rate
    if (latestRun.funds_failed > 0) {
      const failRate = latestRun.funds_failed / (latestRun.funds_processed || 1);
      if (failRate > 0.3) {
        status = 'degraded';
        issues.push(`${latestRun.funds_failed}/${latestRun.funds_processed} funds failed scoring (${(failRate * 100).toFixed(0)}%)`);
      }
    }
  }

  // Check thesis freshness
  if (!latestThesis) {
    issues.push('No macro thesis generated yet');
  }

  return {
    status,
    issues,
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      startedAt: latestRun.started_at,
      completedAt: latestRun.completed_at,
      durationMs: latestRun.duration_ms,
      fundsProcessed: latestRun.funds_processed,
      fundsSucceeded: latestRun.funds_succeeded,
      fundsFailed: latestRun.funds_failed,
      totalHoldings: latestRun.total_holdings,
      errorMessage: latestRun.error_message,
    } : null,
    scores: {
      totalScoredFunds,
      totalActiveFunds,
      latestScoreTime,
      isStale: latestScoreTime
        ? (now - new Date(latestScoreTime).getTime()) > STALE_THRESHOLD_HOURS * 60 * 60 * 1000
        : true,
    },
    thesis: latestThesis ? {
      generatedAt: latestThesis.generated_at,
      model: latestThesis.model_used,
      themeCount: latestThesis.key_themes?.length || 0,
    } : null,
    recentRuns: (recentRuns || []).map(r => ({
      id: r.id,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      fundsProcessed: r.funds_processed,
      fundsSucceeded: r.funds_succeeded,
      fundsFailed: r.funds_failed,
    })),
  };
}

// ─── Data Quality Metrics ──────────────────────────────────────────────────

/**
 * Detailed data quality report.
 *
 * Goes deeper than getSystemHealth() — checks individual fund
 * coverage, score distribution, and identifies specific gaps.
 * This is the "drill-down" data for debugging.
 */
export async function getDataQualityMetrics(): Promise<DataQualityReport> {
  // Get latest completed run
  const { data: latestRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (!latestRun) {
    return {
      hasData: false,
      pipelineRunId: null,
      scoredAt: null,
      fundCoverage: { scored: 0, active: 0, missing: [] },
      scoreDistribution: null,
      errors: [],
      holdingsStats: { total: 0, withSectors: 0, sectorCoverage: 0 },
    };
  }

  // Get all active funds
  const { data: activeFunds } = await supaSelect<FundRow[]>('funds', {
    is_active: 'eq.true',
  });

  // Get scores from latest run
  const { data: scores } = await supaSelect<FundScoresRow[]>('fund_scores', {
    pipeline_run_id: `eq.${latestRun.id}`,
    select: '*, funds(ticker, name)',
  });

  const scoredFundIds = new Set((scores || []).map(s => s.fund_id));
  const missingFunds = (activeFunds || [])
    .filter(f => !scoredFundIds.has(f.id))
    .map(f => ({ ticker: f.ticker, name: f.name }));

  // Score distribution (min, max, mean, median for each factor)
  let scoreDistribution: DataQualityReport['scoreDistribution'] = null;

  if (scores && scores.length > 0) {
    const extract = (field: keyof FundScoresRow) =>
      scores.map(s => s[field] as number).filter(v => typeof v === 'number');

    const calcStats = (values: number[]) => {
      if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mid = Math.floor(sorted.length / 2);
      return {
        min: Math.round(sorted[0] * 10) / 10,
        max: Math.round(sorted[sorted.length - 1] * 10) / 10,
        mean: Math.round((sum / sorted.length) * 10) / 10,
        median: Math.round((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10,
      };
    };

    scoreDistribution = {
      costEfficiency: calcStats(extract('cost_efficiency')),
      holdingsQuality: calcStats(extract('holdings_quality')),
      positioning: calcStats(extract('positioning')),
      momentum: calcStats(extract('momentum')),
      compositeDefault: calcStats(extract('composite_default')),
    };
  }

  // Holdings sector coverage from latest run
  const holdingsTotal = latestRun.total_holdings || 0;
  // Count holdings with sectors assigned
  const { data: holdingsWithSectors } = await supaFetch<{ count: number }>('holdings_cache', {
    params: {
      sector: 'not.is.null',
      select: 'count',
    },
    single: true,
  });

  const withSectors = (holdingsWithSectors as any)?.count || 0;

  return {
    hasData: true,
    pipelineRunId: latestRun.id,
    scoredAt: latestRun.completed_at,
    fundCoverage: {
      scored: scores?.length || 0,
      active: activeFunds?.length || 0,
      missing: missingFunds,
    },
    scoreDistribution,
    errors: latestRun.errors || [],
    holdingsStats: {
      total: holdingsTotal,
      withSectors: typeof withSectors === 'number' ? withSectors : 0,
      sectorCoverage: holdingsTotal > 0 ? withSectors / holdingsTotal : 0,
    },
  };
}

// ─── Pipeline Retry Logic ──────────────────────────────────────────────────

/**
 * Retry a failed pipeline run.
 *
 * Creates a new pipeline_runs record (not reusing the failed one)
 * and re-runs the full pipeline. Returns the new run ID immediately
 * while the pipeline runs in the background.
 *
 * Safety: checks that the failed run isn't too old (< 24 hours)
 * and that no other pipeline is currently running.
 *
 * @param failedRunId The ID of the failed pipeline_runs record to retry
 */
export async function retryPipelineRun(
  failedRunId: string
): Promise<{ success: boolean; newRunId: string | null; error: string | null }> {

  // Verify the failed run exists and is actually failed
  const { data: failedRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: { id: `eq.${failedRunId}` },
    single: true,
  });

  if (!failedRun) {
    return { success: false, newRunId: null, error: 'Pipeline run not found' };
  }

  if (failedRun.status !== 'failed') {
    return { success: false, newRunId: null, error: `Run is ${failedRun.status}, not failed` };
  }

  // Check age — don't retry runs older than 24 hours (data would be stale anyway)
  const ageMs = Date.now() - new Date(failedRun.started_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { success: false, newRunId: null, error: 'Run is older than 24 hours — start a fresh run instead' };
  }

  // Check no other pipeline is running
  const { data: running } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.running',
      limit: '1',
    },
    single: true,
  });

  if (running) {
    return { success: false, newRunId: null, error: 'Another pipeline run is already in progress' };
  }

  // Create new run record (linked as retry)
  const { data: newRun, error: createError } = await supaInsert<PipelineRunRow>(
    'pipeline_runs',
    { status: 'running' },
    { single: true }
  );

  if (createError || !newRun) {
    return { success: false, newRunId: null, error: `Failed to create run: ${createError}` };
  }

  // Run pipeline in background
  runPipelineInBackground(newRun.id).catch(err => {
    console.error(`[monitor] Retry pipeline run ${newRun.id} failed:`, err);
  });

  return { success: true, newRunId: newRun.id, error: null };
}

/**
 * Background pipeline execution.
 *
 * Shared logic for running the pipeline and persisting results.
 * Used by both the retry function and could be used by other callers.
 */
async function runPipelineInBackground(runId: string): Promise<void> {
  try {
    const { data: funds } = await supaSelect<FundRow[]>('funds', {
      is_active: 'eq.true',
    });

    if (!funds || funds.length === 0) {
      await supaUpdate('pipeline_runs', {
        status: 'failed',
        error_message: 'No active funds found',
        completed_at: new Date().toISOString(),
      }, { id: `eq.${runId}` });
      return;
    }

    const result = await runFullPipeline(funds);
    await persistPipelineResults(runId, result, funds);

    console.log(`[monitor] Pipeline run ${runId} completed successfully`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[monitor] Pipeline run ${runId} failed: ${msg}`);

    await supaUpdate('pipeline_runs', {
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }, { id: `eq.${runId}` });
  }
}

// ─── Pipeline Run History ──────────────────────────────────────────────────

/**
 * Get pipeline run history with summary stats.
 *
 * Returns the last N pipeline runs with their outcomes. Useful for
 * the monitoring UI to show a timeline of pipeline executions.
 */
export async function getPipelineHistory(
  limit: number = 10
): Promise<PipelineHistoryEntry[]> {
  const { data: runs } = await supaSelect<PipelineRunRow[]>('pipeline_runs', {
    order: 'started_at.desc',
    limit: String(limit),
  });

  if (!runs) return [];

  return runs.map(r => ({
    id: r.id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationMs: r.duration_ms,
    fundsProcessed: r.funds_processed,
    fundsSucceeded: r.funds_succeeded,
    fundsFailed: r.funds_failed,
    totalHoldings: r.total_holdings,
    errorMessage: r.error_message,
    errorCount: r.errors?.length || 0,
  }));
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SystemHealthReport {
  /** Traffic-light status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Human-readable issues */
  issues: string[];
  /** Latest pipeline run summary */
  latestRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    fundsProcessed: number;
    fundsSucceeded: number;
    fundsFailed: number;
    totalHoldings: number;
    errorMessage: string | null;
  } | null;
  /** Score freshness info */
  scores: {
    totalScoredFunds: number;
    totalActiveFunds: number;
    latestScoreTime: string | null;
    isStale: boolean;
  };
  /** Latest thesis info */
  thesis: {
    generatedAt: string;
    model: string;
    themeCount: number;
  } | null;
  /** Recent run timeline */
  recentRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    fundsProcessed: number;
    fundsSucceeded: number;
    fundsFailed: number;
  }>;
}

export interface DataQualityReport {
  hasData: boolean;
  pipelineRunId: string | null;
  scoredAt: string | null;
  fundCoverage: {
    scored: number;
    active: number;
    missing: Array<{ ticker: string; name: string }>;
  };
  scoreDistribution: {
    costEfficiency: ScoreStats;
    holdingsQuality: ScoreStats;
    positioning: ScoreStats;
    momentum: ScoreStats;
    compositeDefault: ScoreStats;
  } | null;
  errors: Array<{ fund: string; step: string; error: string }>;
  holdingsStats: {
    total: number;
    withSectors: number;
    sectorCoverage: number;
  };
}

interface ScoreStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface PipelineHistoryEntry {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  fundsProcessed: number;
  fundsSucceeded: number;
  fundsFailed: number;
  totalHoldings: number;
  errorMessage: string | null;
  errorCount: number;
}
