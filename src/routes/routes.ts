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
 *     GET  /api/example-allocation    — the caller's saved example mix
 *     PUT  /api/example-allocation    — save or replace the caller's example mix
 *     DELETE /api/example-allocation  — delete the caller's example mix
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
import { supaFetch, supaSelect, supaInsert, supaUpdate, supaDelete } from '../engine/supabase.js';
import { DEFAULT_FACTOR_WEIGHTS, ADMIN_EMAILS, RISK_MIN, RISK_MAX, REFERENCE_SUMMARIES_ENABLED } from '../engine/constants.js';
import {
  shapeFundForReference,
  shapeFundListForReference,
  shapeHoldingForReference,
  type ReferenceDossierSource,
  type ReferenceFundIdentity,
  type ReferenceHoldingSource,
} from '../engine/reference-shape.js';
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
  windowMs: 5 * 60 * 1000,    // 5-minute cooldown window
  max: 1,                     // 1 run per 5 minutes (testing cadence)
  message: { error: 'Pipeline cooldown — wait 5 minutes between runs.' },
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

const helpChatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,                    // 20 help questions per hour
  message: { error: 'Help chat rate limit exceeded. Max 20 per hour.' },
  keyGenerator: (req) => (req as AuthenticatedRequest).userId || 'anonymous',
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// ─── Admin-only middleware (A5 Task 4) ────────────────────────────────────
// Admin identity is the is_admin flag on user_profiles (a5_task4 migration),
// checked in the database with a 60-second in-memory cache so it doesn't add
// a query to every click. ADMIN_EMAILS (constants.ts, frozen) remains as a
// read-only fallback: a missed migration cannot lock Robert out.

const ADMIN_CACHE_TTL_MS = 60_000;
const adminCache = new Map<string, { isAdmin: boolean; checkedAt: number }>();

async function isAdminUser(userId: string, userEmail: string | null): Promise<boolean> {
  const cached = adminCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < ADMIN_CACHE_TTL_MS) {
    return cached.isAdmin;
  }

  let isAdmin = false;
  const { data } = await supaFetch<{ is_admin?: boolean }>('user_profiles', {
    params: { id: `eq.${userId}`, select: 'is_admin' },
    single: true,
  });
  if (data?.is_admin === true) {
    isAdmin = true;
  } else if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
    // Fallback only — keeps Robert in if the migration hasn't run yet
    isAdmin = true;
  }

  adminCache.set(userId, { isAdmin, checkedAt: Date.now() });
  return isAdmin;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { userId, userEmail } = req as AuthenticatedRequest;
  if (!userId || !(await isAdminUser(userId, userEmail))) {
    res.status(403).json({ error: 'Admin access required for this operation.' });
    return;
  }
  next();
}

// ─── Full-tier middleware (B-series B2) ───────────────────────────────────
// Reference accounts never receive composite scores, tiers, z-scores,
// allocation output, Briefs, or thesis content (plan §1.2). The tier is
// resolved by requireAuth (auth.ts) on every request; this middleware is
// the hard stop on routes whose entire payload is full-tier content.
// Fails closed: anything that is not explicitly 'full' is refused.

