/**
 * FundLens v6 — Express API Routes
 *
 * All the endpoints the React client uses to get data.
 * Every route that returns user-specific data requires authentication
 * (the requireAuth middleware checks the user's JWT token).
 *
 * Route overview:
 *
 *   PUBLIC (no auth):
 *     GET  /health                    — server health check
 *
 *   AUTHENTICATED (require valid JWT):
 *     GET  /api/funds                 — list active 401(k) funds
 *     GET  /api/funds/:ticker         — single fund detail
 *     GET  /api/scores                — latest raw scores for all funds
 *     GET  /api/scores/:ticker        — scores for a specific fund
 *     GET  /api/profile               — current user's profile
 *     PUT  /api/profile               — update user's profile (weights, risk, etc.)
 *     POST /api/profile/setup         — complete setup wizard
 *     GET  /api/pipeline/status       — latest pipeline run status
 *     POST /api/pipeline/run          — trigger a fresh pipeline run
 *     POST /api/pipeline/retry        — retry a failed pipeline run
 *     GET  /api/pipeline/history      — pipeline run history
 *     GET  /api/briefs                — user's Investment Brief history
 *     GET  /api/briefs/:id            — specific Brief by ID
 *     POST /api/briefs/generate       — trigger on-demand Brief generation
 *     GET  /api/thesis/latest         — latest macro thesis
 *     GET  /api/monitor/health        — system health report
 *     GET  /api/monitor/data-quality  — data quality metrics
 *     GET  /api/monitor/cron          — cron job status
 *
 * Session 5 deliverable. Updated in Session 6 (Brief engine wiring).
 * Updated in Session 7 (monitoring + retry + cron status endpoints).
 * Destination: src/routes/routes.ts
 * References: Master Reference §5, §7, §8, §10.
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, AuthenticatedRequest } from '../engine/auth.js';
import { supaFetch, supaSelect, supaInsert, supaUpdate } from '../engine/supabase.js';
import { DEFAULT_FACTOR_WEIGHTS, ADMIN_EMAILS, RISK_MIN, RISK_MAX } from '../engine/constants.js';
import type {
  FundRow,
  FundScoresRow,
  PipelineRunRow,
  UserProfileRow,
  InvestmentBriefRow,
} from '../engine/types.js';

export const router = Router();

// ─── SESSION 0 SECURITY: Rate limiters for expensive endpoints ────────────

const pipelineRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,                    // 3 pipeline runs per hour
  message: { error: 'Pipeline rate limit exceeded. Max 3 per hour.' },
  keyGenerator: (req) => (req as AuthenticatedRequest).userId || 'anonymous',
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const briefRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,                         // 5 brief generations per day
  message: { error: 'Brief generation rate limit exceeded. Max 5 per day.' },
  keyGenerator: (req) => (req as AuthenticatedRequest).userId || 'anonymous',
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// ─── SESSION 0 SECURITY: Admin-only middleware ────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const { userEmail } = req as AuthenticatedRequest;
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    res.status(403).json({ error: 'Admin access required for this operation.' });
    return;
  }
  next();
}

// ─── SESSION 0 SECURITY: Input validation helpers ─────────────────────────

/** Validate ticker format: 1-10 uppercase alphanumeric characters */
function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(ticker);
}

/** Validate UUID format */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/funds
 * Returns all active funds in the 401(k) menu.
 * The fund list is the same for everyone — it's the TerrAscend plan menu.
 */
router.get('/api/funds', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supaSelect<FundRow[]>('funds', {
    is_active: 'eq.true',
    order: 'ticker.asc',
  });

  if (error) {
    console.error('[routes] Failed to fetch funds:', error);
    res.status(500).json({ error: 'Failed to fetch funds. Please try again later.' });
    return;
  }

  res.json({ funds: data || [] });
});

/**
 * GET /api/funds/:ticker
 * Returns a single fund by ticker symbol.
 */
