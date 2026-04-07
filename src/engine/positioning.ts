/**
 * FundLens v6 — Positioning Factor (§2.6.3)
 *
 * Scores how well a fund's sector exposure aligns with the current
 * macro thesis. This is FundLens's unique differentiator — a forward-looking,
 * AI-informed factor that no other 401(k) tool provides.
 *
 * Scoring approach (§2.6.3 — pure math, no Claude call):
 *   1. Get the fund's sector breakdown (from holdings + Claude Haiku classification)
 *   2. Get the macro thesis sector scores (1.0–10.0, from thesis.ts)
 *   3. For each sector the fund holds:
 *      normalized_pref = (thesis_sector_score - 1) / 9    // maps 1–10 → 0–1
 *      contribution = fund_sector_weight × normalized_pref
 *   4. positioning_score = (Σ contributions / Σ fund_sector_weights) × 100
 *
 * A fund heavy in sectors the thesis favors scores high.
 * A fund heavy in disfavored sectors scores low.
 * A diversified fund with even exposure scores near the middle.
 *
 * Session 6: Fixed normalization from (pref+2)/4 to (score-1)/9 per spec §2.6.3.
 * Changed from -2/+2 integer scale to 1.0–10.0 continuous scale.
 *
 * Weight: 20% of composite (DEFAULT_FACTOR_WEIGHTS.positioning)
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
  /** Fund's weight in this sector (as pctOfNav, whole-percent units) */
  fundWeight: number;
  /** Thesis score for this sector (1.0–10.0) */
  thesisScore: number;
  /** Normalized thesis preference (0.0–1.0): (score - 1) / 9 */
  normalizedPref: number;
  /** Contribution to positioning score (weight × normalized preference) */
  contribution: number;
  /** Whether this is a positive or negative contributor */
  alignment: 'favorable' | 'neutral' | 'unfavorable';
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Score a fund's positioning based on its sector exposure and the macro thesis.
 * Pure math — no Claude call (§2.6.3).
 *
 * @param holdings Fund holdings with sector classifications
 * @param thesis Current macro thesis with sector scores (1.0–10.0)
 */
export function scorePositioning(
  holdings: ResolvedHolding[],
  thesis: MacroThesis
): PositioningResult {
  // Build a map of sector scores for fast lookup
  const scoreMap = new Map<string, SectorPreference>();
  for (const sp of thesis.sectorPreferences) {
    scoreMap.set(sp.sector.toLowerCase(), sp);
  }

  // Calculate the fund's sector weights from its holdings
  const sectorWeights = calculateSectorWeights(holdings);

  // Score each sector's contribution (§2.6.3)
  const sectorBreakdown: SectorContribution[] = [];
  let rawScore = 0;
  let totalWeight = 0;

  for (const [sector, weight] of sectorWeights) {
    // Skip unclassified holdings — they count toward denominator
    // but contribute a neutral 0.5 to the numerator (§2.6.3)
    if (sector === 'Unclassified') {
      rawScore += weight * 0.5;  // neutral contribution
      totalWeight += weight;
      sectorBreakdown.push({
        sector,
        fundWeight: weight,
        thesisScore: 5.0,
        normalizedPref: 0.5,
        contribution: weight * 0.5,
        alignment: 'neutral',
      });
      continue;
    }

    const pref = scoreMap.get(sector.toLowerCase());
    // Sectors present in fund but absent from thesis default to 5.0 (§2.6.3)
    const thesisScore = pref?.score ?? 5.0;

    // Normalize from 1.0–10.0 to 0.0–1.0 (§2.6.3)
    // This is the key formula: (score - 1) / 9
    const normalizedPref = (thesisScore - 1) / 9;

    const contribution = weight * normalizedPref;
    rawScore += contribution;
    totalWeight += weight;

    // Classify alignment based on thesis score
    let alignment: SectorContribution['alignment'] = 'neutral';
    if (thesisScore >= 7.0) alignment = 'favorable';
    else if (thesisScore <= 4.0) alignment = 'unfavorable';

    sectorBreakdown.push({
      sector,
      fundWeight: weight,
      thesisScore,
      normalizedPref,
      contribution,
      alignment,
    });
  }

  // Convert raw score to 0–100 scale (§2.6.3)
  // positioning_score = (Σ contributions / Σ fund_sector_weights) × 100
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
    reasoning += `${favWeight.toFixed(0)}% in thesis-favorable sectors (${favNames}). `;
  }
  if (unfavorable.length > 0) {
    const unfavNames = unfavorable.slice(0, 3).map(s => s.sector).join(', ');
    const unfavWeight = unfavorable.reduce((sum, s) => sum + s.fundWeight, 0);
    reasoning += `${unfavWeight.toFixed(0)}% in unfavorable sectors (${unfavNames}).`;
  }
  if (favorable.length === 0 && unfavorable.length === 0) {
    reasoning += 'Fund exposure is mostly in thesis-neutral sectors.';
  }

  return { score, sectorBreakdown, reasoning };
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Calculate the fund's sector allocation from its holdings.
 * Returns a Map of sector name → weight (whole-percent pctOfNav units).
 *
 * Holdings without a sector classification are grouped as "Unclassified".
 * Their weight counts toward the total but contributes neutral to the
 * positioning score (§2.6.3).
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
