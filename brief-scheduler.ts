/**
 * FundLens v6 — Investment Brief Scheduler
 *
 * Checks daily for users whose 30-day Brief window is up, then generates
 * and emails a fresh Brief for each eligible user.
 *
 * How it works:
 *   1. A cron job (configured in Session 7) calls checkAndSendBriefs() daily
 *   2. The scheduler queries user_profiles for users who:
 *      - Have briefs_enabled = true
 *      - Have completed setup (setup_completed = true)
 *      - Last received a Brief 30+ days ago (or never received one)
 *   3. For each eligible user, it generates a personalized Brief
 *      using the latest pipeline scores
 *   4. The Brief is saved to Supabase and emailed via Resend
 *
 * The scheduler also exposes generateBriefForUser() for on-demand
 * generation when a user clicks "Generate Brief Now" in the UI.
 *
 * MANDATORY: All Claude and external API calls are sequential.
 * NEVER Promise.all() — has crashed production 5+ times.
 *
 * Session 6 deliverable. Destination: src/engine/brief-scheduler.ts
 * References: Master Reference §7 (Delivery), §8 (Pipeline).
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BRIEF, CLAUDE } from './constants.js';
import { delay } from './types.js';
import { supaFetch, supaSelect } from '../services/supabase.js';
import { generateBrief } from './brief-engine.js';
import { sendBriefEmail } from './brief-email.js';
import type { UserProfileRow, PipelineRunRow } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SchedulerResult {
  /** Total users checked */
  usersChecked: number;
  /** Users eligible for a new Brief */
  usersEligible: number;
  /** Briefs successfully generated */
  briefsGenerated: number;
  /** Briefs successfully emailed */
  briefsSent: number;
  /** Errors encountered */
  errors: Array<{ userId: string; step: string; error: string }>;
  /** Duration in milliseconds */
  durationMs: number;
}

// ─── Editorial Policy Loader ────────────────────────────────────────────────

/** Cache the editorial policy in memory (loaded once) */
let cachedEditorialPolicy: string | null = null;

/**
 * Load the editorial policy prompt file.
 * Located at src/prompts/editorial-policy.md in the repo.
 */
function loadEditorialPolicy(): string {
  if (cachedEditorialPolicy) return cachedEditorialPolicy;

  try {
    // __dirname equivalent for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Try common locations relative to the compiled JS location
    const paths = [
      join(__dirname, '../prompts/editorial-policy.md'),
      join(__dirname, '../../src/prompts/editorial-policy.md'),
      join(process.cwd(), 'src/prompts/editorial-policy.md'),
    ];

    for (const p of paths) {
      try {
        cachedEditorialPolicy = readFileSync(p, 'utf-8');
        console.log(`[brief-scheduler] Loaded editorial policy from ${p}`);
        return cachedEditorialPolicy;
      } catch {
        // try next path
      }
    }

    throw new Error('editorial-policy.md not found in any expected location');
  } catch (err) {
    console.error(`[brief-scheduler] Failed to load editorial policy: ${err}`);
    // Fallback: minimal policy so Briefs can still generate
    return 'You are a research analyst writing an Investment Brief for a 401(k) participant. Be factual, cite specific metrics, never imply certainty about future performance. Target 800-1200 words.';
  }
}

// ─── Core Scheduler ─────────────────────────────────────────────────────────

/**
 * Find users who are eligible for a new Investment Brief.
 *
 * A user is eligible if:
 *   1. briefs_enabled = true (haven't opted out)
 *   2. setup_completed = true (finished the wizard)
 *   3. last_brief_sent_at is NULL (never received one) OR
 *      last_brief_sent_at is 30+ days ago
 */
async function findEligibleUsers(): Promise<UserProfileRow[]> {
  const thirtyDaysAgo = new Date(
    Date.now() - BRIEF.DELIVERY_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Users who have never received a Brief
  const { data: neverReceived } = await supaSelect<UserProfileRow[]>(
    'user_profiles',
    {
      briefs_enabled: 'eq.true',
      setup_completed: 'eq.true',
      last_brief_sent_at: 'is.null',
    }
  );

  // Users whose last Brief was 30+ days ago
  const { data: overdue } = await supaSelect<UserProfileRow[]>(
    'user_profiles',
    {
      briefs_enabled: 'eq.true',
      setup_completed: 'eq.true',
      'last_brief_sent_at': `lt.${thirtyDaysAgo}`,
    }
  );

  const all = [...(neverReceived || []), ...(overdue || [])];

  // Deduplicate by user ID (shouldn't overlap, but safety)
  const seen = new Set<string>();
  return all.filter(u => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

/**
 * Get the latest completed pipeline run.
 * Briefs are always based on the most recent pipeline scores.
 */
async function getLatestPipelineRun(): Promise<PipelineRunRow | null> {
  const { data } = await supaFetch<PipelineRunRow>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
    },
    single: true,
  });

  return data;
}

