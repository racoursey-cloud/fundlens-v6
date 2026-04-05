/**
 * FundLens v6 — Cost Efficiency Factor
 *
 * Scores funds on how much they charge (expense ratio). Lower is better.
 * This is the single strongest predictor of long-term fund performance
 * per Morningstar and Vanguard research.
 *
 * Scoring approach:
 *   1. Get the fund's expense ratio (from FMP profile or Supabase funds table)
 *   2. Compare it to a category-based benchmark curve
 *   3. Score 0–100 where 100 = lowest cost in category
 *
 * The score is relative to the fund's category (index funds are compared
 * to other index funds, active funds to active funds) so a 0.04% index
 * fund and a 0.65% active fund can both score well within their category.
 *
 * Weight: 25% of composite (DEFAULT_FACTOR_WEIGHTS.costEfficiency)
 *
 * Session 3 deliverable. References: Master Reference §4 (Cost Efficiency).
 */

// ─── Category Benchmarks ────────────────────────────────────────────────────
// Expense ratio percentiles by fund category. Derived from Morningstar
// industry averages. Used to convert a raw expense ratio into a 0–100 score
// relative to peers.
//
// Each entry defines: [excellent, good, average, expensive, very_expensive]
// These are expense ratios (as decimals) at the 10th, 25th, 50th, 75th,
// and 90th percentiles for that category.

interface CategoryBenchmark {
  /** 10th percentile — very cheap for this category */
  p10: number;
  /** 25th percentile — cheap */
  p25: number;
  /** 50th percentile — median */
  p50: number;
  /** 75th percentile — above average cost */
  p75: number;
  /** 90th percentile — expensive */
  p90: number;
}

/**
 * Category benchmarks for expense ratios.
 *
 * "passive" = index funds, target-date index funds
 * "active"  = actively managed funds
 * "bond"    = bond/fixed income funds (both active and passive)
 * "money_market" = money market / stable value
 * "target_date" = target-date active funds (lifecycle)
 * "default" = fallback when category is unknown
 *
 * Values are annual expense ratios as decimals (0.0004 = 0.04%).
 */
const CATEGORY_BENCHMARKS: Record<string, CategoryBenchmark> = {
  passive: {
    p10: 0.0003, // 0.03% — Fidelity Zero funds
    p25: 0.0005, // 0.05%
    p50: 0.0010, // 0.10%
    p75: 0.0020, // 0.20%
    p90: 0.0040, // 0.40%
  },
  active: {
    p10: 0.0045, // 0.45%
    p25: 0.0060, // 0.60%
    p50: 0.0080, // 0.80%
    p75: 0.0100, // 1.00%
    p90: 0.0130, // 1.30%
  },
  bond: {
    p10: 0.0004, // 0.04%
    p25: 0.0010, // 0.10%
    p50: 0.0035, // 0.35%
    p75: 0.0055, // 0.55%
    p90: 0.0075, // 0.75%
  },
  money_market: {
    p10: 0.0010, // 0.10%
    p25: 0.0020, // 0.20%
    p50: 0.0035, // 0.35%
    p75: 0.0045, // 0.45%
    p90: 0.0060, // 0.60%
  },
  target_date: {
    p10: 0.0008, // 0.08%
    p25: 0.0012, // 0.12%
    p50: 0.0040, // 0.40%
    p75: 0.0065, // 0.65%
    p90: 0.0090, // 0.90%
  },
  default: {
    p10: 0.0005, // 0.05%
    p25: 0.0015, // 0.15%
    p50: 0.0050, // 0.50%
    p75: 0.0085, // 0.85%
    p90: 0.0120, // 1.20%
  },
};

// ─── Category Detection ─────────────────────────────────────────────────────

/**
 * Infer the fund category from its name and profile data.
 * Used to select the right benchmark curve for scoring.
 *
 * This is a heuristic — covers the common patterns in 401(k) fund menus.
 */