router.get('/api/funds/:ticker', requireAuth, async (req: Request, res: Response) => {
  const ticker = (req.params.ticker as string).toUpperCase();

  // SESSION 0 SECURITY: Validate ticker format before using in query
  if (!isValidTicker(ticker)) {
    res.status(400).json({ error: 'Invalid ticker format' });
    return;
  }

  const { data, error } = await supaFetch<FundRow>('funds', {
    params: { ticker: `eq.${ticker}`, select: '*' },
    single: true,
  });

  if (error) {
    res.status(404).json({ error: `Fund not found: ${ticker}` });
    return;
  }

  res.json({ fund: data });
});


// ═══════════════════════════════════════════════════════════════════════════
// SCORES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scores
 * Returns the latest raw factor scores for all active funds.
 *
 * These are RAW scores — the same for every user. The React client
 * applies the user's custom factor weights client-side to produce
 * personalized composite scores and rankings.
 */
router.get('/api/scores', requireAuth, async (req: Request, res: Response) => {
  // Get the latest pipeline run
  const { data: latestRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (!latestRun) {
    res.json({ scores: [], pipelineRun: null, message: 'No completed pipeline runs yet' });
    return;
  }

  // Get all scores from that run
  const { data: scores, error } = await supaSelect<FundScoresRow[]>('fund_scores', {
    pipeline_run_id: `eq.${latestRun.id}`,
    select: '*, funds(ticker, name, expense_ratio)',
    order: 'composite_default.desc',
  });

  if (error) {
    console.error('[routes] Failed to fetch scores:', error);
    res.status(500).json({ error: 'Failed to fetch scores. Please try again later.' });
    return;
  }

  res.json({
    scores: scores || [],
    pipelineRun: {
      id: latestRun.id,
      completedAt: latestRun.completed_at,
      fundsProcessed: latestRun.funds_processed,
      fundsSucceeded: latestRun.funds_succeeded,
    },
  });
});

/**
 * GET /api/scores/:ticker
 * Returns the latest scores for a specific fund, including factor detail.
 */
router.get('/api/scores/:ticker', requireAuth, async (req: Request, res: Response) => {
  const ticker = (req.params.ticker as string).toUpperCase();

  // SESSION 0 SECURITY: Validate ticker format before using in query
  if (!isValidTicker(ticker)) {
    res.status(400).json({ error: 'Invalid ticker format' });
    return;
  }

  // Find the fund
  const { data: fund } = await supaFetch<FundRow>('funds', {
    params: { ticker: `eq.${ticker}` },
    single: true,
  });

  if (!fund) {
    res.status(404).json({ error: `Fund not found: ${ticker}` });
    return;
  }

  // Get the latest score for this fund
  const { data: score, error } = await supaFetch<FundScoresRow>('fund_scores', {
    params: {
      fund_id: `eq.${fund.id}`,
      order: 'scored_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (error || !score) {
    res.status(404).json({ error: `No scores found for ${ticker}` });
    return;
  }

  // Also fetch the fund's current holdings for the detail view
  const { data: holdings } = await supaSelect('holdings_cache', {
    fund_id: `eq.${fund.id}`,
    order: 'pct_of_nav.desc',
    limit: '50',
  });

  res.json({
    fund,
    score,
    holdings: holdings || [],
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/profile
 * Returns the authenticated user's profile (factor weights, risk tolerance,
 * setup status, etc.).
 *
 * If the profile doesn't exist yet (shouldn't happen if the auth trigger
 * is working, but just in case), creates one with defaults.
 */
router.get('/api/profile', requireAuth, async (req: Request, res: Response) => {
  const { userId, userEmail } = req as AuthenticatedRequest;

  let { data: profile, error } = await supaFetch<UserProfileRow>('user_profiles', {
    params: { id: `eq.${userId}` },
    single: true,
  });

  // Auto-create profile if it doesn't exist (safety net)
  if (!profile && !error) {
    const { data: created } = await supaInsert<UserProfileRow>('user_profiles', {
      id: userId,
      email: userEmail,
      display_name: userEmail ? userEmail.split('@')[0] : null,
    }, { single: true });

    profile = created;
  }

  if (!profile) {
    res.status(500).json({ error: 'Could not load or create profile' });
    return;
  }

  res.json({ profile });
});

/**
 * PUT /api/profile
 * Update the authenticated user's profile.
 *
 * Accepts partial updates — only send the fields you want to change.
 * The client sends this when the user adjusts factor weight sliders,
 * changes risk tolerance, or updates their name.
 */
router.put('/api/profile', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const updates = req.body;

  // Whitelist allowed fields (prevent someone from changing their ID, etc.)
  const allowed: Record<string, unknown> = {};
  const allowedFields = [
    'display_name',
    'weight_cost',
    'weight_quality',
    'weight_positioning',
    'weight_momentum',
    'risk_tolerance',
    'briefs_enabled',
    'selected_fund_ids',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      allowed[field] = updates[field];
    }
  }

  if (Object.keys(allowed).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  // Validate weights if any weight field is being updated
  const weightFields = ['weight_cost', 'weight_quality', 'weight_positioning', 'weight_momentum'];
  const hasWeightUpdate = weightFields.some(f => allowed[f] !== undefined);

  if (hasWeightUpdate) {
    // Fetch current profile to fill in unchanged weights
    const { data: current } = await supaFetch<UserProfileRow>('user_profiles', {
      params: { id: `eq.${userId}` },
      single: true,
    });

    if (current) {
      const finalWeights = {
        weight_cost: (allowed.weight_cost ?? current.weight_cost) as number,
        weight_quality: (allowed.weight_quality ?? current.weight_quality) as number,
        weight_positioning: (allowed.weight_positioning ?? current.weight_positioning) as number,
        weight_momentum: (allowed.weight_momentum ?? current.weight_momentum) as number,
      };

      // SESSION 0 SECURITY: Validate individual weight bounds (spec: min 5%)
      const weightValues = Object.values(finalWeights);
      for (const w of weightValues) {
        if (typeof w !== 'number' || !isFinite(w) || w < 0.05 || w > 0.60) {
          res.status(400).json({
            error: 'Each factor weight must be between 0.05 and 0.60.',
          });
          return;
        }
      }

      const sum = finalWeights.weight_cost + finalWeights.weight_quality +
        finalWeights.weight_positioning + finalWeights.weight_momentum;

      if (Math.abs(sum - 1.0) >= 0.02) {
        res.status(400).json({
          error: `Factor weights must sum to 1.0 (got ${sum.toFixed(4)})`,
        });
        return;
      }
    }
  }

  // SESSION 9: Validate risk tolerance (spec §6.4: continuous slider, 1.0–7.0)
  if (allowed.risk_tolerance !== undefined) {
    const rt = Number(allowed.risk_tolerance);
    if (!Number.isFinite(rt) || rt < RISK_MIN || rt > RISK_MAX) {
      res.status(400).json({
        error: `Invalid risk_tolerance. Must be a number from ${RISK_MIN}.0 to ${RISK_MAX}.0.`,
      });
      return;
    }
    // Round to one decimal to prevent excessive precision from client
    allowed.risk_tolerance = Math.round(rt * 10) / 10;
  }

  const { data, error } = await supaUpdate<UserProfileRow>(
    'user_profiles',
    allowed,
    { id: `eq.${userId}` }
  );

  if (error) {
    console.error('[routes] Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile. Please try again later.' });
    return;
  }

  res.json({ profile: data });
});

/**
 * POST /api/profile/setup
 * Complete the setup wizard. Sets factor weights, risk tolerance,
 * and selected funds in one call, then marks setup as complete.
 */
router.post('/api/profile/setup', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const { weights, riskTolerance, selectedFundIds } = req.body;

  // Validate
  if (!weights || !riskTolerance || !selectedFundIds) {
    res.status(400).json({
      error: 'Missing required fields: weights, riskTolerance, selectedFundIds',
    });
    return;
  }

  // SESSION 9: Continuous risk scale (spec §6.4: 1.0–7.0)
  const rt = Math.round(Number(riskTolerance) * 10) / 10;
  if (!Number.isFinite(rt) || rt < RISK_MIN || rt > RISK_MAX) {
    res.status(400).json({ error: `Invalid riskTolerance. Must be a number from ${RISK_MIN}.0 to ${RISK_MAX}.0.` });
    return;
  }

  const sum = (weights.costEfficiency || 0) + (weights.holdingsQuality || 0) +
    (weights.positioning || 0) + (weights.momentum || 0);

  if (Math.abs(sum - 1.0) >= 0.02) {
    res.status(400).json({ error: `Weights must sum to 1.0 (got ${sum.toFixed(4)})` });
    return;
  }

  const { data, error } = await supaUpdate<UserProfileRow>(
    'user_profiles',
    {
      weight_cost: weights.costEfficiency ?? DEFAULT_FACTOR_WEIGHTS.costEfficiency,
      weight_quality: weights.holdingsQuality ?? DEFAULT_FACTOR_WEIGHTS.holdingsQuality,
      weight_positioning: weights.positioning ?? DEFAULT_FACTOR_WEIGHTS.positioning,
      weight_momentum: weights.momentum ?? DEFAULT_FACTOR_WEIGHTS.momentum,
      risk_tolerance: rt,
      selected_fund_ids: selectedFundIds,
      setup_completed: true,
    },
    { id: `eq.${userId}` }
  );

  if (error) {
    console.error('[routes] Failed to save setup:', error);
    res.status(500).json({ error: 'Failed to save setup. Please try again later.' });
    return;
  }

  res.json({ profile: data, message: 'Setup complete' });
});


// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pipeline/status
 * Returns the most recent pipeline run status.
 * Used by the UI to show "Scores last updated: 2 hours ago" and
 * whether a run is currently in progress.
 */
router.get('/api/pipeline/status', requireAuth, async (req: Request, res: Response) => {
  const { data: runs, error } = await supaSelect<PipelineRunRow[]>('pipeline_runs', {
    order: 'started_at.desc',
    limit: '5',
  });

  if (error) {
    console.error('[routes] Failed to fetch pipeline status:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline status. Please try again later.' });
    return;
  }

  const latestRun = runs && runs.length > 0 ? runs[0] : null;
  const isRunning = latestRun?.status === 'running';

  // Read step data from in-memory map (instant, always in order)
  const stepData = isRunning && latestRun ? activePipelineSteps.get(latestRun.id) : null;

  res.json({
    latestRun,
    isRunning,
    currentStep: stepData?.currentStep ?? null,
    stepMessage: stepData?.stepMessage ?? null,
    totalSteps: stepData?.totalSteps ?? null,
    recentRuns: runs || [],
  });
});

/**
 * POST /api/pipeline/run
 * Trigger a fresh pipeline run.
 *
 * This is the "Run Pipeline Now" button in the UI. It kicks off
 * the full scoring pipeline (Steps 1–14 from Master Reference §8).
 *
 * The pipeline runs asynchronously — this endpoint returns immediately
 * with the pipeline_run_id so the client can poll /api/pipeline/status.
 *
 * NOTE: The actual pipeline execution is wired up in persist.ts (Session 5).
 * This route creates the run record and calls the pipeline.
 */
// SESSION 0 SECURITY: Admin-only + rate limited
router.post('/api/pipeline/run', requireAuth, requireAdmin, pipelineRateLimit, async (req: Request, res: Response) => {
  // Check if a pipeline is already running
  const { data: running } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.running',
      limit: '1',
    },
    single: true,
  });

  if (running) {
    res.status(409).json({
      error: 'A pipeline run is already in progress',
      runId: running.id,
      startedAt: running.started_at,
    });
    return;
  }

  // Create pipeline_runs record
  const { data: run, error } = await supaInsert<PipelineRunRow>('pipeline_runs', {
    status: 'running',
  }, { single: true });

  if (error || !run) {
    console.error('[routes] Failed to create pipeline run:', error);
    res.status(500).json({ error: 'Failed to create pipeline run. Please try again later.' });
    return;
  }

  // Kick off pipeline asynchronously (don't await — let it run in background)
  // The persist module handles updating the pipeline_runs record when done.
  runPipelineAsync(run.id).catch(err => {
    console.error(`[routes] Pipeline run ${run.id} failed:`, err);
  });

  res.status(202).json({
    message: 'Pipeline run started',
    runId: run.id,
    startedAt: run.started_at,
  });
});