function requireFullTier(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthenticatedRequest).accessTier !== 'full') {
    res.status(403).json({ error: 'Full access required for this feature.' });
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

  // A2 Task 6 companion: supaFetch now returns error:null (not an error)
  // when a single-row request matches zero rows, so a missing fund must be
  // detected by !data to keep returning 404.
  if (error || !data) {
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

  // B2: reference accounts get the allowlist shape (reference-shape.ts —
  // facts only, alphabetical by ticker) with each fund's Dossier coverage
  // joined in. Full-tier responses take the original path below, unchanged
  // byte for byte.
  if ((req as AuthenticatedRequest).accessTier !== 'full') {
    const { data: dossiers } = await supaSelect<ReferenceDossierSource[]>('fund_dossiers', {
      pipeline_run_id: `eq.${latestRun.id}`,
      select: 'fund_id,report_date,holdings_total,fallback_count,resolved_of_resolvable_pct,classified_pct,passes_gate',
    });

    // B7: while REFERENCE_SUMMARIES_ENABLED is true, attach each fund's
    // neutral summary (reference_summaries table) onto the embedded funds
    // identity before shaping — null where no row exists. While the flag is
    // false no lookup runs and this branch is behaviorally identical to its
    // pre-B7 form.
    const scoreRows = (scores || []) as Array<FundScoresRow & { funds?: ReferenceFundIdentity | null }>;
    if (REFERENCE_SUMMARIES_ENABLED) {
      const { data: summaryRows } = await supaSelect<Array<{ fund_id: string; summary_reference: string }>>(
        'reference_summaries',
        { select: 'fund_id,summary_reference' },
      );
      const summaryByFund = new Map((summaryRows || []).map(r => [r.fund_id, r.summary_reference]));
      for (const row of scoreRows) {
        if (row.funds) {
          row.funds.summary_reference = summaryByFund.get(row.fund_id) ?? null;
        }
      }
    }

    res.json({
      funds: shapeFundListForReference(scoreRows, dossiers || []),
      asOf: latestRun.completed_at,
    });
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

  // B2: reference accounts get the allowlist shape (reference-shape.ts)
  // with the Dossier from the same pipeline run as the score, and holdings
  // reduced to name/ticker/pct/sector. Full-tier response below unchanged.
  if ((req as AuthenticatedRequest).accessTier !== 'full') {
    const { data: dossier } = await supaFetch<ReferenceDossierSource>('fund_dossiers', {
      params: {
        fund_id: `eq.${fund.id}`,
        pipeline_run_id: `eq.${score.pipeline_run_id}`,
        select: 'fund_id,report_date,holdings_total,fallback_count,resolved_of_resolvable_pct,classified_pct,passes_gate',
        limit: '1',
      },
      single: true,
    });

    // B7: while REFERENCE_SUMMARIES_ENABLED is true, attach this fund's
    // neutral summary (reference_summaries table, single row by fund_id)
    // onto the identity handed to the shaper — null where no row exists.
    // While the flag is false no lookup runs and this branch is
    // behaviorally identical to its pre-B7 form.
    let referenceFund: ReferenceFundIdentity = fund;
    if (REFERENCE_SUMMARIES_ENABLED) {
      const { data: summaryRow } = await supaFetch<{ summary_reference: string }>('reference_summaries', {
        params: { fund_id: `eq.${fund.id}`, select: 'summary_reference', limit: '1' },
        single: true,
      });
      referenceFund = { ...fund, summary_reference: summaryRow?.summary_reference ?? null };
    }

    res.json({
      fund: shapeFundForReference(referenceFund, score, dossier ?? null),
      holdings: ((holdings || []) as ReferenceHoldingSource[]).map(shapeHoldingForReference),
    });
    return;
  }

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
    // B2: reference accounts skip the wizard — their profile is created
    // already complete. SetupWizard is never shown to them (B3 routes them
    // into the reference shell); weights/risk stay at database defaults and
    // are unused by any reference surface.
    const isReference = (req as AuthenticatedRequest).accessTier !== 'full';
    const { data: created } = await supaInsert<UserProfileRow>('user_profiles', {
      id: userId,
      email: userEmail,
      display_name: userEmail ? userEmail.split('@')[0] : null,
      ...(isReference ? { setup_completed: true } : {}),
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

  // B2: factor weights and risk tolerance are full-tier controls (plan §1.2
  // — reference accounts receive no weighting or risk machinery). A
  // reference account sending any of them is rejected outright;
  // display_name and the other profile fields pass through as before.
  if ((req as AuthenticatedRequest).accessTier !== 'full') {
    const fullTierFields = [
      'weight_cost',
      'weight_quality',
      'weight_positioning',
      'weight_momentum',
      'risk_tolerance',
    ];
    if (fullTierFields.some(f => updates[f] !== undefined)) {
      res.status(403).json({ error: 'Full access required to change weights or risk settings.' });
      return;
    }
  }

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
router.post('/api/profile/setup', requireAuth, requireFullTier, async (req: Request, res: Response) => {
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
// EXAMPLE MIX (B-series B5)
// ═══════════════════════════════════════════════════════════════════════════
// The user's self-authored "example mix": one private row per account in the
// example_allocations table (B1 migration). The table is written only through
// these three routes; the nightly pipeline and the Briefs engine never read
// or write it. All three routes are requireAuth only — both tiers may use
// them, because it is the caller's own data. Every database touch is scoped
// to the JWT's userId ((req as AuthenticatedRequest).userId) and nothing
// else: no route ever accepts a user id from the request body or query.

/**
 * GET /api/example-allocation
 * Returns the caller's saved example mix, or 404 if none is saved.
 */
router.get('/api/example-allocation', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;

  const { data, error } = await supaFetch('example_allocations', {
    params: { user_id: `eq.${userId}` },
    single: true,
  });

  if (error) {
    console.error('[routes] Failed to fetch example allocation:', error);
    res.status(500).json({ error: 'Could not load your example mix. Please try again later.' });
    return;
  }

  // A2 Task 6 behavior: a single-row request matching zero rows returns
  // error:null, so a missing row is detected by !data.
  if (!data) {
    res.status(404).json({ error: 'No saved example mix' });
    return;
  }

  res.json({ allocation: data });
});

/**
 * PUT /api/example-allocation
 * Saves (or replaces) the caller's example mix.
 *
 * Body: { allocations: [{ fund_id, pct }, ...] }
 * Validation, in order — each failure is a 400 with a plain-words message:
 *   1. allocations is a non-empty array of objects
 *   2. every fund_id is a string; no fund_id appears twice
 *   3. every pct is a finite number, at least 0, with at most one decimal
 *      place (more precision is rejected, never silently rounded)
 *   4. the percentages sum to 100, within 0.05 either way
 *   5. every fund_id exists in the active fund set (fetched server-side;
 *      if that fetch fails the request is a 500 — never validated against
 *      a stale or empty list)
 */
router.put('/api/example-allocation', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const { allocations } = req.body || {};

  // 1. Non-empty array of objects
  if (
    !Array.isArray(allocations) ||
    allocations.length === 0 ||
    allocations.some(a => a === null || typeof a !== 'object' || Array.isArray(a))
  ) {
    res.status(400).json({ error: 'Send a non-empty list of funds, each with a fund_id and a pct.' });
    return;
  }

  // 2. Every fund_id is a string; no duplicates
  const fundIds = allocations.map(a => a.fund_id);
  if (fundIds.some(id => typeof id !== 'string')) {
    res.status(400).json({ error: 'Every fund in the list needs a fund_id (text).' });
    return;
  }
  if (new Set(fundIds).size !== fundIds.length) {
    res.status(400).json({ error: 'Each fund can appear only once in the mix.' });
    return;
  }

  // 3. Every pct is a finite number, ≥ 0, at most one decimal place.
  //    The one-decimal test allows for floating-point representation
  //    (12.1 is stored as the nearest double), so it checks that pct × 10
  //    is within a hair of a whole number rather than demanding exactness.
  for (const a of allocations) {
    const pct = a.pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0) {
      res.status(400).json({ error: 'Every percentage must be a number of at least 0.' });
      return;
    }
    if (Math.abs(pct * 10 - Math.round(pct * 10)) > 1e-9) {
      res.status(400).json({ error: 'Percentages can have at most one decimal place (like 12.5).' });
      return;
    }
  }

  // 4. Sum within 100 ± 0.05
  const sum = allocations.reduce((acc, a) => acc + a.pct, 0);
  if (Math.abs(sum - 100) > 0.05) {
    res.status(400).json({ error: `The percentages must add up to 100 (yours add up to ${sum.toFixed(1)}).` });
    return;
  }

  // 5. Every fund_id exists in the active fund set — fetched fresh here.
  //    A failed fetch is a 500, never a validation pass against a stale or
  //    empty list.
  const { data: activeFunds, error: fundsError } = await supaSelect<Array<{ id: string }>>('funds', {
    is_active: 'eq.true',
    select: 'id',
  });
  if (fundsError || !activeFunds) {
    console.error('[routes] Failed to fetch active funds for mix validation:', fundsError);
    res.status(500).json({ error: 'Could not check the fund list. Please try again later.' });
    return;
  }
  const activeIds = new Set(activeFunds.map(f => f.id));
  const unknown = fundIds.filter(id => !activeIds.has(id));
  if (unknown.length > 0) {
    res.status(400).json({ error: 'One or more funds in the mix are not in the current fund menu.' });
    return;
  }

  // Upsert the caller's single row (example_allocations has a UNIQUE
  // constraint on user_id). The explicit updated_at is required — the table
  // has no trigger, so an upsert would not move it on its own.
  const { data, error } = await supaInsert('example_allocations', {
    user_id: userId,
    allocations,
    updated_at: new Date().toISOString(),
  }, { upsert: true, onConflict: 'user_id', single: true });

  if (error) {
    console.error('[routes] Failed to save example allocation:', error);
    res.status(500).json({ error: 'Could not save your example mix. Please try again later.' });
    return;
  }

  res.json({ allocation: data });
});

/**
 * DELETE /api/example-allocation
 * Removes the caller's saved example mix. Deleting when nothing is saved is
 * still a success — the state the caller asked for is the state they have.
 */
router.delete('/api/example-allocation', requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;

  const { error } = await supaDelete('example_allocations', { user_id: `eq.${userId}` });

  if (error) {
    console.error('[routes] Failed to delete example allocation:', error);
    res.status(500).json({ error: 'Could not delete your example mix. Please try again later.' });
    return;
  }

  res.json({ deleted: true });
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
  console.log(`[routes] POST /api/pipeline/run — user: ${(req as AuthenticatedRequest).userEmail}`);
  // Check if a pipeline is already running
  const { data: running } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.running',
      limit: '1',
    },
    single: true,
  });

  if (running) {
    const ageMinutes = (Date.now() - new Date(running.started_at).getTime()) / 60000;
    console.warn(`[routes] Pipeline blocked: existing run ${running.id} started ${ageMinutes.toFixed(0)}m ago`);

    // v8 A0 (Gap 5): THE shared liveness rule from monitor.ts — no heartbeat
    // for 10+ minutes (started_at fallback for pre-migration rows), or past
    // the 6-hour ceiling. Replaces this file's own copy of the old
    // 120-minute wall clock; cron.ts imports the same rule.
    const { runIsStale } = await import('../engine/monitor.js');
    if (runIsStale(running)) {
      console.warn(
        `[routes] Stale run detected (started ${running.started_at}, ` +
        `last heartbeat ${running.heartbeat_at ?? 'none recorded'}) — marking failed`
      );
      await supaUpdate('pipeline_runs', {
        status: 'failed',
        error_message: 'Marked as failed by stale-run check — no heartbeat for 10+ minutes, or past the 6-hour ceiling',
        completed_at: new Date().toISOString(),
      }, { id: `eq.${running.id}` });
    } else {
      res.status(409).json({
        error: 'A pipeline run is already in progress',
        runId: running.id,
        startedAt: running.started_at,
      });
      return;
    }
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
  const { runFullPipeline, PipelineCancelledError } = await import('../engine/pipeline.js');
  // v8 A0 (Gap 5): heartbeat for the web-trigger path — one of the three
  // runner sites (cron.ts nightly and monitor.ts retry are the others).
  // UI Honesty item 3: the cancel checker rides along at all three sites.
  const { startRunHeartbeat, makeCancelChecker } = await import('../engine/monitor.js');
  const stopHeartbeat = startRunHeartbeat(runId);
  const shouldAbort = makeCancelChecker(runId);

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
    const result = await runFullPipeline(funds, onProgress, shouldAbort);

    // UI Honesty item 3: checkpoint between the pipeline and the summaries
    // step — steps 15/16 live in this runner, outside runFullPipeline's
    // own checkpoints.
    if (await shouldAbort()) throw new PipelineCancelledError();

    // ── Step 15: Generate natural-language fund summaries (editorial voice) ──
    console.log(`[routes] Pipeline ${runId}: starting fund summaries`);
    activePipelineSteps.set(runId, { currentStep: 15, stepMessage: 'Generating fund summaries', totalSteps: 16 });
    let fundSummaries = {};
    try {
      const { generateFundSummaries } = await import('../engine/fund-summaries.js');
      fundSummaries = await generateFundSummaries(result.scoring.funds, funds);
      console.log(`[routes] Pipeline ${runId}: fund summaries complete`);
    } catch (err) {
      console.warn(`[routes] Fund summary generation failed (non-fatal): ${err}`);
    }

    // UI Honesty item 3: last checkpoint before persist — the point of no
    // return. A cancel landing here means nothing was written this run.
    if (await shouldAbort()) throw new PipelineCancelledError();

    // ── Step 16: Persist results to Supabase ──
    console.log(`[routes] Pipeline ${runId}: starting persist`);
    activePipelineSteps.set(runId, { currentStep: 16, stepMessage: 'Saving results', totalSteps: 16 });
    await persistPipelineResults(runId, result, funds, fundSummaries);
    console.log(`[routes] Pipeline ${runId}: persist complete`);

    // Save pipeline log to the run record
    const totalElapsed = ((Date.now() - logStart) / 1000).toFixed(1);
    pipelineLog.push(`[${totalElapsed}s] Pipeline completed successfully`);
    activePipelineSteps.delete(runId);
    await supaUpdate('pipeline_runs', {
      pipeline_log: pipelineLog.join('\n'),
    }, { id: `eq.${runId}` }).catch(() => {});

    console.log(`[routes] Pipeline run ${runId} completed successfully`);

    // Post-pipeline Brief regeneration removed per Robert's July 1, 2026 decision
    // (A2 Task 2). On-demand generation via POST /api/briefs/generate and the
    // monthly checkAndSendBriefs delivery cadence are unaffected.
  } catch (err) {
    // UI Honesty item 3: a deliberate cancel is not a crash — record it as
    // "Cancelled by user"; no alarm, no error-state step data.
    if (err instanceof PipelineCancelledError) {
      console.log(`[routes] Pipeline run ${runId} cancelled by user — stopped at a checkpoint`);
      activePipelineSteps.delete(runId);
      await supaUpdate('pipeline_runs', {
        status: 'failed',
        error_message: 'Cancelled by user',
        completed_at: new Date().toISOString(),
      }, { id: `eq.${runId}` });
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[routes] Pipeline run ${runId} failed: ${msg}`);
    // Keep step data visible briefly so overlay can show the error state
    const lastStep = activePipelineSteps.get(runId);
    if (lastStep) {
      activePipelineSteps.set(runId, {
        ...lastStep,
        stepMessage: `Error: ${msg.slice(0, 120)}`,
      });
    }

    await supaUpdate('pipeline_runs', {
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }, { id: `eq.${runId}` });

    // Clean up after a delay so the client has time to poll the error
    setTimeout(() => activePipelineSteps.delete(runId), 10000);
  } finally {
    stopHeartbeat();
  }
}

/**
 * POST /api/pipeline/abort
 * Request cancellation of a running pipeline (UI Honesty item 3).
 *
 * This endpoint no longer writes a terminal status. It stamps
 * cancel_requested_at on the running row; the pipeline process checks the
 * stamp at its checkpoints, stops itself cleanly, and writes its own
 * terminal status ("Cancelled by user"). The row keeps status='running'
 * until the process actually exits, so the already-running guard cannot
 * wave a second run through mid-wind-down (Task 1, hazard 3).
 *
 * Auth: was deliberately unauthenticated for the browser-close sendBeacon;
 * that beacon is gone (runs survive browser close — Robert's July 6
 * ruling), so cancel is now admin-only like the run trigger.
 *
 * Body: { runId: string }
 */
router.post('/api/pipeline/abort', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { runId } = req.body || {};

  if (!runId || typeof runId !== 'string') {
    res.status(400).json({ error: 'Missing runId' });
    return;
  }

  console.log(`[routes] Pipeline cancel requested for run ${runId}`);

  // Stamp the cancel request — only on a row that is still running
  const { data } = await supaUpdate('pipeline_runs', {
    cancel_requested_at: new Date().toISOString(),
  }, { id: `eq.${runId}`, status: 'eq.running' });

  const matched = Array.isArray(data) ? data.length > 0 : !!data;
  if (!matched) {
    res.status(409).json({ error: 'No running pipeline with that ID — it may have already finished' });
    return;
  }

  res.json({ message: 'Cancel requested — the run stops at its next checkpoint' });
});

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
router.get('/api/pipeline/log/:runId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
router.get('/api/pipeline/history', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
router.get('/api/briefs', requireAuth, requireFullTier, async (req: Request, res: Response) => {
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
router.get('/api/briefs/:id', requireAuth, requireFullTier, async (req: Request, res: Response) => {
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
router.post('/api/briefs/generate', requireAuth, requireFullTier, briefRateLimit, async (req: Request, res: Response) => {
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
router.get('/api/thesis/latest', requireAuth, requireFullTier, async (req: Request, res: Response) => {
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
router.get('/api/monitor/health', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
router.get('/api/monitor/data-quality', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { getDataQualityMetrics } = await import('../engine/monitor.js');
  const report = await getDataQualityMetrics();
  res.json(report);
});

/**
 * GET /api/dossiers/latest
 * Per-fund data-quality Dossiers from the most recent completed pipeline
 * run (A3 Task 5). Read-only — Robert's diagnostic instrument on the
 * Pipeline tab. Failures sort first.
 */
router.get('/api/dossiers/latest', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const { data: latestRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (!latestRun) {
    res.json({ dossiers: [], runId: null, completedAt: null });
    return;
  }

  const { data: dossiers, error } = await supaSelect('fund_dossiers', {
    pipeline_run_id: `eq.${latestRun.id}`,
    select: '*, funds(ticker, name)',
    order: 'passes_gate.asc,created_at.asc',
  });

  if (error) {
    console.error('[routes] Failed to fetch dossiers:', error);
    res.status(500).json({ error: 'Failed to fetch fund dossiers. Please try again later.' });
    return;
  }

  res.json({
    dossiers: dossiers || [],
    runId: latestRun.id,
    completedAt: latestRun.completed_at,
  });
});

/**
 * GET /api/monitor/cron
 * Cron job status.
 *
 * Shows whether pipeline and Brief delivery jobs are currently running
 * and their schedule. Useful for debugging "why didn't my scores update?"
 */
router.get('/api/monitor/cron', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
router.post('/api/help/chat', requireAuth, helpChatRateLimit, async (req: Request, res: Response) => {
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
 * POST /api/benchmark/classification
 * A5 Task 7 (TEMPORARY — removed once the report is filed): admin-only
 * trigger for the Haiku classification benchmark. Returns 202 immediately;
 * the report arrives by admin email a few minutes later. Read-only —
 * touches no fund data, writes nothing.
 */
router.post('/api/benchmark/classification', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { startClassificationBenchmark } = await import('../engine/benchmark.js');
  const sampleTarget = parseInt(req.query.sample as string) || 400;
  const status = startClassificationBenchmark(sampleTarget);

  if (!status.started) {
    res.status(409).json({ error: status.reason });
    return;
  }
  res.status(202).json({
    message: 'Benchmark started — the report will arrive by email in a few minutes.',
  });
});

/**
 * GET /api/benchmark/status
 * v8 A0 (Gap 4): admin-only benchmark visibility — running state and the
 * last run's outcome (finished when, success/failed, summary, whether the
 * report email actually sent). The harness stays: v8 A3's Sonnet 5
 * acceptance gate reuses it, so this endpoint is not temporary.
 */
router.get('/api/benchmark/status', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const { getBenchmarkStatus } = await import('../engine/benchmark.js');
  res.json(getBenchmarkStatus());
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


// ═══════════════════════════════════════════════════════════════════════════
// REFERENCE SUMMARIES (B-series B7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/reference-summaries/generate
 * B7: admin-only, rate-limited trigger for neutral reference-summary drafts.
 *
 * Generates a describe-never-evaluate summary per fund from the latest
 * completed pipeline run's data and upserts the accepted ones into the
 * reference_summaries table (one row per fund; rejected tickers leave any
 * existing row untouched — last good stands). This route is the ONLY writer
 * of reference_summaries: the nightly pipeline, cron, retry, and persist
 * paths never touch it. Serving to reference accounts is separately gated
 * by REFERENCE_SUMMARIES_ENABLED (ships false), so generating drafts here
 * exposes nothing until Robert flips the flag after HR sign-off.
 *
 * Returns { generated, rejected, total } — rejected carries { ticker, word }
 * for each summary the banned-vocabulary post-check refused.
 */
router.post('/api/reference-summaries/generate', requireAuth, requireAdmin, pipelineRateLimit, async (req: Request, res: Response) => {
  console.log(`[routes] POST /api/reference-summaries/generate — user: ${(req as AuthenticatedRequest).userEmail}`);

  // Latest completed pipeline run — same lookup as the scores list route
  const { data: latestRun } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  if (!latestRun) {
    res.status(404).json({ error: 'No completed pipeline runs yet — nothing to summarize.' });
    return;
  }

  // That run's scores with the embedded funds identity join — the same
  // shape the scores list route uses
  const { data: scores, error } = await supaSelect<Array<{
    fund_id: string;
    factor_details: Record<string, unknown>;
    funds?: { ticker: string; name: string; expense_ratio: number | null } | null;
  }>>('fund_scores', {
    pipeline_run_id: `eq.${latestRun.id}`,
    select: 'fund_id, factor_details, funds(ticker, name, expense_ratio)',
  });

  if (error || !scores || scores.length === 0) {
    console.error('[routes] reference-summaries: failed to fetch fund scores:', error);
    res.status(500).json({ error: 'Failed to fetch fund scores. Please try again later.' });
    return;
  }

  // Map to the generator's database-row input shape, keeping fund_id
  // alongside ticker for the write-back. A row without its funds join has
  // no identity and is skipped — the same rule the shaper applies.
  const tickerToFundId = new Map<string, string>();
  const inputs: Array<{
    ticker: string;
    name: string;
    expense_ratio: number | null;
    factor_details: Record<string, unknown>;
  }> = [];
  for (const row of scores) {
    if (!row.funds) continue;
    tickerToFundId.set(row.funds.ticker, row.fund_id);
    inputs.push({
      ticker: row.funds.ticker,
      name: row.funds.name,
      expense_ratio: row.funds.expense_ratio,
      factor_details: row.factor_details,
    });
  }

  const { generateReferenceSummaries } = await import('../engine/fund-summaries.js');
  const { summaries, rejected } = await generateReferenceSummaries(inputs);

  // Upsert accepted summaries — one row per fund (unique fund_id).
  // generated_at is set explicitly because the column default fires only on
  // first insert; a regenerated draft must carry its regeneration time.
  const now = new Date().toISOString();
  let generated = 0;
  for (const [ticker, summary] of Object.entries(summaries)) {
    const fundId = tickerToFundId.get(ticker);
    if (!fundId) continue; // ticker we never sent — drop it, write nothing
    const { error: upsertError } = await supaInsert('reference_summaries', {
      fund_id: fundId,
      summary_reference: summary,
      generated_at: now,
    }, { upsert: true, onConflict: 'fund_id' });
    if (upsertError) {
      console.error(`[routes] reference_summaries upsert failed for ${ticker}:`, upsertError);
    } else {
      generated++;
    }
  }

  res.json({ generated, rejected, total: inputs.length });
});
