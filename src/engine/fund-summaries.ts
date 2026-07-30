/**
 * FundLens v6 — Fund Summary Generator
 *
 * Generates short, natural-language fund summaries using the same
 * editorial voice as the Investment Brief. Called during the pipeline
 * after scoring is complete. Each fund gets a 2-3 sentence summary
 * that explains why it scored the way it did using plain data (expense
 * ratios, company names, returns, sector exposure) — never model
 * internals (factor names, scores, z-scores, tiers).
 *
 * Uses Claude Haiku for speed — one batched call for all funds.
 *
 * Session 12 deliverable. Destination: src/engine/fund-summaries.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from './constants.js';
import type { FundCompositeScore } from './scoring.js';
import type { FundRow } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FundSummaryMap {
  [ticker: string]: string;
}

// ─── Voice prompt (condensed from editorial-policy.md) ──────────────────────

const VOICE_PROMPT = `You write with calm, direct authority. Not warm, not sales-y — just clear and specific. Every sentence does work.

CRITICAL RULES:
- NEVER mention factor names (Cost Efficiency, Holdings Quality, Momentum, Positioning)
- NEVER mention scores, z-scores, tiers, percentiles, rankings, or model internals
- NEVER say "our model", "the algorithm", "scoring system"
- USE actual data: expense ratios, company names, return numbers, sector exposure
- Keep each summary to 2-3 sentences max
- Use "you" and "your" naturally — this is their money
- No filler, no warm-up, no hedging. State the case.

MAIN STREET REGISTER (mandatory — A5 Task 5, ratified July 5, 2026):
- Write for a smart coworker who does not work in finance.
- Dollars, not basis points: "costs about $45 a year on a $10,000 balance," never "0.45%" alone when a dollar figure lands harder — and never "45bps."
- "What your money owns," not "portfolio exposure."
- If a term would send a normal person to Google — duration, overweight, cyclical, headwind — either drop it or explain it in the same breath, once.
- Short sentences. Concrete nouns: company names, dollar amounts, plain verbs.
- Never apologize for data and never dress it up. Say what is known, what is estimated, and what it costs.

GOOD: "At about $3 a year on a $10,000 balance, this is one of the cheapest options in your lineup. It holds Apple, Microsoft, NVIDIA — up 12% over six months."
BAD: "This fund scores 87/100 on Cost Efficiency with a Holdings Quality score of 83."`;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate natural-language summaries for all scored funds.
 * One batched Haiku call — returns a map of ticker → summary string.
 */
