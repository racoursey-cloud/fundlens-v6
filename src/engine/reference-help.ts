/**
 * FundLens — Reference Help Agent (B-series B10 c6)
 *
 * The AI-driven Help chat for the reference tier (ruling 8: the model
 * writes every answer live, grounded). Sibling of the legacy full-tier
 * help-agent.ts (Session 12) with a reference-safe prompt, per-call
 * grounding, and the code fence.
 *
 * Tier isolation by construction (ruling 4), the layers this file owns:
 *   (a) tier-scoped grounding — approved reference help_entries plus the
 *       member's fund data, which passes through the reference-shape.ts
 *       allowlist serializer before a word of it enters the prompt; the
 *       full-tier machinery never reaches the model.
 *   (c) code post-checks on every generated reply before it is served:
 *       findBannedWord() (B7 evaluative list) and findFullTierNoun()
 *       (below) — a hit means the reply is NOT served, the member sees
 *       the trouble copy, and the exchange logs `rejected` with the
 *       tripped word. Loud, so a chatty model can't quietly erode the
 *       fence.
 *   (d) the system prompt (src/prompts/reference-help.md) is the last
 *       layer, never the guarantee.
 *
 * Every exchange is logged to help_questions via the service role
 * (ruling 5 — with pre-review overridden, the log IS the review).
 * The nightly pipeline never touches this module or its tables.
 *
 * Claude law: one call per question on CLAUDE.HELP_CHAT_MODEL (the Opus
 * seat — CB-S ruling 4, August 1, 2026, superseding the B10 ruling 9
 * Sonnet seat; the B10 eval stands as evidence of record), last-10-message
 * history window, loud failure email on API error (the A2 Task 3 pattern,
 * reused). Length caution cured by the prompt's Smart Brevity section
 * (CB-S ruling 5).
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CLAUDE, REFERENCE_HELP_AI_ENABLED } from './constants.js';
import { findBannedWord } from './fund-summaries.js';
import { alertClaudeApiFailure } from './admin-alert.js';
import { supaFetch, supaSelect, supaInsert } from './supabase.js';
import {
  shapeFundListForReference,
  type ReferenceDossierSource,
  type ReferenceFundIdentity,
  type ReferenceFundView,
} from './reference-shape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReferenceHelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReferenceHelpRequest {
  /** The asking member's user id (for the exchange log) */
  userId: string;
  message: string;
  history?: ReferenceHelpMessage[];
}

/** The four logged outcomes (help_questions CHECK constraint) plus
 *  'maintenance' — the flag-off answer, which makes no Claude call and
 *  writes no log row (the chat UI is hidden while the flag is false). */
export type ReferenceHelpOutcome =
  | 'answered'
  | 'refused'
  | 'rejected'
  | 'error'
  | 'maintenance';

export interface ReferenceHelpResult {
  reply: string;
  outcome: ReferenceHelpOutcome;
}

// ─── Copy of record (§6 of the ratified order) ──────────────────────────────

/** Standing refusal (ruling 2) — served from code, never composed by the
 *  model, whenever the model answers with the [ADVICE] token. */
export const STANDING_REFUSAL =
  "FundLens explains — it doesn't direct. I can explain what things like " +
  "expense ratios or diversification mean, but I can't tell you which fund " +
  "to pick or what's right for your situation. For personal advice, talk " +
  'to a qualified financial adviser.';

/** Trouble copy — post-check rejection or API error. Reworded in B10-F1
 *  (F1-a): the ratified original contained the banned stem "good";
 *  code-served lines are exempt from the post-check, but the copy holds
 *  itself to the same standard. "below" — the FAQ sits under the chat
 *  since F1-e. */
export const TROUBLE_COPY =
  "I couldn't finish a clean answer to that one just now. Your question " +
  'has been recorded — try rewording it, or check the questions below.';

/** Maintenance copy — the kill switch is off. */
export const MAINTENANCE_COPY =
  'The Help assistant is temporarily offline. The questions and glossary ' +
  'above are still available.';