// ─── In-memory pipeline step tracking ─────────────────────────────────────
// Avoids DB round-trips for real-time step data. The progress callback
// writes here synchronously; the status endpoint reads from here.
// Keyed by runId, cleared when the pipeline finishes.

const activePipelineSteps = new Map<string, {
  currentStep: number;
  stepMessage: string;
  totalSteps: number;
}>();

/**
 * Async wrapper that runs the pipeline and persists results.
 * Called from POST /api/pipeline/run — runs in background.
 */
async function runPipelineAsync(runId: string): Promise<void> {
  // Import dynamically to avoid circular dependencies
  const { persistPipelineResults } = await import('../engine/persist.js');
  const { runFullPipeline } = await import('../engine/pipeline.js');

  try {
    // Get active funds
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

    // Pipeline log accumulator
    const pipelineLog: string[] = [];
    const logStart = Date.now();

    // Progress callback: in-memory (instant) + log accumulator
    const onProgress = async (step: number, total: number, message: string) => {
      const elapsed = ((Date.now() - logStart) / 1000).toFixed(1);
      pipelineLog.push(`[${elapsed}s] Step ${step}/${total}: ${message}`);
      // Synchronous in-memory update — no DB round-trip, no ordering issues
      activePipelineSteps.set(runId, { currentStep: step, stepMessage: message, totalSteps: total });
    };

    // Run the full pipeline
    const result = await runFullPipeline(funds, onProgress);

    // Generate natural-language fund summaries (editorial voice)
    let fundSummaries = {};
    try {
      const { generateFundSummaries } = await import('../engine/fund-summaries.js');
      fundSummaries = await generateFundSummaries(result.scoring.funds, funds);
    } catch (err) {
      console.warn(`[routes] Fund summary generation failed (non-fatal): ${err}`);
    }

    // Persist results to Supabase
    await persistPipelineResults(runId, result, funds, fundSummaries);

    // Save pipeline log to the run record
    const totalElapsed = ((Date.now() - logStart) / 1000).toFixed(1);
    pipelineLog.push(`[${totalElapsed}s] Pipeline completed successfully`);
    activePipelineSteps.delete(runId);
    await supaUpdate('pipeline_runs', {
      pipeline_log: pipelineLog.join('\n'),
    }, { id: `eq.${runId}` }).catch(() => {});

    console.log(`[routes] Pipeline run ${runId} completed successfully`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[routes] Pipeline run ${runId} failed: ${msg}`);
    activePipelineSteps.delete(runId);

    await supaUpdate('pipeline_runs', {
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }, { id: `eq.${runId}` });
  }
}

/**
 * POST /api/pipeline/retry
 * Retry a failed pipeline run.
 *
 * Creates a new pipeline run (does NOT reuse the failed record) and
 * re-runs the full pipeline. Returns the new run ID immediately.
 *
 * Body: { failedRunId: string }
 */
// SESSION 0 SECURITY: Admin-only + rate limited
router.post('/api/pipeline/retry', requireAuth, requireAdmin, pipelineRateLimit, async (req: Request, res: Response) => {
  const { failedRunId } = req.body;

  if (!failedRunId) {
    res.status(400).json({ error: 'Missing required field: failedRunId' });
    return;
  }

  // Dynamic import to avoid circular dependencies
  const { retryPipelineRun } = await import('../engine/monitor.js');
  const result = await retryPipelineRun(failedRunId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(202).json({
    message: 'Pipeline retry started',
    newRunId: result.newRunId,
    retriedFrom: failedRunId,
  });
});

/**
 * GET /api/pipeline/log/:runId
 * Export the pipeline log for a specific run as plain text.
 * Useful for troubleshooting — can be copy/pasted to share.
 */
router.get('/api/pipeline/log/:runId', requireAuth, async (req: Request, res: Response) => {
  const { runId } = req.params;

  const { data: run, error } = await supaFetch<Record<string, unknown>>('pipeline_runs', {
    params: { id: `eq.${runId}`, limit: '1' },
    single: true,
  });

  if (error || !run) {
    res.status(404).json({ error: 'Pipeline run not found' });
    return;
  }

  const log = (run.pipeline_log as string) || 'No log available for this run.';
  const status = run.status as string;
  const startedAt = run.started_at as string;
  const completedAt = run.completed_at as string || 'N/A';
  const errorMsg = run.error_message as string || '';

  const header = [
    `FundLens Pipeline Log`,
    `Run ID: ${runId}`,
    `Status: ${status}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    errorMsg ? `Error: ${errorMsg}` : null,
    `${'─'.repeat(60)}`,
  ].filter(Boolean).join('\n');

  res.setHeader('Content-Type', 'text/plain');
  res.send(`${header}\n\n${log}`);
});