export async function generateFundSummaries(
  scoredFunds: FundCompositeScore[],
  fundRows: FundRow[],
): Promise<FundSummaryMap> {
  const fundRowMap = new Map(fundRows.map(f => [f.ticker, f]));
  const summaries: FundSummaryMap = {};

  // Build fund data blocks for the prompt
  const fundBlocks = scoredFunds.map(f => {
    const row = fundRowMap.get(f.ticker);
    const details = f.factorDetails;
    const lines: string[] = [];

    lines.push(`## ${row?.name || f.ticker} (${f.ticker})`);

    // Expense ratio
    if (details.costEfficiency?.expenseRatio != null) {
      lines.push(`- Expense ratio: ${(details.costEfficiency.expenseRatio * 100).toFixed(2)}%`);
    }

    // Holdings quality — mention top holdings if available
    if (details.holdingsQuality?.holdingScores?.length > 0) {
      const topHoldings = details.holdingsQuality.holdingScores
        .slice(0, 5)
        .map(h => h.name || h.ticker || 'Unknown')
        .join(', ');
      lines.push(`- Top holdings: ${topHoldings}`);
      lines.push(`- Coverage: ${(details.holdingsQuality.coveragePct * 100).toFixed(0)}% of fund weight scored`);
    }

    // Momentum — returns
    if (details.momentum?.returns) {
      const ret = details.momentum.returns;
      const retParts: string[] = [];
      if (ret.threeMonth != null) retParts.push(`3-mo: ${(ret.threeMonth * 100).toFixed(1)}%`);
      if (ret.sixMonth != null) retParts.push(`6-mo: ${(ret.sixMonth * 100).toFixed(1)}%`);
      if (ret.twelveMonth != null) retParts.push(`12-mo: ${(ret.twelveMonth * 100).toFixed(1)}%`);
      if (retParts.length > 0) lines.push(`- Returns: ${retParts.join(', ')}`);
    }

    // Sector exposure
    if (details.sectorExposure) {
      const top3 = Object.entries(details.sectorExposure)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s, w]) => `${s} ${(w * 100).toFixed(0)}%`);
      if (top3.length > 0) lines.push(`- Top sectors: ${top3.join(', ')}`);
    }

    // Positioning reasoning (raw, for context)
    if (details.positioning?.reasoning) {
      lines.push(`- Macro alignment: ${details.positioning.reasoning}`);
    }

    return lines.join('\n');
  });

  const userPrompt = `Write a 2-3 sentence summary for each of the following funds. Return them in this exact format — one block per fund, no extra text:

TICKER: summary text here

${fundBlocks.join('\n\n')}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('[fund-summaries] No ANTHROPIC_API_KEY — skipping summaries');
      return summaries;
    }
    const client = new Anthropic({ apiKey });
    // A5 Task 5: user-facing prose moves off Haiku onto PROSE_MODEL
    // (Sonnet 5) — a voice AND quality upgrade. Thinking is on by default
    // there and counts against max_tokens; ceiling raised 4096 -> 12000 so
    // 22 summaries can never silently truncate. Only text blocks are read
    // below, so thinking output cannot leak into what users see.
    const response = await client.messages.create({
      model: CLAUDE.PROSE_MODEL,
      max_tokens: 12000,
      system: VOICE_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }

    // Parse "TICKER: summary" blocks
    const lines = text.split('\n');
    let currentTicker = '';
    let currentSummary = '';

    for (const line of lines) {
      const match = line.match(/^([A-Z]{2,6}):\s*(.+)/);
      if (match) {
        // Save previous
        if (currentTicker && currentSummary) {
          summaries[currentTicker] = currentSummary.trim();
        }
        currentTicker = match[1];
        currentSummary = match[2];
      } else if (currentTicker && line.trim()) {
        // Continuation line
        currentSummary += ' ' + line.trim();
      }
    }
    // Save last
    if (currentTicker && currentSummary) {
      summaries[currentTicker] = currentSummary.trim();
    }

    console.log(`[fund-summaries] Generated summaries for ${Object.keys(summaries).length} funds`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fund-summaries] Claude API error: ${msg}`);
    // Non-fatal — return empty summaries, UI will just not show them
  }

  return summaries;
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERENCE SUMMARIES (B-series B7) — neutral, describe-never-evaluate
// ═══════════════════════════════════════════════════════════════════════════
// Everything below is additive (B7 c3). The editorial machinery above is
// untouched. These summaries are drafts for Robert's review, stored in the
// reference_summaries table by the admin-only generate route (routes.ts),
// and served to reference accounts only while the B7 feature flag
// (constants.ts) is true.

// ─── Banned vocabulary (plan §B7) ───────────────────────────────────────────
// Evaluative words that must never appear in a reference summary. The
// post-check below rejects any summary containing one of these as a
// whole-word stem (the word plus any trailing word characters, so
// "recommended" trips "recommend" and "topped" trips "top"). Overmatching
// is accepted by design — a rejected summary costs one re-click, a leaked
// evaluative word costs trust.
export const BANNED_VOCABULARY = [
  'cheap', 'expensive', 'strong', 'weak', 'good', 'bad', 'best', 'worst',
  'attractive', 'opportunity', 'avoid', 'top', 'laggard', 'winner',
  'should', 'recommend',
] as const;