// ─── The full-tier-noun fence (layer c, second check) ───────────────────────
// The short stems per eval finding 2: 'scor' catches score/scored/scoring,
// 'rank' catches rank/ranked/ranking. Whole-word-stem shape identical to
// findBannedWord (B7): word boundary, the stem, any trailing word
// characters. Overmatching ("topic" is caught by B7's 'top'; "briefly" by
// 'brief' here) is accepted by design, B7 doctrine — a rejected reply costs
// one trouble message, a leaked full-tier noun costs the tier line.

export const FULL_TIER_NOUN_STEMS = [
  'scor', 'rank', 'race', 'regime', 'contender', 'verdict', 'brief',
] as const;

/**
 * Test a reply against the full-tier-noun blocklist, case-insensitively,
 * as whole-word stems. Returns the first stem matched, or null if clean.
 * Exported so the fence can be proven standalone (battery item 3).
 */
export function findFullTierNoun(reply: string): string | null {
  for (const stem of FULL_TIER_NOUN_STEMS) {
    const pattern = new RegExp(`\\b${stem}\\w*`, 'i');
    if (pattern.test(reply)) return stem;
  }
  return null;
}

// ─── Prompt loading (help-agent.ts candidates pattern) ──────────────────────

let cachedPrompt: string | null = null;

function loadReferenceHelpPrompt(): string {
  if (cachedPrompt) return cachedPrompt;

  const candidates = [
    join(__dirname, '../prompts/reference-help.md'),
    join(__dirname, '../../src/prompts/reference-help.md'),
    join(process.cwd(), 'src/prompts/reference-help.md'),
  ];

  for (const p of candidates) {
    try {
      cachedPrompt = readFileSync(p, 'utf-8');
      console.log(`[reference-help] Loaded prompt from ${p}`);
      return cachedPrompt;
    } catch {
      // Try next candidate
    }
  }

  // No safe fallback exists for this prompt — the fence's layer (d) must
  // never silently degrade to a generic assistant. Callers treat a throw
  // as an API-path error: trouble copy, logged 'error', loud.
  throw new Error('reference-help.md prompt file not found');
}

// ─── Grounding (layer a) ────────────────────────────────────────────────────

interface HelpEntryRow {
  slug: string;
  question: string;
  answer_text: string;
}

interface DescriptionRow {
  fund_id: string;
  objective_text: string;
  strategies_text: string;
  source_accession: string;
  source_series_id: string;
  filing_ddate: string;
  translation_text: string | null;
}

/**
 * Build the per-call grounding block: approved reference help_entries plus
 * the member's reference-shaped fund data — the same shaped structures the
 * app already serves them (name/ticker, expense ratio, the About-tab
 * SEC-filed descriptions). Everything fund-side passes through
 * shapeFundListForReference (the reference-shape.ts allowlist) first, so
 * full-tier machinery never enters the prompt. Only the fields the order
 * names are then serialized out of the shaped views.
 *
 * An empty approved set does not block the agent — it grounds on the fund
 * data alone until entries land. No completed pipeline run → entries alone.
 */
async function buildGroundingBlock(): Promise<string> {
  const sections: string[] = [];

  // Approved, tier-scoped explainer entries (ruling 4 layer a)
  const { data: entries } = await supaSelect<HelpEntryRow[]>('help_entries', {
    tier: 'eq.reference',
    status: 'eq.approved',
    order: 'slug.asc',
  }, 'slug,question,answer_text');

  if (entries && entries.length > 0) {
    const lines = entries.map(
      e => `Q: ${e.question}\nA: ${e.answer_text}`
    );
    sections.push(
      'REVIEWED EXPLAINER MATERIAL (general concepts, reviewed for this tier):\n\n' +
      lines.join('\n\n')
    );
  }

  const shaped = await fetchShapedFunds();
  if (shaped.length > 0) {
    const fundLines = shaped.map(fund => {
      const parts: string[] = [`## ${fund.name} (${fund.ticker})`];
      if (fund.expense_ratio != null) {
        parts.push(`- Expense ratio: ${(fund.expense_ratio * 100).toFixed(2)}%`);
      }
      if (fund.description) {
        parts.push(`- Investment Objective (SEC-filed, verbatim): ${fund.description.objective_text}`);
        parts.push(`- Principal Investment Strategies (SEC-filed, verbatim): ${fund.description.strategies_text}`);
      }
      return parts.join('\n');
    });
    sections.push(
      "THE PLAN'S FUNDS (reference-shaped: name, ticker, cost, and each fund's own SEC-filed description):\n\n" +
      fundLines.join('\n\n')
    );
  }

  if (sections.length === 0) return '';
  return `\n\n---\n\nGROUNDING — your only sources for fund-specific facts:\n\n${sections.join('\n\n')}`;
}