/**
 * GET /api/pipeline/history
 * Returns the last 10 pipeline runs with outcome summaries.
 * Used by the monitoring UI to show a run timeline.
 */
router.get('/api/pipeline/history', requireAuth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;

  const { getPipelineHistory } = await import('../engine/monitor.js');
  const history = await getPipelineHistory(Math.min(limit, 50));

  res.json({ runs: history });
});


// ═══════════════════════════════════════════════════════════════════════════
// INVESTMENT BRIEFS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/briefs
 * Returns the authenticated user's Investment Brief history (newest first).
 * This is the Brief archive tab in the UI.
 */
router.get('/api/briefs', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;

  const { data, error } = await supaSelect<InvestmentBriefRow[]>('investment_briefs', {
    user_id: `eq.${userId}`,
    order: 'generated_at.desc',
    // Don't include full content in list view — just metadata
    select: 'id,title,status,generated_at,model_used',
  });

  if (error) {
    console.error('[routes] Failed to fetch briefs:', error);
    res.status(500).json({ error: 'Failed to fetch briefs. Please try again later.' });
    return;
  }

  res.json({ briefs: data || [] });
});

/**
 * GET /api/briefs/:id
 * Returns a specific Investment Brief with full content.
 * Only returns briefs that belong to the authenticated user.
 */
