/**
 * FundLens v6 — Composite Scoring Engine
 *
 * Implements the z-space + CDF scoring pipeline from spec §2.1:
 *   1. Raw factor scores (0–100) → z-standardize across fund universe (Bessel-corrected, n-1)
 *   2. Weighted composite in z-space (not in raw space)
 *   3. Map back to 0–100 via normal CDF (Abramowitz & Stegun approximation)
 *
 * Two layers of scoring:
 *   1. SERVER-SIDE: scoreAndRankFunds() runs the full z-space + CDF pipeline
 *      across the entire fund universe. Stores raw scores AND z-scores to Supabase.
 *   2. CLIENT-SIDE: computeCompositeFromZScores() uses pre-computed z-scores
 *      to do weighted sum + CDF. Runs instantly when users adjust weight sliders.
 *      Only requires normalCDF() — no universe data, no z-standardization.
 *
 * Session 4 deliverable. References: FUNDLENS_SPEC.md §2.1, §2.2, §2.8.
 */

import {
  DEFAULT_FACTOR_WEIGHTS,
  ALLOCATION,
  TIER_BADGES,
  SPECIAL_TIERS,
  MONEY_MARKET_TICKERS,
} from './constants.js';
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

/** Z-scores for a single fund's four factors (computed across the fund universe) */
export interface FundZScores {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

/** User's factor weight configuration */
export interface FactorWeights {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

/** Composite score for a fund (raw scores + z-scores + weighted composite) */
export interface FundCompositeScore {
  ticker: string;
  name: string;
  /** Raw factor scores (same for all users) */
  raw: FundRawScores;
  /** Z-scores per factor (standardized across the fund universe, Bessel-corrected) */
  zScores: FundZScores;
  /** Weighted composite score (0–100, personalized to user's weights) */
  composite: number;
  /** Rank among all funds in the menu (1 = best) */
  rank: number;
  /** Tier label derived from MAD-based modified z-score (§6.3) */
  tier: string;
  /** Tier color for UI display (§6.3) */
  tierColor: string;
  /** Factor-level detail for the UI */
  factorDetails: {
    costEfficiency: CostEfficiencyResult;
    holdingsQuality: QualityFactorResult;
    positioning: { score: number; reasoning: string };
    momentum: MomentumScore;
    /** Sector exposure map for the UI donut chart (sector → weight as fraction of NAV) */
    sectorExposure?: Record<string, number>;
    /** F-2 fix: Top holdings by weight (all holdings, not just equity) for the Brief page */
    topHoldings?: Array<{ name: string; ticker: string | null; sector: string | null; weight: number }>;
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

// ─── Mathematical Functions (§2.1) ──────────────────────────────────────────

/**
 * Standard normal CDF using Abramowitz & Stegun approximation (formula 7.1.26).
 * Max error ≈ 7.5 × 10⁻⁸. Spec §2.1 requires this exact method.
 *
 * The A&S coefficients approximate erf(x) for x ≥ 0:
 *   erf(x) ≈ 1 - (a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵) · e^(-x²)
 *   where t = 1/(1 + px)
 *
 * The standard normal CDF relates to erf via:
 *   Φ(z) = 0.5 · (1 + erf(z / √2))
 *
 * Reference: Abramowitz, M. and Stegun, I.A. (1964), Handbook of Mathematical
 * Functions, National Bureau of Standards, formula 7.1.26.
 *
 * @param z Standard normal z-value
 * @returns Φ(z) — probability that Z ≤ z
 */
export function normalCDF(z: number): number {
  // Constants from Abramowitz & Stegun 7.1.26
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  // erf(x) is defined for x ≥ 0; use symmetry erf(-x) = -erf(x)
  const absZ = Math.abs(z);
  const x = absZ / Math.SQRT2;  // Convert from z to erf argument

  const t = 1.0 / (1.0 + p * x);

  // Horner form for numerical stability
  const erf = 1.0 - t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);

  // Φ(z) = 0.5 * (1 + erf(z/√2)), with symmetry for negative z
  const result = 0.5 * (1.0 + erf);

  return z >= 0 ? result : 1.0 - result;
}

/**
 * Z-standardize an array of values across the universe.
 * Uses Bessel correction (n-1) for sample standard deviation per spec §2.1.
 *
 * @param values Raw scores for a single factor across all funds
 * @returns Array of z-scores in the same order, or null if standardization is undefined
 */
export function zStandardize(values: number[]): number[] | null {
  const n = values.length;

  // Spec §2.1: If fewer than 2 funds, z-standardization is undefined
  if (n < 2) return null;

  // Mean
  const mean = values.reduce((sum, v) => sum + v, 0) / n;

  // Bessel-corrected standard deviation (divide by n-1)
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(variance);

  // If all values are identical (stdev = 0), z-scores are all 0
  if (stdev === 0) {
    return values.map(() => 0);
  }

  return values.map(v => (v - mean) / stdev);
}

// ─── Tier Badge Computation (§6.3) ─────────────────────────────────────────

/** Get tier label + color from MAD-based modified z-score */
function getTier(modZ: number): { tier: string; tierColor: string } {
  for (const badge of TIER_BADGES) {
    if (modZ >= badge.zMin) {
      return { tier: badge.label, tierColor: badge.color };
    }
  }
  return { tier: 'Weak', tierColor: '#EF4444' };
}

/** Compute median of a numeric array */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Assign tier badges to scored funds using MAD-based modified z-scores (§3.2, §6.3).
 *
 * Uses the same MAD → modified z-score → tier threshold logic as allocation.ts,
 * extracted here so tiers can be persisted alongside scores without running
 * the full allocation engine.
 *
 * @param funds Scored funds with composite scores
 * @returns Map of ticker → { tier, tierColor }
 */
export function computeTiers(
  funds: Array<{ ticker: string; composite: number }>
): Map<string, { tier: string; tierColor: string }> {
  const result = new Map<string, { tier: string; tierColor: string }>();

  // Separate money market funds
  const nonMM = funds.filter(f => !MONEY_MARKET_TICKERS.has(f.ticker));
  const mmFunds = funds.filter(f => MONEY_MARKET_TICKERS.has(f.ticker));

  // Money market funds get the special MM tier
  for (const f of mmFunds) {
    result.set(f.ticker, {
      tier: SPECIAL_TIERS.MONEY_MARKET.label,
      tierColor: SPECIAL_TIERS.MONEY_MARKET.color,
    });
  }

  if (nonMM.length === 0) return result;

  // MAD-based modified z-scores (§3.2)
  const scores = nonMM.map(f => f.composite);
  const med = median(scores);
  const absDeviations = scores.map(s => Math.abs(s - med));
  const mad = median(absDeviations);
  const safeMad = mad > 0 ? mad : 1e-9;

  for (const fund of nonMM) {
    const modZ = ALLOCATION.MAD_CONSISTENCY * (fund.composite - med) / safeMad;
    result.set(fund.ticker, getTier(modZ));
  }

  return result;
}

// ─── Core Scoring Functions ─────────────────────────────────────────────────

/**
 * Compute composite score from pre-computed z-scores and user weights.
 *
 * THIS IS THE FUNCTION FOR CLIENT-SIDE RESCORE when users adjust weight sliders.
 * Pure math — no API calls, no side effects, no universe data needed.
 * Takes z-scores (already stored in Supabase) and applies user weights + CDF.
 *
 * Also used by brief-engine.ts for per-user composite with custom weights.
 *
 * @param zScores Pre-computed z-scores for one fund's four factors
 * @param weights User's factor weights (must sum to 1.0)
 * @returns Weighted composite score (0–100)
 */
export function computeCompositeFromZScores(
  zScores: FundZScores,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS
): number {
  // Step 3 from §2.1: Weighted composite in z-space
  const zComposite =
    zScores.costEfficiency * weights.costEfficiency +
    zScores.holdingsQuality * weights.holdingsQuality +
    zScores.positioning * weights.positioning +
    zScores.momentum * weights.momentum;

  // Step 4 from §2.1: Map back to 0–100 via normal CDF
  const composite = 100 * normalCDF(zComposite);

  return Math.round(Math.max(0, Math.min(100, composite)));
}

/**
 * Legacy computeComposite — raw weighted average fallback.
 *
 * Used when z-standardization is not possible (fewer than 2 funds in universe).
 * Also maintained for backward compatibility with brief-engine.ts and persist.ts
 * until those callers are updated to use z-scores.
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
 * Score and rank all funds in the menu using the z-space + CDF pipeline.
 *
 * This is the server-side scoring function called by pipeline.ts (Step 14).
 * It has the full fund universe, so it can z-standardize across all funds.
 *
 * Pipeline per spec §2.1:
 *   Step 1: Raw factor scores are already computed (passed in)
 *   Step 2: Z-standardize each factor across the fund universe (Bessel-corrected)
 *   Step 3: Weighted composite in z-space
 *   Step 4: Map back to 0–100 via normal CDF
 *
 * Edge case: If fewer than 2 funds, z-standardization is undefined.
 * Falls back to raw weighted average per spec §2.1.
 *
 * @param fundScores Array of raw scores + factor details per fund
 * @param weights Factor weights to use (defaults to system defaults)
 * @param perFundWeights Optional per-fund weight overrides (for coverage scaling §2.4.1).
 *   When coverage_pct < 0.40, quality weight is reduced and freed weight goes to momentum.
 *   The z-standardization (Step 2) is the same for all funds; only the weighted composite
 *   (Step 3) uses per-fund weights.
 */
export function scoreAndRankFunds(
  fundScores: Array<{
    ticker: string;
    name: string;
    raw: FundRawScores;
    factorDetails: FundCompositeScore['factorDetails'];
  }>,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS,
  perFundWeights?: Map<string, FactorWeights>
): ScoringResult {
  const n = fundScores.length;

  // ── Step 2: Z-standardize each factor across the fund universe ──
  const costValues = fundScores.map(f => f.raw.costEfficiency);
  const qualityValues = fundScores.map(f => f.raw.holdingsQuality);
  const momentumValues = fundScores.map(f => f.raw.momentum);
  const positioningValues = fundScores.map(f => f.raw.positioning);

  const zCost = zStandardize(costValues);
  const zQuality = zStandardize(qualityValues);
  const zMomentum = zStandardize(momentumValues);
  const zPositioning = zStandardize(positioningValues);

  // If z-standardization is undefined (< 2 funds), fall back to raw weighted average
  const useZSpace = zCost !== null && zQuality !== null && zMomentum !== null && zPositioning !== null;

  const withComposites = fundScores.map((f, i) => {
    // BUG-2 fix (§2.7): Money market funds get fixed composite 50, skip z-standardization.
    // They're included in the z-standardization arrays for index alignment but their
    // composite is overridden here so z-score distortion from other funds can't shift them.
    if (MONEY_MARKET_TICKERS.has(f.ticker)) {
      return {
        ...f,
        composite: 50,
        zScores: {
          costEfficiency: 0,
          holdingsQuality: 0,
          positioning: 0,
          momentum: 0,
        } as FundZScores,
      };
    }

    let composite: number;
    let zScores: FundZScores;

    // Use per-fund weights if available (coverage scaling §2.4.1), else default
    const fundWeights = perFundWeights?.get(f.ticker) ?? weights;

    if (useZSpace) {
      // Normal path: z-space + CDF
      zScores = {
        costEfficiency: zCost[i],
        holdingsQuality: zQuality[i],
        positioning: zPositioning[i],
        momentum: zMomentum[i],
      };

      composite = computeCompositeFromZScores(zScores, fundWeights);
    } else {
      // Fallback: raw weighted average (< 2 funds)
      zScores = {
        costEfficiency: 0,
        holdingsQuality: 0,
        positioning: 0,
        momentum: 0,
      };

      composite = computeComposite(f.raw, fundWeights);
    }

    return { ...f, composite, zScores };
  });

  // Sort by composite descending (best first)
  withComposites.sort((a, b) => b.composite - a.composite);

  // Compute tier badges from MAD-based modified z-scores (§6.3)
  const tierMap = computeTiers(withComposites);

  // Assign ranks and tiers
  const funds: FundCompositeScore[] = withComposites.map((f, i) => {
    const tierInfo = tierMap.get(f.ticker) ?? { tier: 'Neutral', tierColor: '#6B7280' };
    return {
      ticker: f.ticker,
      name: f.name,
      raw: f.raw,
      zScores: f.zScores,
      composite: f.composite,
      rank: i + 1,
      tier: tierInfo.tier,
      tierColor: tierInfo.tierColor,
      factorDetails: f.factorDetails,
    };
  });

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
 * Takes existing z-scores (no recalculation — they don't change when weights
 * change) and applies new weights via computeCompositeFromZScores().
 * This is instant — pure math on data already in memory.
 *
 * @param currentScores Existing scored funds (from a previous scoreAndRankFunds call)
 * @param newWeights Updated factor weights from the user's slider changes
 */
export function rescoreWithNewWeights(
  currentScores: ScoringResult,
  newWeights: FactorWeights
): ScoringResult {
  const rescored = currentScores.funds.map(f => ({
    ...f,
    composite: computeCompositeFromZScores(f.zScores, newWeights),
  }));

  // Re-sort by new composite
  rescored.sort((a, b) => b.composite - a.composite);

  // Recompute tiers with updated composites (§6.3)
  const tierMap = computeTiers(rescored);

  // Re-assign ranks and tiers
  const funds: FundCompositeScore[] = rescored.map((f, i) => {
    const tierInfo = tierMap.get(f.ticker) ?? { tier: f.tier, tierColor: f.tierColor };
    return {
      ...f,
      rank: i + 1,
      tier: tierInfo.tier,
      tierColor: tierInfo.tierColor,
    };
  });

  return {
    funds,
    weights: newWeights,
    scoredAt: currentScores.scoredAt,
  };
}

/**
 * Validate that factor weights sum to 1.0 (within tolerance per spec §2.2).
 * Spec: ±0.02 tolerance. Minimum 5% per factor.
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

  // Spec §2.2: ±0.02 tolerance
  if (Math.abs(sum - 1.0) >= 0.02) {
    return {
      valid: false,
      sum,
      error: `Factor weights must sum to 1.0 ±0.02 (currently ${sum.toFixed(4)})`,
    };
  }

  // Spec §2.2: Minimum 5% per factor
  const minWeight = 0.05;
  const factors: Array<{ name: string; value: number }> = [
    { name: 'Cost Efficiency', value: weights.costEfficiency },
    { name: 'Holdings Quality', value: weights.holdingsQuality },
    { name: 'Positioning', value: weights.positioning },
    { name: 'Momentum', value: weights.momentum },
  ];

  for (const f of factors) {
    if (f.value < minWeight) {
      return {
        valid: false,
        sum,
        error: `${f.name} weight (${(f.value * 100).toFixed(0)}%) is below minimum 5%`,
      };
    }
  }

  return { valid: true, sum, error: null };
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