export function detectFundCategory(
  fundName: string,
  expenseRatio?: number | null
): string {
  const name = fundName.toLowerCase();

  // Money market / stable value
  if (
    name.includes('money market') ||
    name.includes('stable value') ||
    name.includes('government money') ||
    name.includes('cash reserve')
  ) {
    return 'money_market';
  }

  // Target date funds
  if (
    name.includes('target') ||
    name.includes('lifecycle') ||
    name.includes('retirement') ||
    /20[2-7]\d/.test(name) // matches "2025", "2030", "2040", etc.
  ) {
    // Determine if it's a passive or active target-date
    if (
      name.includes('index') ||
      (expenseRatio != null && expenseRatio < 0.002)
    ) {
      return 'passive';
    }
    return 'target_date';
  }

  // Bond / fixed income
  if (
    name.includes('bond') ||
    name.includes('fixed income') ||
    name.includes('income fund') ||
    name.includes('treasury') ||
    name.includes('aggregate') ||
    name.includes('tips') ||
    name.includes('inflation protected')
  ) {
    if (name.includes('index') || (expenseRatio != null && expenseRatio < 0.001)) {
      return 'passive';
    }
    return 'bond';
  }

  // Passive / index funds
  if (
    name.includes('index') ||
    name.includes('idx') ||
    name.includes('500') ||
    name.includes('total market') ||
    name.includes('total stock') ||
    name.includes('total intl') ||
    name.includes('total international') ||
    name.includes('s&p') ||
    name.includes('russell') ||
    name.includes('msci') ||
    name.includes('ftse')
  ) {
    return 'passive';
  }

  // Very low expense ratio is likely passive even without "index" in name
  if (expenseRatio != null && expenseRatio < 0.001) {
    return 'passive';
  }

  // Default to active
  return 'active';
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * Score a fund's cost efficiency on a 0–100 scale.
 *
 * The scoring curve is piecewise linear across the category's percentile
 * benchmarks:
 *
 *   Expense ratio ≤ p10  →  score 95–100 (excellent)
 *   p10 < ER ≤ p25       →  score 80–95  (very good)
 *   p25 < ER ≤ p50       →  score 60–80  (good)
 *   p50 < ER ≤ p75       →  score 35–60  (below average)
 *   p75 < ER ≤ p90       →  score 15–35  (expensive)
 *   ER > p90              →  score 0–15   (very expensive)
 *
 * @param expenseRatio Annual expense ratio as decimal (e.g. 0.0004 = 0.04%)
 * @param fundName Fund name (used for category detection)
 * @returns Score 0–100 (higher = lower cost = better)
 */
export function scoreCostEfficiency(
  expenseRatio: number | null,
  fundName: string
): CostEfficiencyResult {
  // If expense ratio is unknown, return a neutral score
  if (expenseRatio == null || expenseRatio < 0) {
    return {
      score: 50,
      category: 'default',
      expenseRatio: null,
      percentileEstimate: 50,
      reasoning: 'Expense ratio not available — scored at neutral midpoint.',
    };
  }

  const category = detectFundCategory(fundName, expenseRatio);
  const bench = CATEGORY_BENCHMARKS[category] || CATEGORY_BENCHMARKS.default;

  let score: number;
  let percentileEstimate: number;

  if (expenseRatio <= bench.p10) {
    // Top 10% — excellent
    score = interpolate(expenseRatio, 0, bench.p10, 100, 95);
    percentileEstimate = interpolate(expenseRatio, 0, bench.p10, 1, 10);
  } else if (expenseRatio <= bench.p25) {
    // 10th–25th percentile — very good
    score = interpolate(expenseRatio, bench.p10, bench.p25, 95, 80);
    percentileEstimate = interpolate(expenseRatio, bench.p10, bench.p25, 10, 25);
  } else if (expenseRatio <= bench.p50) {
    // 25th–50th percentile — good
    score = interpolate(expenseRatio, bench.p25, bench.p50, 80, 60);
    percentileEstimate = interpolate(expenseRatio, bench.p25, bench.p50, 25, 50);
  } else if (expenseRatio <= bench.p75) {
    // 50th–75th percentile — below average
    score = interpolate(expenseRatio, bench.p50, bench.p75, 60, 35);
    percentileEstimate = interpolate(expenseRatio, bench.p50, bench.p75, 50, 75);
  } else if (expenseRatio <= bench.p90) {
    // 75th–90th percentile — expensive
    score = interpolate(expenseRatio, bench.p75, bench.p90, 35, 15);
    percentileEstimate = interpolate(expenseRatio, bench.p75, bench.p90, 75, 90);
  } else {
    // Above 90th percentile — very expensive
    score = interpolate(
      expenseRatio,
      bench.p90,
      bench.p90 * 2,
      15,
      0
    );
    percentileEstimate = interpolate(
      expenseRatio,
      bench.p90,
      bench.p90 * 2,
      90,
      99
    );
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, Math.round(score)));
  percentileEstimate = Math.max(1, Math.min(99, Math.round(percentileEstimate)));

  const pctDisplay = (expenseRatio * 100).toFixed(2);

  return {
    score,
    category,
    expenseRatio,
    percentileEstimate,
    reasoning:
      `Expense ratio ${pctDisplay}% is at ~${percentileEstimate}th percentile ` +
      `for ${formatCategoryName(category)} funds. ` +
      `Score: ${score}/100.`,
  };
}

/** Result of Cost Efficiency scoring for a single fund */
export interface CostEfficiencyResult {
  /** Score 0–100 (higher = cheaper = better) */
  score: number;
  /** Detected fund category */
  category: string;
  /** Raw expense ratio (decimal), null if unavailable */
  expenseRatio: number | null;
  /** Estimated percentile within category (1 = cheapest, 99 = most expensive) */
  percentileEstimate: number;
  /** Human-readable explanation of the score */
  reasoning: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Linear interpolation between two ranges. */
function interpolate(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/** Format category key for display. */
function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    passive: 'passive/index',
    active: 'actively managed',
    bond: 'bond/fixed income',
    money_market: 'money market',
    target_date: 'target-date',
    default: 'general',
  };
  return names[category] || category;
}
