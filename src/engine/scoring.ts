/**
 * FundLens v6 — Composite Scoring Engine
 *
 * Combines the four factor scores (Cost Efficiency, Holdings Quality,
 * Positioning, Momentum) into a single composite score per fund.
 *
 * Two layers of scoring:
 *   1. RAW scores — computed by the server pipeline, same for everyone.
 *      These are the per-factor 0–100 scores stored in Supabase.
 *   2. WEIGHTED composite — computed client-side using the user's custom
 *      factor weights. Pure math, no API calls. This is what the user sees.
 *
 * The server stores raw factor scores. The React client multiplies each
 * factor score by the user's weight and sums them. When a user drags a
 * weight slider, the composite updates instantly without hitting the server.
 *
 * This module provides both the server-side aggregation (for pipeline runs)
 * and the pure-math weighting function (shared with client via types).
 *
 * Session 3 deliverable. References: Master Reference §4 (Scoring Model).
 */

import { DEFAULT_FACTOR_WEIGHTS } from './constants.js';
import { CostEfficiencyResult } from './cost-efficiency.js';
import { QualityFactorResult } from './quality.js';
import { MomentumScore } from './momentum.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Raw factor scores for a single fund (0–100 each, before user weighting) */
export interface FundRawScores {
  /** Fund ticker */
  ticker: string;
  /** Fund name */
  name: string;
  /** Cost Efficiency score (0–100, higher = cheaper) */
  costEfficiency: number;
  /** Holdings Quality score (0–100, higher = healthier companies) */
  holdingsQuality: number;
  /** Positioning score (0–100, higher = better macro alignment) */
  positioning: number;
  /** Momentum score (0–100, higher = better recent performance) */
  momentum: number;
}

