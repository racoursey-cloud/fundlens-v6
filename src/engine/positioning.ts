/**
 * FundLens v6 — Positioning Factor
 *
 * Scores how well a fund's sector exposure aligns with the current
 * macro thesis. This is FundLens's unique differentiator — a forward-looking,
 * AI-driven factor that no other 401(k) tool provides.
 *
 * Scoring approach:
 *   1. Get the fund's sector breakdown (from holdings + Claude Haiku classification)
 *   2. Get the macro thesis sector preferences (from thesis.ts)
 *   3. For each sector the fund holds:
 *      score = holding_weight × sector_preference_score
 *   4. Sum across all sectors → fund positioning score
 *
 * A fund that's heavy in sectors the thesis favors scores high.
 * A fund that's heavy in disfavored sectors scores low.
 * A diversified fund with even exposure scores near the middle.
 *
 * Weight: 25% of composite (DEFAULT_FACTOR_WEIGHTS.positioning)
 *
 * Session 4 deliverable. References: Master Reference §4 (Positioning), §8 step 12.
 */

import { SectorPreference, MacroThesis } from './thesis.js';
import { ResolvedHolding } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Positioning score for a single fund */
export interface PositioningResult {
  /** Fund-level positioning score (0–100) */
  score: number;
  /** Per-sector breakdown showing contribution to the score */
  sectorBreakdown: SectorContribution[];
  /** Human-readable summary */
  reasoning: string;
}

/** How one sector contributes to the fund's positioning score */
export interface SectorContribution {
  sector: string;
  /** Fund's weight in this sector (0.0–1.0) */
  fundWeight: number;
  /** Thesis preference for this sector (-2 to +2) */
  thesisPreference: number;
  /** Contribution to positioning score (weight × normalized preference) */
  contribution: number;
  /** Whether this is a positive or negative contributor */
  alignment: 'favorable' | 'neutral' | 'unfavorable';
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Score a fund's positioning based on its sector exposure and the macro thesis.
 *
 * @param holdings Fund holdings with sector classifications
 * @param thesis Current macro thesis with sector preferences
 */
export function scorePositioning(
  holdings: ResolvedHolding[],
  thesis: MacroThesis
): PositioningResult {
  // Build a map of sector preferences for fast lookup
  const prefMap = new Map<string, SectorPreference>();
  for (const sp of thesis.sectorPreferences) {
    prefMap.set(sp.sector.toLowerCase(), sp);
  }

  // Calculate the fund's sector weights from its holdings
  const sectorWeights = calculateSectorWeights(holdings);

  // Score each sector's contribution
  const sectorBreakdown: SectorContribution[] = [];
  let rawScore = 0;
  let totalWeight = 0;

  for (const [sector, weight] of sectorWeights) {
    const pref = prefMap.get(sector.toLowerCase());
    const preference = pref?.preference ?? 0;

    // Normalize preference from [-2, +2] to [0, 1] scale
    // -2 → 0.0, -1 → 0.25, 0 → 0.5, +1 → 0.75, +2 → 1.0
    const normalizedPref = (preference + 2) / 4;

    const contribution = weight * normalizedPref;
    rawScore += contribution;
    totalWeight += weight;

    let alignment: SectorContribution['alignment'] = 'neutral';
    if (preference >= 1) alignment = 'favorable';
    else if (preference <= -1) alignment = 'unfavorable';

    sectorBreakdown.push({
      sector,
      fundWeight: weight,
      thesisPreference: preference,
      contribution,
      alignment,
    });
  }

  // Convert raw score to 0–100 scale
  // If all holdings are in +2 sectors → rawScore/totalWeight = 1.0 → score 100
  // If all holdings are in -2 sectors → rawScore/totalWeight = 0.0 → score 0
  // Mixed → somewhere in between
  const normalizedScore = totalWeight > 0 ? rawScore / totalWeight : 0.5;
  const score = Math.round(normalizedScore * 100);

  // Sort breakdown by contribution (biggest impact first)
  sectorBreakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Build reasoning string
  const favorable = sectorBreakdown.filter(s => s.alignment === 'favorable');
  const unfavorable = sectorBreakdown.filter(s => s.alignment === 'unfavorable');

  let reasoning = `Positioning: ${score}/100. `;
  if (favorable.length > 0) {
    const favNames = favorable.slice(0, 3).map(s => s.sector).join(', ');
    const favWeight = favorable.reduce((sum, s) => sum + s.fundWeight, 0);
    reasoning += `${(favWeight * 100).toFixed(0)}% of fund in thesis-favorable sectors (${favNames}). `;
  }
  if (unfavorable.length > 0) {
    const unfavNames = unfavorable.slice(0, 3).map(s => s.sector).join(', ');
    const unfavWeight = unfavorable.reduce((sum, s) => sum + s.fundWeight, 0);
    reasoning += `${(unfavWeight * 100).toFixed(0)}% in unfavorable sectors (${unfavNames}).`;
  }
  if (favorable.length === 0 && unfavorable.length === 0) {
    reasoning += 'Fund exposure is mostly in thesis-neutral sectors.';
  }

  return { score, sectorBreakdown, reasoning };
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Calculate the fund's sector allocation from its holdings.
 * Returns a Map of sector name → weight (0.0–1.0).
 *
 * Holdings without a sector classification are grouped as "Unclassified".
 * Their weight counts toward the total but doesn't contribute to the
 * positioning score (effectively neutral).
 */
function calculateSectorWeights(
  holdings: ResolvedHolding[]
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const h of holdings) {
    const sector = h.sector || 'Unclassified';
    const current = weights.get(sector) || 0;
    weights.set(sector, current + h.pctOfNav);
  }

  return weights;
}