/**
 * Generate and send an Investment Brief for a single user.
 *
 * This is used both by the scheduler (automatic monthly delivery)
 * and by the API route (on-demand "Generate Brief Now" button).
 *
 * @param userId User's UUID
 * @param pipelineRunId Pipeline run to base the Brief on
 * @param sendEmail Whether to email the Brief (true for scheduled, optional for on-demand)
 */
export async function generateBriefForUser(
  userId: string,
  pipelineRunId: string,
  sendEmail: boolean = true
): Promise<{ briefId: string | null; sent: boolean; error: string | null }> {

  const editorialPolicy = loadEditorialPolicy();

  // Generate the Brief
  const result = await generateBrief(userId, pipelineRunId, editorialPolicy);

  if (!result) {
    return { briefId: null, sent: false, error: 'Brief generation failed' };
  }

  // Send email if requested
  if (sendEmail) {
    // Get user's email
    const { data: profile } = await supaFetch<UserProfileRow>('user_profiles', {
      params: { id: `eq.${userId}` },
      single: true,
    });

    if (profile?.email) {
      const emailResult = await sendBriefEmail({
        briefId: result.briefId,
        userId,
        toEmail: profile.email,
        title: result.title,
        contentMd: result.contentMd,
      });

      return {
        briefId: result.briefId,
        sent: emailResult.success,
        error: emailResult.error,
      };
    } else {
      console.warn(`[brief-scheduler] No email for user ${userId}, Brief saved but not sent`);
      return { briefId: result.briefId, sent: false, error: 'No email address on profile' };
    }
  }

  return { briefId: result.briefId, sent: false, error: null };
}

/**
 * Run the daily Brief scheduler.
 *
 * Called by a cron job (configured in Session 7). Finds all eligible
 * users and generates + emails a Brief for each one, sequentially.
 *
 * Sequential is intentional: we're calling Claude Opus for each user,
 * and we don't want to hit rate limits or run up a huge parallel bill.
 * With ~200 users, even at 30 seconds per Brief, the whole run takes
 * about 100 minutes — well within a daily window.
 */
export async function checkAndSendBriefs(): Promise<SchedulerResult> {
  const startMs = Date.now();
  const errors: SchedulerResult['errors'] = [];
  let briefsGenerated = 0;
  let briefsSent = 0;

  console.log('[brief-scheduler] Starting daily Brief check');

  // Find eligible users
  const eligible = await findEligibleUsers();
  console.log(`[brief-scheduler] Found ${eligible.length} eligible users`);

  if (eligible.length === 0) {
    return {
      usersChecked: 0,
      usersEligible: 0,
      briefsGenerated: 0,
      briefsSent: 0,
      errors: [],
      durationMs: Date.now() - startMs,
    };
  }

  // Check that we have pipeline scores to base Briefs on
  const latestRun = await getLatestPipelineRun();
  if (!latestRun) {
    console.warn('[brief-scheduler] No completed pipeline run — skipping Brief generation');
    return {
      usersChecked: eligible.length,
      usersEligible: eligible.length,
      briefsGenerated: 0,
      briefsSent: 0,
      errors: [{ userId: 'ALL', step: 'pipeline', error: 'No completed pipeline run' }],
      durationMs: Date.now() - startMs,
    };
  }

  // Generate + send for each user (sequential — NEVER parallel)
  for (const user of eligible) {
    console.log(`[brief-scheduler] Generating Brief for user ${user.id} (${user.email})`);

    try {
      const result = await generateBriefForUser(user.id, latestRun.id, true);

      if (result.briefId) {
        briefsGenerated++;
        if (result.sent) briefsSent++;
      }

      if (result.error) {
        errors.push({ userId: user.id, step: 'generate', error: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ userId: user.id, step: 'generate', error: msg });
      console.error(`[brief-scheduler] Error for user ${user.id}: ${msg}`);
    }

    // Delay between users to be respectful of Claude API rate limits
    await delay(CLAUDE.CALL_DELAY_MS * 2);
  }

  const durationMs = Date.now() - startMs;

  console.log(
    `[brief-scheduler] Complete in ${(durationMs / 1000 / 60).toFixed(1)} min: ` +
    `${briefsGenerated}/${eligible.length} generated, ` +
    `${briefsSent} sent, ${errors.length} errors`
  );

  return {
    usersChecked: eligible.length,
    usersEligible: eligible.length,
    briefsGenerated,
    briefsSent,
    errors,
    durationMs,
  };
}
