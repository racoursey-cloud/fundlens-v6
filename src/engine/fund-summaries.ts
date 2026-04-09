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

GOOD: "At 0.03% annually, this is one of the cheapest options in your lineup. It holds Apple, Microsoft, NVIDIA — up 12% over six months."
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
    const response = await client.messages.create({
      model: CLAUDE.CLASSIFICATION_MODEL, // Haiku — fast + cheap
      max_tokens: 4096,
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
