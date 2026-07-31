/**
 * FundLens — Reference Translations (B-series B9 c4)
 *
 * Generates the plain-English "Translation" section of the reference
 * About box: our voice, clearly labeled in the UI, explaining the fund's
 * own SEC-filed language. The conduit principle governs (B9 §1 ruling 1):
 * we never change their data and only help explain it — translate the
 * legal language into plain English; explain, never evaluate.
 *
 * Storage: fund_descriptions.translation_text / translation_generated_at /
 * translation_model — written ONLY here, invoked only by the admin-only
 * generate route (routes.ts, B9 c5). The nightly pipeline never writes
 * descriptions or translations. Serving is separately gated by
 * REFERENCE_TRANSLATIONS_ENABLED (constants.ts, ships false), so
 * generating drafts stores them without serving a word of AI text.
 *
 * Claude law: one call per fund, strictly sequential, CLAUDE.CALL_DELAY_MS
 * (1.2s) between calls — never in parallel. B7's banned-vocabulary list is
 * enforced in the prompt AND post-checked in code: a hit rejects the write
 * for that fund, leaving any existing translation untouched.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from './constants.js';
import { BANNED_VOCABULARY, findBannedWord } from './fund-summaries.js';
import { supaSelect, supaUpdate } from './supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TranslationRunResult {
  /** Funds whose translation was generated and stored this run */
  generated: string[];
  /** Funds whose draft hit the banned-vocabulary check — nothing written */
  rejected: Array<{ ticker: string; word: string }>;
  /** Funds skipped (no fund_descriptions row, or the Claude call failed) */
  skipped: Array<{ ticker: string; reason: string }>;
  /** Active funds considered */
  total: number;
}

interface DescriptionRow {
  fund_id: string;
  objective_text: string;
  strategies_text: string;
}

// ─── The neutral register prompt ────────────────────────────────────────────

const TRANSLATION_PROMPT = `You translate the legal language of a mutual fund's SEC-filed Investment Objective and Principal Investment Strategies into plain English. Explain, never evaluate. You are a conduit: you help a reader understand what the fund's own words mean — you never judge the fund, compare it to anything, or advise the reader.

RULES:
- Plain English for a smart coworker who does not work in finance. Short sentences. Concrete nouns.
- Explain what the fund's filed words MEAN — what it invests in, how it decides, what its stated goal is. Nothing the filing does not say.
- If the filing uses a term of art (duration, derivatives, below investment grade), explain it in the same breath, once.
- Dollar figures alongside percents where they help ("0.45% is about $45 a year on a $10,000 balance").
- No judgment, no comparison, no advice verbs. Never tell the reader to do, consider, or watch anything.

BANNED WORDS (never use these, in ANY form or inflection — no "cheaper", no "strongest", no "recommended", no "topped"):
${BANNED_VOCABULARY.join(', ')}

Write one compact translation (a short paragraph or two, under 200 words) covering both the objective and the strategies. Return ONLY the translation text — no heading, no preamble.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── The run ────────────────────────────────────────────────────────────────

/**
 * Generate translations for every active fund that has a stored
 * fund_descriptions row. Sequential with 1.2s delays; per-fund failures
 * never abort the batch. Returns per-fund outcomes for the route response.
 */
export async function generateReferenceTranslations(): Promise<TranslationRunResult> {
  const result: TranslationRunResult = {
    generated: [],
    rejected: [],
    skipped: [],
    total: 0,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[translations] No ANTHROPIC_API_KEY — skipping translation run');
    return result;
  }

  const { data: funds, error: fundsError } = await supaSelect<Array<{ id: string; ticker: string }>>(
    'funds',
    { is_active: 'eq.true', select: 'id,ticker', order: 'ticker.asc' },
  );
  if (fundsError || !funds) {
    console.error('[translations] Failed to fetch active funds:', fundsError);
    return result;
  }
  result.total = funds.length;

  const { data: descRows, error: descError } = await supaSelect<DescriptionRow[]>(
    'fund_descriptions',
    { select: 'fund_id,objective_text,strategies_text' },
  );
  if (descError || !descRows) {
    console.error('[translations] Failed to fetch fund_descriptions:', descError);
    return result;
  }
  const descByFund = new Map(descRows.map(d => [d.fund_id, d]));

  const client = new Anthropic({ apiKey });

  // Sequential by law — one fund at a time, 1.2s between calls.
  for (let i = 0; i < funds.length; i++) {
    const fund = funds[i];
    const desc = descByFund.get(fund.id);
    if (!desc) {
      result.skipped.push({ ticker: fund.ticker, reason: 'no stored description' });
      continue;
    }

    if (i > 0) await delay(CLAUDE.CALL_DELAY_MS);

    const userPrompt = `Fund: ${fund.ticker}

INVESTMENT OBJECTIVE (verbatim from the SEC filing):
${desc.objective_text}

PRINCIPAL INVESTMENT STRATEGIES (verbatim from the SEC filing):
${desc.strategies_text}

Translate into plain English per your rules.`;

    let text = '';
    try {
      const response = await client.messages.create({
        model: CLAUDE.PROSE_MODEL,
        max_tokens: 12000,
        system: TRANSLATION_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      text = text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[translations] Claude API error for ${fund.ticker}: ${msg}`);
      result.skipped.push({ ticker: fund.ticker, reason: 'Claude call failed' });
      continue;
    }

    if (!text) {
      result.skipped.push({ ticker: fund.ticker, reason: 'empty response' });
      continue;
    }

    // Post-check: B7's banned-vocabulary rejection — a hit writes nothing,
    // so any previously stored translation stands (last good stands).
    const word = findBannedWord(text);
    if (word !== null) {
      result.rejected.push({ ticker: fund.ticker, word });
      continue;
    }

    const { error: updateError } = await supaUpdate(
      'fund_descriptions',
      {
        translation_text: text,
        translation_generated_at: new Date().toISOString(),
        translation_model: CLAUDE.PROSE_MODEL,
      },
      { fund_id: `eq.${fund.id}` },
    );
    if (updateError) {
      console.error(`[translations] Write failed for ${fund.ticker}:`, updateError);
      result.skipped.push({ ticker: fund.ticker, reason: 'database write failed' });
    } else {
      result.generated.push(fund.ticker);
    }
  }

  console.log(
    `[translations] Run complete: ${result.generated.length} generated, ` +
    `${result.rejected.length} rejected, ${result.skipped.length} skipped, ` +
    `${result.total} active funds`
  );
  return result;
}