router.get('/api/briefs/:id', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params.id as string;

  // SESSION 0 SECURITY: Validate UUID format before using in query
  if (!isValidUUID(id)) {
    res.status(400).json({ error: 'Invalid brief ID format' });
    return;
  }

  const { data: brief, error } = await supaFetch<InvestmentBriefRow>('investment_briefs', {
    params: {
      id: `eq.${id}`,
      user_id: `eq.${userId}`,
    },
    single: true,
  });

  if (error || !brief) {
    res.status(404).json({ error: 'Brief not found' });
    return;
  }

  res.json({ brief });
});

/**
 * POST /api/briefs/generate
 * Trigger on-demand Investment Brief generation for the authenticated user.
 *
 * This is the "Generate Brief Now" button. Uses the latest pipeline scores
 * to create a personalized Brief. Runs asynchronously — returns immediately
 * with a 202 so the client can poll GET /api/briefs for the result.
 *
 * Query param: ?sendEmail=true to also email the Brief (default: false for on-demand)
 */
// SESSION 0 SECURITY: Rate limited to prevent Claude Opus quota exhaustion
router.post('/api/briefs/generate', requireAuth, briefRateLimit, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const sendEmail = req.query.sendEmail === 'true';

  // Check that we have scores to base the Brief on
  const { data: latestRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (!latestRun) {
    res.status(400).json({
      error: 'No scored data available. Run the pipeline first before generating a Brief.',
    });
    return;
  }

  // Kick off Brief generation asynchronously
  generateBriefAsync(userId, latestRun.id, sendEmail).catch(err => {
    console.error(`[routes] Brief generation failed for user ${userId}:`, err);
  });

  res.status(202).json({
    message: 'Brief generation started',
    basedOnRun: latestRun.id,
    sendEmail,
  });
});