// ─── Neutral voice prompt ───────────────────────────────────────────────────

const NEUTRAL_VOICE_PROMPT = `You write short, strictly NEUTRAL fund descriptions. Register: describe, never evaluate. You state only names, numbers, category, and what the fund holds. No judgment, no comparison, no advice — a reader must not be able to tell whether you think a fund is desirable.

MAIN STREET LANGUAGE (mandatory):
- Write for a smart coworker who does not work in finance.
- Put dollar figures alongside percents: "an expense ratio of 0.45%, about $45 a year on a $10,000 balance."
- Short sentences. Concrete nouns: company names, dollar amounts, plain verbs.
- If a term would send a normal person to Google, drop it or explain it in the same breath, once.

BANNED WORDS (never use these, in ANY form or inflection — no "cheaper", no "strongest", no "recommended", no "topped"):
cheap, expensive, strong, weak, good, bad, best, worst, attractive, opportunity, avoid, top, laggard, winner, should, recommend

NEUTRAL SUBSTITUTES (use these instead):
- "largest holdings" — never "top holdings"
- "consumer products" — never "consumer goods"
- State returns as plain figures: "up 4.2% over six months" — never characterize them.

NO ADVICE VERBS. Never tell the reader to do, consider, weigh, or watch anything.

SPARSE DATA RULE: if a fund's data block carries only its name and expense ratio, write what is known — what kind of fund it is and what it costs — and nothing more. Never pad, never speculate.`;

// ─── Post-check: banned-vocabulary rejection ────────────────────────────────

/**
 * Test one summary against the banned list, case-insensitively, as
 * whole-word stems: word boundary, the banned word, then any trailing word
 * characters (\\w*), so inflections match. Returns the first banned word
 * matched, or null if the summary is clean. Exported so the rejection
 * mechanism can be proven standalone (B7 scratch proof) before it ever
 * meets real output.
 */
export function findBannedWord(summary: string): string | null {
  for (const word of BANNED_VOCABULARY) {
    const pattern = new RegExp(`\\b${word}\\w*`, 'i');
    if (pattern.test(summary)) return word;
  }
  return null;
}

// ─── Reference summary generation ───────────────────────────────────────────

/** Input: database row shapes — this runs outside a pipeline (B7 c3). */
export interface ReferenceSummaryInput {
  ticker: string;
  name: string;
  expense_ratio: number | null;
  factor_details: Record<string, unknown>;
}

export interface ReferenceSummaryResult {
  /** ticker → summary text, post-check passed */
  summaries: FundSummaryMap;
  /** summaries the post-check rejected — never enter `summaries` */
  rejected: Array<{ ticker: string; word: string }>;
}

// Defensive guards — factor_details is raw database JSON.
function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * Generate neutral reference summaries for the given funds.
 *
 * One batched call on CLAUDE.PROSE_MODEL (sequential-with-delays law does
 * not arise — there is exactly one call). Each fund's factual block is
 * built from ONLY: expense ratio; largest-holding names from
 * factor_details.holdingsQuality.holdingScores (up to five); the top three
 * sector exposures; trailing returns from factor_details.momentum.returns.
 * NEVER the positioning reasoning — it is evaluative and stays out.
 *
 * Every parsed summary passes through findBannedWord; matches land in
 * `rejected` and never in `summaries`.
 */