/** The member's fund data on the app's own serving path: latest completed
 *  run → scores with the funds identity join → descriptions attached →
 *  through the allowlist serializer. Mirrors the /api/scores reference
 *  branch (routes.ts). */
async function fetchShapedFunds(): Promise<ReferenceFundView[]> {
  const { data: latestRun } = await supaFetch<{ id: string }>('pipeline_runs', {
    params: {
      status: 'eq.completed',
      order: 'completed_at.desc',
      limit: '1',
      select: 'id',
    },
    single: true,
  });
  if (!latestRun) return [];

  const { data: scores } = await supaSelect<Array<{
    fund_id: string;
    factor_details: Record<string, unknown>;
    scored_at: string;
    funds?: ReferenceFundIdentity | null;
  }>>('fund_scores', {
    pipeline_run_id: `eq.${latestRun.id}`,
  }, 'fund_id, factor_details, scored_at, funds(ticker, name, expense_ratio)');
  if (!scores || scores.length === 0) return [];

  const { data: dossiers } = await supaSelect<ReferenceDossierSource[]>('fund_dossiers', {
    pipeline_run_id: `eq.${latestRun.id}`,
  }, 'fund_id,report_date,holdings_total,fallback_count,resolved_of_resolvable_pct,classified_pct,passes_gate');

  const { data: descRows } = await supaSelect<DescriptionRow[]>('fund_descriptions', {},
    'fund_id,objective_text,strategies_text,source_accession,source_series_id,filing_ddate,translation_text');
  const descByFund = new Map((descRows || []).map(d => [d.fund_id, d]));
  for (const row of scores) {
    if (row.funds) {
      (row.funds as ReferenceFundIdentity & { description?: DescriptionRow | null }).description =
        descByFund.get(row.fund_id) ?? null;
    }
  }

  return shapeFundListForReference(scores, dossiers || []);
}

// ─── The exchange log (ruling 5) ────────────────────────────────────────────

async function logExchange(
  userId: string,
  question: string,
  answer: string | null,
  outcome: 'answered' | 'refused' | 'rejected' | 'error',
  rejectReason: string | null,
): Promise<void> {
  const { error } = await supaInsert('help_questions', {
    user_id: userId,
    question_text: question,
    answer_text: answer,
    outcome,
    reject_reason: rejectReason,
  });
  if (error) {
    // The log is the review mechanism — a write failure must be loud, but
    // it never blocks the member's reply.
    console.error('[reference-help] help_questions log write FAILED:', error);
  }
  // CB-S s6: every exchange's console line names the seat, so the model
  // answering members is evident in the logs forever.
  console.log(`[reference-help] Exchange logged (${outcome}) — seat ${CLAUDE.HELP_CHAT_MODEL}`);
}

// ─── The ask ────────────────────────────────────────────────────────────────

/**
 * Answer one reference Help question. One Claude call, post-checked, every
 * exchange logged. Never throws — every failure path resolves to a served
 * copy line and a logged outcome.
 */
