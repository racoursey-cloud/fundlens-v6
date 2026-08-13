/**
 * FundLens v6 — Help Agent
 *
 * Configurable chat agent on the shared Help chat seat
 * (CLAUDE.HELP_CHAT_MODEL — Opus since CB-S ruling 4, August 1, 2026).
 * The admin defines the agent's scope and personality via a prompt file.
 * This module loads the prompt, manages conversation context, and streams
 * responses.
 *
 * Designed to be project-agnostic — swap the prompt file and the agent
 * works for any product (FundLens, football project, etc.).
 *
 * Session 12 deliverable. Destination: src/engine/help-agent.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CLAUDE } from './constants.js';
import { alertClaudeApiFailure } from './admin-alert.js';
import { supaFetch, supaSelect } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CB-S s5: the seat is named once at startup so every deploy's log states
// which model answers the full-tier Help chat.
console.log(`[help-agent] Help chat seat: ${CLAUDE.HELP_CHAT_MODEL}`);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface HelpChatRequest {
  message: string;
  history?: HelpMessage[];
}

export interface HelpChatResponse {
  reply: string;
}

// ─── Prompt Loading ─────────────────────────────────────────────────────────

let cachedPrompt: string | null = null;

/**
 * Load the help agent system prompt from the prompt file.
 * Searches multiple locations to handle both dev and production builds.
 * The admin can edit this file to change the agent's scope.
 */
function loadHelpPrompt(): string {
  if (cachedPrompt) return cachedPrompt;

  const candidates = [
    join(__dirname, '../prompts/help-agent.md'),
    join(__dirname, '../../src/prompts/help-agent.md'),
    join(process.cwd(), 'src/prompts/help-agent.md'),
  ];

  for (const p of candidates) {
    try {
      cachedPrompt = readFileSync(p, 'utf-8');
      console.log(`[help-agent] Loaded prompt from ${p}`);
      return cachedPrompt;
    } catch {
      // Try next candidate
    }
  }

  // Fallback — minimal prompt
  console.warn('[help-agent] Could not load help-agent.md, using fallback');
  cachedPrompt = 'You are a helpful assistant. Answer questions concisely and clearly.';
  return cachedPrompt;
}

/**
 * Clear the cached prompt — useful if the admin updates the file at runtime.
 */
export function reloadHelpPrompt(): void {
  cachedPrompt = null;
  loadHelpPrompt();
}

// ─── Grounding (U1-A t10) ───────────────────────────────────────────────────
// U1 ruling 1: "MINIMAL grounding investment — existing fund data + scoring
// outputs." Robert's August 13, 2026 ruling made that literal — the chat is
// fed the live numbers rather than left describing the app in the abstract.
//
// Deliberately minimal: two reads of tables the scores API already serves,
// no new table, no new column, no pipeline work, no Claude call. The digest
// is rebuilt per question so it can never go stale, and it is assembled
// BEFORE the single Claude call below — the sequential-call law is untouched.
//
// Scope of what is included: exactly the figures a full-tier account already
// sees in the app (composite, the four factor scores, tier, expense ratio,
// trailing 12-month return). The z-scores and factor weights the prompt file
// forbids the agent to discuss are not fetched into it at all. This surface
// is requireFullTier — the reference fence is not in play here.

interface GroundingScoreRow {
  composite_default: number | null;
  cost_efficiency: number | null;
  holdings_quality: number | null;
  positioning: number | null;
  momentum: number | null;
  tier: string | null;
  factor_details: Record<string, unknown> | null;
  funds?: { ticker: string; name: string; expense_ratio: number | null } | null;
}

/** "0.04%" from a decimal expense ratio; an em dash when absent */
function fmtDecimalAsPct(value: unknown, digits: number): string {
  return typeof value === 'number' && isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';
}

/** "72" from a 0–100 score; an em dash when absent */
function fmtScore(value: number | null | undefined): string {
  return typeof value === 'number' && isFinite(value) ? value.toFixed(0) : '—';
}