/**
 * Async wrapper for Brief generation from the API route.
 */
async function generateBriefAsync(
  userId: string,
  pipelineRunId: string,
  sendEmail: boolean
): Promise<void> {
  const { generateBriefForUser } = await import('../engine/brief-scheduler.js');
  const result = await generateBriefForUser(userId, pipelineRunId, sendEmail);

  if (result.error) {
    console.error(`[routes] Brief generation error: ${result.error}`);
  } else {
    console.log(`[routes] Brief ${result.briefId} generated for user ${userId}` +
      (result.sent ? ' and emailed' : ''));
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// MACRO THESIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/thesis/latest
 * Returns the most recent macro thesis.
 * This is shared context — the same thesis for all users.
 */
router.get('/api/thesis/latest', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await supaFetch('thesis_cache', {
    params: {
      order: 'generated_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (error || !data) {
    res.status(404).json({ error: 'No thesis available yet' });
    return;
  }

  res.json({ thesis: data });
});


// ═══════════════════════════════════════════════════════════════════════════
// MONITORING (Session 7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/monitor/health
 * System health report.
 *
 * Returns a traffic-light status (healthy / degraded / unhealthy) with
 * details about score freshness, pipeline success, and thesis state.
 * The UI shows this as a colored indicator in the Pipeline Status area.
 */
router.get('/api/monitor/health', requireAuth, async (req: Request, res: Response) => {
  const { getSystemHealth } = await import('../engine/monitor.js');
  const report = await getSystemHealth();
  res.json(report);
});

/**
 * GET /api/monitor/data-quality
 * Detailed data quality metrics.
 *
 * Deeper than /health — shows per-factor score distribution, fund
 * coverage gaps, holdings sector coverage, and error details from
 * the latest pipeline run. Used for debugging and tuning.
 */
router.get('/api/monitor/data-quality', requireAuth, async (req: Request, res: Response) => {
  const { getDataQualityMetrics } = await import('../engine/monitor.js');
  const report = await getDataQualityMetrics();
  res.json(report);
});

/**
 * GET /api/monitor/cron
 * Cron job status.
 *
 * Shows whether pipeline and Brief delivery jobs are currently running
 * and their schedule. Useful for debugging "why didn't my scores update?"
 */
router.get('/api/monitor/cron', requireAuth, async (req: Request, res: Response) => {
  const { getCronStatus } = await import('../engine/cron.js');
  const status = getCronStatus();
  res.json(status);
});


// ═══════════════════════════════════════════════════════════════════════════
// HELP AGENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/help/chat
 * Send a message to the Help Agent and get a response.
 * Uses Claude Haiku with an admin-configurable system prompt.
 *
 * Body: { message: string, history?: Array<{ role, content }> }
 * Returns: { reply: string }
 */
router.post('/api/help/chat', requireAuth, async (req: Request, res: Response) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    return;
  }

  const { helpChat } = await import('../engine/help-agent.js');
  const result = await helpChat({ message: message.trim(), history });

  res.json(result);
});

/**
 * POST /api/help/reload
 * Admin-only: Reload the help agent prompt from disk.
 * Call this after editing help-agent.md without restarting the server.
 */
router.post('/api/help/reload', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const { reloadHelpPrompt } = await import('../engine/help-agent.js');
  reloadHelpPrompt();
  res.json({ message: 'Help agent prompt reloaded' });
});