export async function generateReferenceSummaries(
  rows: ReferenceSummaryInput[],
): Promise<ReferenceSummaryResult> {
  const result: ReferenceSummaryResult = { summaries: {}, rejected: [] };

  const fundBlocks = rows.map(row => {
    const details = asObj(row.factor_details) ?? {};
    const lines: string[] = [];

    lines.push(`## ${row.name} (${row.ticker})`);

    if (row.expense_ratio != null) {
      lines.push(`- Expense ratio: ${(row.expense_ratio * 100).toFixed(2)}%`);
    }

    // Largest holdings — names only, up to five
    const hq = asObj(details.holdingsQuality);
    const holdingScores = hq && Array.isArray(hq.holdingScores) ? hq.holdingScores : [];
    const largest = holdingScores
      .slice(0, 5)
      .map(h => {
        const holding = asObj(h);
        const name = holding && typeof holding.name === 'string' ? holding.name : null;
        const ticker = holding && typeof holding.ticker === 'string' ? holding.ticker : null;
        return name || ticker;
      })
      .filter((n): n is string => n !== null);
    if (largest.length > 0) {
      lines.push(`- Largest holdings: ${largest.join(', ')}`);
    }

    // Top three sector exposures
    const sectors = asObj(details.sectorExposure);
    if (sectors) {
      const top3 = Object.entries(sectors)
        .map(([s, w]) => [s, asNum(w)] as const)
        .filter((e): e is readonly [string, number] => e[1] !== null)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s, w]) => `${s} ${(w * 100).toFixed(0)}%`);
      if (top3.length > 0) lines.push(`- Largest sector exposures: ${top3.join(', ')}`);
    }

    // Trailing returns — figures only
    const momentum = asObj(details.momentum);
    const returns = momentum ? asObj(momentum.returns) : null;
    if (returns) {
      const retParts: string[] = [];
      const threeMonth = asNum(returns.threeMonth);
      const sixMonth = asNum(returns.sixMonth);
      const twelveMonth = asNum(returns.twelveMonth);
      if (threeMonth != null) retParts.push(`3-mo: ${(threeMonth * 100).toFixed(1)}%`);
      if (sixMonth != null) retParts.push(`6-mo: ${(sixMonth * 100).toFixed(1)}%`);
      if (twelveMonth != null) retParts.push(`12-mo: ${(twelveMonth * 100).toFixed(1)}%`);
      if (retParts.length > 0) lines.push(`- Returns: ${retParts.join(', ')}`);
    }

    // NEVER: details.positioning.reasoning — evaluative, stays out.

    return lines.join('\n');
  });

  const userPrompt = `Write a 2-3 sentence NEUTRAL description for each of the following funds. Return them in this exact format — one block per fund, no extra text:

TICKER: description text here

${fundBlocks.join('\n\n')}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('[fund-summaries] No ANTHROPIC_API_KEY — skipping reference summaries');
      return result;
    }
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE.PROSE_MODEL,
      max_tokens: 12000,
      system: NEUTRAL_VOICE_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }

    // Parse "TICKER: summary" blocks — same format as generateFundSummaries
    const parsed: FundSummaryMap = {};
    const lines = text.split('\n');
    let currentTicker = '';
    let currentSummary = '';

    for (const line of lines) {
      const match = line.match(/^([A-Z]{2,6}):\s*(.+)/);
      if (match) {
        if (currentTicker && currentSummary) {
          parsed[currentTicker] = currentSummary.trim();
        }
        currentTicker = match[1];
        currentSummary = match[2];
      } else if (currentTicker && line.trim()) {
        currentSummary += ' ' + line.trim();
      }
    }
    if (currentTicker && currentSummary) {
      parsed[currentTicker] = currentSummary.trim();
    }

    // Post-check: banned-vocabulary rejection. A rejected summary never
    // appears in summaries — the caller leaves any existing row untouched.
    for (const [ticker, summary] of Object.entries(parsed)) {
      const word = findBannedWord(summary);
      if (word !== null) {
        result.rejected.push({ ticker, word });
      } else {
        result.summaries[ticker] = summary;
      }
    }

    console.log(
      `[fund-summaries] Reference summaries: ${Object.keys(result.summaries).length} accepted, ` +
      `${result.rejected.length} rejected by banned-vocabulary check`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fund-summaries] Claude API error (reference summaries): ${msg}`);
    // Non-fatal — return what we have; the generate route reports counts
  }

  return result;
}