/** The fund's trailing 12-month return, dug out of the score's detail blob */
function twelveMonthReturn(details: Record<string, unknown> | null): unknown {
  if (!details) return null;
  const momentum = details.momentum;
  if (momentum === null || typeof momentum !== 'object' || Array.isArray(momentum)) return null;
  const returns = (momentum as Record<string, unknown>).returns;
  if (returns === null || typeof returns !== 'object' || Array.isArray(returns)) return null;
  return (returns as Record<string, unknown>).twelveMonth;
}

/**
 * Build the live plan-data section appended to the system prompt.
 *
 * Returns an empty string on any failure — a chat that can still explain the
 * app is better than no chat, and the agent is told below to decline any
 * figure it has not been given rather than estimate one.
 */
async function buildFundGrounding(): Promise<string> {
  try {
    const { data: latestRun } = await supaFetch<{ id: string; completed_at: string | null }>(
      'pipeline_runs',
      {
        params: { status: 'eq.completed', order: 'completed_at.desc', limit: '1' },
        single: true,
      },
    );

    if (!latestRun) return '';

    const { data: scores } = await supaSelect<GroundingScoreRow[]>('fund_scores', {
      pipeline_run_id: `eq.${latestRun.id}`,
      select: '*, funds(ticker, name, expense_ratio)',
      order: 'composite_default.desc',
    });

    const rows = (scores || []).filter(row => row.funds);
    if (rows.length === 0) return '';

    const lines = rows.map(row => {
      const f = row.funds!;
      return [
        `${f.ticker} — ${f.name}`,
        `expense ${fmtDecimalAsPct(f.expense_ratio, 2)}`,
        `score ${fmtScore(row.composite_default)}${row.tier ? ` (${row.tier})` : ''}`,
        `cost ${fmtScore(row.cost_efficiency)}, quality ${fmtScore(row.holdings_quality)}, positioning ${fmtScore(row.positioning)}, momentum ${fmtScore(row.momentum)}`,
        `12-month return ${fmtDecimalAsPct(twelveMonthReturn(row.factor_details), 1)}`,
      ].join(' | ');
    });

    const asOf = latestRun.completed_at ? latestRun.completed_at.slice(0, 10) : 'an earlier date';

    return [
      '---',
      '',
      '## The plan right now (live data, not memorized)',
      '',
      `These are the ${rows.length} funds in the plan as of the scoring run completed ${asOf}.`,
      'Scores run 0–100 and are RELATIVE to the other funds in this plan, never absolute judgments.',
      '',
      ...lines,
      '',
      'Use these figures when the question is about a specific fund or a comparison between funds.',
      'If a question needs a number that is not in this list, say plainly that you do not have it.',
      'Never estimate, interpolate, or recall a figure from anywhere else — a wrong number here is worse than no answer.',
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[help-agent] Could not build fund grounding: ${msg}`);
    return '';
  }
}

// ─── Chat API ───────────────────────────────────────────────────────────────

/**
 * Send a message to the help agent and get a response.
 *
 * @param request The user's message and optional conversation history
 * @returns The agent's reply
 */
export async function helpChat(request: HelpChatRequest): Promise<HelpChatResponse> {
  const promptFile = loadHelpPrompt();
  const grounding = await buildFundGrounding();
  const systemPrompt = grounding ? `${promptFile}\n\n${grounding}\n` : promptFile;

  // Build message history for context
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (request.history) {
    for (const msg of request.history.slice(-10)) { // Keep last 10 messages for context
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current message
  messages.push({ role: 'user', content: request.message });

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: CLAUDE.HELP_CHAT_MODEL, // CB-S ruling 4: the shared Help chat seat
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    let reply = '';
    for (const block of response.content) {
      if (block.type === 'text') reply += block.text;
    }

    return { reply: reply || "I'm not sure how to help with that. Could you rephrase?" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[help-agent] Claude API error: ${msg}`);
    // A2 Task 3 (Principle 1): failures must be loud — email Robert,
    // rate-limited to one alert per error type per 24 hours.
    alertClaudeApiFailure('Help chat', msg).catch(() => {});
    return { reply: "I'm having trouble connecting right now. Please try again in a moment." };
  }
}