export async function askReferenceHelp(
  request: ReferenceHelpRequest,
): Promise<ReferenceHelpResult> {
  // Kill switch (c3): no Claude call, no log row — the chat UI is hidden
  // while the flag is false; this answer covers direct callers.
  if (!REFERENCE_HELP_AI_ENABLED) {
    console.log('[reference-help] Flag off — served maintenance copy, zero Claude calls');
    return { reply: MAINTENANCE_COPY, outcome: 'maintenance' };
  }

  const question = request.message.trim();

  let systemPrompt: string;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let reply = '';
  try {
    systemPrompt = loadReferenceHelpPrompt() + await buildGroundingBlock();

    // Last-10-message history window (the help-agent.ts pattern)
    if (request.history) {
      for (const msg of request.history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: question });

    reply = await callModel(systemPrompt, messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reference-help] Claude API error: ${msg}`);
    // A2 Task 3 (Principle 1): failures must be loud — email Robert,
    // rate-limited to one alert per error type per 24 hours.
    alertClaudeApiFailure('Reference Help', msg).catch(() => {});
    await logExchange(request.userId, question, TROUBLE_COPY, 'error', null);
    return { reply: TROUBLE_COPY, outcome: 'error' };
  }

  if (!reply) {
    console.error('[reference-help] Empty reply from model');
    await logExchange(request.userId, question, TROUBLE_COPY, 'error', null);
    return { reply: TROUBLE_COPY, outcome: 'error' };
  }

  // [ADVICE] token → the standing refusal, served from code (ruling 2).
  // Any occurrence counts — a reply that carries the token alongside prose
  // is aberrant and must not be served either.
  if (reply.includes('[ADVICE]')) {
    await logExchange(request.userId, question, STANDING_REFUSAL, 'refused', null);
    return { reply: STANDING_REFUSAL, outcome: 'refused' };
  }

  // Post-checks (layer c): both fences, every generated reply, before
  // serving. A hit is loud — the log line and the logged row both name
  // the tripped word.
  const tripped = findBannedWord(reply) ?? findFullTierNoun(reply);
  if (tripped === null) {
    await logExchange(request.userId, question, reply, 'answered', null);
    return { reply, outcome: 'answered' };
  }

  // B10-F1 (F1-c): one silent retry before the trouble copy. The retry
  // names the tripped word and instructs a rewrite without it; the fenced
  // draft rides in the retry prompt (prompt-side only — it is never
  // served or stored). Sequential by law: 1.2s delay, one extra call
  // worst-case.
  console.error(
    `[reference-help] Generated reply tripped fence word "${tripped}" — one silent retry.`
  );
  let retryReply = '';
  try {
    await delay(CLAUDE.CALL_DELAY_MS);
    const retryMessages = [
      ...messages,
      { role: 'assistant' as const, content: reply },
      {
        role: 'user' as const,
        content:
          `Your reply used the word "${tripped}", which must never appear — ` +
          `not that word and not any word beginning with those letters. ` +
          `Rewrite the answer without it: same substance, same length, all ` +
          `other rules unchanged. Return only the rewritten answer.`,
      },
    ];
    retryReply = await callModel(systemPrompt, retryMessages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reference-help] Claude API error on retry: ${msg}`);
    alertClaudeApiFailure('Reference Help', msg).catch(() => {});
    // The first draft was fenced AND the retry errored — outcome is the
    // API error; reject_reason still records the word that forced the
    // retry, so the review log carries both facts.
    await logExchange(request.userId, question, TROUBLE_COPY, 'error', tripped);
    return { reply: TROUBLE_COPY, outcome: 'error' };
  }

  if (!retryReply) {
    console.error('[reference-help] Empty reply from model on retry');
    await logExchange(request.userId, question, TROUBLE_COPY, 'error', tripped);
    return { reply: TROUBLE_COPY, outcome: 'error' };
  }

  if (retryReply.includes('[ADVICE]')) {
    await logExchange(request.userId, question, STANDING_REFUSAL, 'refused', null);
    return { reply: STANDING_REFUSAL, outcome: 'refused' };
  }

  const trippedAgain = findBannedWord(retryReply) ?? findFullTierNoun(retryReply);
  if (trippedAgain !== null) {
    console.error(
      `[reference-help] REJECTED retry reply — tripped fence word "${trippedAgain}" ` +
      `(first trip "${tripped}"). Reply not served.`
    );
    // answer_text records what the member actually saw (the trouble copy);
    // both fenced drafts are deliberately not stored. reject_reason names
    // both tripped words (F1-c: e.g. "good; best").
    await logExchange(
      request.userId, question, TROUBLE_COPY, 'rejected', `${tripped}; ${trippedAgain}`,
    );
    return { reply: TROUBLE_COPY, outcome: 'rejected' };
  }

  // Clean retry — served and logged 'answered' like any clean first pass.
  await logExchange(request.userId, question, retryReply, 'answered', null);
  return { reply: retryReply, outcome: 'answered' };
}

// ─── The model call (one place, first pass and retry alike) ────────────────

async function callModel(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE.HELP_CHAT_MODEL, // CB-S ruling 4: the shared Help chat seat
    max_tokens: 12000,
    system: systemPrompt,
    messages,
  });
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }
  return text.trim();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