/** User's factor weight configuration */
export interface FactorWeights {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

/** Composite score for a fund (raw scores + weighted composite) */
export interface FundCompositeScore {
  ticker: string;
  name: string;
  /** Raw factor scores (same for all users) */
  raw: FundRawScores;
  /** Weighted composite score (0–100, personalized to user's weights) */
  composite: number;
  /** Rank among all funds in the menu (1 = best) */
  rank: number;
  /** Factor-level detail for the UI */
  factorDetails: {
    costEfficiency: CostEfficiencyResult;
    holdingsQuality: QualityFactorResult;
    positioning: { score: number; reasoning: string };
    momentum: MomentumScore;
  };
}

/** Complete scoring result for all funds in the menu */
export interface ScoringResult {
  /** All funds scored and ranked */
  funds: FundCompositeScore[];
  /** Weights used for this scoring run */
  weights: FactorWeights;
  /** When scores were computed */
  scoredAt: string;
}

// ─── Core Scoring Functions ─────────────────────────────────────────────────

/**
 * Compute the weighted composite score from raw factor scores.
 *
 * THIS IS THE FUNCTION THAT RUNS CLIENT-SIDE when the user adjusts sliders.
 * Pure math — no API calls, no side effects. Must stay fast and simple.
 *
 * @param raw Raw factor scores (0–100 each)
 * @param weights User's factor weights (must sum to 1.0)
 * @returns Weighted composite score (0–100)
 */
export function computeComposite(
  raw: FundRawScores,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS
): number {
  const composite =
    raw.costEfficiency * weights.costEfficiency +
    raw.holdingsQuality * weights.holdingsQuality +
    raw.positioning * weights.positioning +
    raw.momentum * weights.momentum;

  return Math.round(Math.max(0, Math.min(100, composite)));
}

/**
 * Score and rank all funds in the menu.
 *
 * Takes raw factor scores (from individual factor modules) and produces
 * a ranked list of funds with composite scores.
 *
 * @param fundScores Array of raw scores + factor details per fund
 * @param weights Factor weights to use (defaults to system defaults)
 */
export function scoreAndRankFunds(
  fundScores: Array<{
    ticker: string;
    name: string;
    raw: FundRawScores;
    factorDetails: FundCompositeScore['factorDetails'];
  }>,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS
): ScoringResult {
  // Compute composites
  const withComposites = fundScores.map(f => ({
    ...f,
    composite: computeComposite(f.raw, weights),
  }));

  // Sort by composite descending (best first)
  withComposites.sort((a, b) => b.composite - a.composite);

  // Assign ranks
  const funds: FundCompositeScore[] = withComposites.map((f, i) => ({
    ticker: f.ticker,
    name: f.name,
    raw: f.raw,
    composite: f.composite,
    rank: i + 1,
    factorDetails: f.factorDetails,
  }));

  return {
    funds,
    weights,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Re-score and re-rank funds with new weights. Used client-side when
 * the user adjusts factor weight sliders.
 *
 * Takes existing raw scores (no recalculation) and applies new weights.
 * This is instant — pure math on data already in memory.
 *
 * @param currentScores Existing scored funds (from a previous scoreAndRankFunds call)
 * @param newWeights Updated factor weights from the user's slider changes
 */
export function rescoreWithNewWeights(
  currentScores: ScoringResult,
  newWeights: FactorWeights
): ScoringResult {
  const fundInputs = currentScores.funds.map(f => ({
    ticker: f.ticker,
    name: f.name,
    raw: f.raw,
    factorDetails: f.factorDetails,
  }));

  return scoreAndRankFunds(fundInputs, newWeights);
}

/**
 * Validate that factor weights sum to 1.0 (within floating-point tolerance).
 * Called before scoring to ensure user-adjusted weights are valid.
 */
export function validateWeights(weights: FactorWeights): {
  valid: boolean;
  sum: number;
  error: string | null;
} {
  const sum =
    weights.costEfficiency +
    weights.holdingsQuality +
    weights.positioning +
    weights.momentum;

  const valid = Math.abs(sum - 1.0) < 0.001;

  return {
    valid,
    sum,
    error: valid
      ? null
      : `Factor weights must sum to 1.0 (currently ${sum.toFixed(4)})`,
  };
}

/**
 * Normalize weights to sum to exactly 1.0.
 *
 * Used by the weight slider UI: when the user drags one slider,
 * the other three redistribute proportionally so the total stays 1.0.
 *
 * @param weights Current weights (may not sum to 1.0)
 * @param changedFactor Which factor the user just changed
 * @param newValue The new value for that factor
 */
export function redistributeWeights(
  weights: FactorWeights,
  changedFactor: keyof FactorWeights,
  newValue: number
): FactorWeights {
  // Clamp the new value to 0.0–1.0
  const clamped = Math.max(0, Math.min(1, newValue));

  // Calculate how much weight the OTHER factors currently have
  const otherFactors = (Object.keys(weights) as Array<keyof FactorWeights>).filter(
    k => k !== changedFactor
  );
  const otherSum = otherFactors.reduce((sum, k) => sum + weights[k], 0);

  // The remaining weight to distribute among the other factors
  const remaining = 1 - clamped;

  const result: FactorWeights = { ...weights, [changedFactor]: clamped };

  if (otherSum === 0) {
    // Edge case: all other factors were 0 — distribute equally
    const each = remaining / otherFactors.length;
    for (const k of otherFactors) {
      result[k] = each;
    }
  } else {
    // Proportional redistribution
    for (const k of otherFactors) {
      result[k] = (weights[k] / otherSum) * remaining;
    }
  }

  // Ensure clean rounding (weights should be multiples of 0.01)
  let roundedSum = 0;
  for (const k of Object.keys(result) as Array<keyof FactorWeights>) {
    result[k] = Math.round(result[k] * 100) / 100;
    roundedSum += result[k];
  }

  // Fix any rounding drift by adjusting the largest non-changed factor
  if (Math.abs(roundedSum - 1.0) > 0.001) {
    const adjustFactor = otherFactors.reduce((max, k) =>
      result[k] > result[max] ? k : max
    );
    result[adjustFactor] += 1.0 - roundedSum;
    result[adjustFactor] = Math.round(result[adjustFactor] * 100) / 100;
  }

  return result;
}
