/**
 * FundLens v6 — Momentum Factor
 *
 * Measures recent price performance trends (3–12 month) for each fund.
 * Momentum is a well-documented academic factor — securities that have
 * performed well recently tend to continue performing well in the short term.
 *
 * Scoring approach:
 *   1. Fetch historical daily prices from FMP for each fund ticker
 *   2. Calculate returns over multiple lookback windows (3, 6, 9, 12 months)
 *   3. Blend the windows (most weight on 6–12 month, least on 3 month)
 *   4. Cross-sectional ranking: score each fund relative to the other
 *      funds in the 401(k) menu, not against an absolute benchmark
 *
 * Cross-sectional means: the best-performing fund in the menu gets ~95,
 * the worst gets ~5, and everyone else is spread between. This ensures
 * the Momentum factor always differentiates funds, even in a bear market
 * where all returns are negative.
 *
 * Weight: 20% of composite (DEFAULT_FACTOR_WEIGHTS.momentum)
 *
 * Session 3 deliverable. References: Master Reference §4 (Momentum), §8 step 8–9.
 */

import { FmpDailyPrice } from './fmp.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Momentum calculation for a single fund */
export interface FundMomentum {
  ticker: string;
  /** Returns over each lookback window (null if insufficient data) */
  returns: {
    /** 3-month return as decimal (e.g. 0.05 = 5%) */
    threeMonth: number | null;
    /** 6-month return */
    sixMonth: number | null;
    /** 9-month return */
    nineMonth: number | null;
    /** 12-month return */
    twelveMonth: number | null;
  };
  /** Blended momentum signal (weighted average of available windows) */
  blendedReturn: number | null;
  /** Whether sufficient price data was available */
  hasData: boolean;
}

/** Result of cross-sectional momentum scoring for the full fund menu */
export interface MomentumFactorResult {
  /** Per-fund momentum scores (0–100, cross-sectional) */
  scores: MomentumScore[];
  /** Human-readable summary */
  reasoning: string;
}

/** Momentum score for a single fund */
export interface MomentumScore {
  ticker: string;
  /** Cross-sectional momentum score (0–100) */
  score: number;
  /** Blended return used for ranking */
  blendedReturn: number | null;
  /** Individual window returns */
  returns: FundMomentum['returns'];
  /** Rank within the fund menu (1 = best momentum) */
  rank: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/** Weights for blending lookback windows into a single momentum signal */
const WINDOW_WEIGHTS = {
  threeMonth: 0.10,  // Recent noise — low weight
  sixMonth: 0.30,    // Medium-term trend — solid signal
  nineMonth: 0.30,   // Strong momentum window
  twelveMonth: 0.30, // Classic 12-month momentum
} as const;

/** Approximate trading days per month */
const TRADING_DAYS_PER_MONTH = 21;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate momentum returns for a single fund from its price history.
 *
 * @param ticker Fund ticker
 * @param prices Daily price history from FMP (most recent first)
 */
export function calculateFundMomentum(
  ticker: string,
  prices: FmpDailyPrice[]
): FundMomentum {
  if (!prices || prices.length === 0) {
    return {
      ticker,
      returns: {
        threeMonth: null,
        sixMonth: null,
        nineMonth: null,
        twelveMonth: null,
      },
      blendedReturn: null,
      hasData: false,
    };
  }

  // Sort by date descending (most recent first) if not already
  const sorted = [...prices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const currentPrice = sorted[0].adjClose || sorted[0].close;

  // Calculate returns for each lookback window
  const threeMonth = calculateReturn(sorted, currentPrice, 3);
  const sixMonth = calculateReturn(sorted, currentPrice, 6);
  const nineMonth = calculateReturn(sorted, currentPrice, 9);
  const twelveMonth = calculateReturn(sorted, currentPrice, 12);

  // Blend available windows
  const blendedReturn = blendReturns({
    threeMonth,
    sixMonth,
    nineMonth,
    twelveMonth,
  });

  return {
    ticker,
    returns: { threeMonth, sixMonth, nineMonth, twelveMonth },
    blendedReturn,
    hasData: blendedReturn !== null,
  };
}

/**
 * Cross-sectional momentum scoring: rank all funds in the menu against
 * each other and assign scores from 0–100.
 *
 * The best-performing fund gets ~95, the worst gets ~5.
 * Funds with no price data get a neutral 50.
 *
 * @param fundMomentums Momentum data for all funds in the menu
 */
export function scoreMomentumCrossSectional(
  fundMomentums: FundMomentum[]
): MomentumFactorResult {
  // Separate funds with and without data
  const withData = fundMomentums.filter(m => m.hasData && m.blendedReturn !== null);
  const withoutData = fundMomentums.filter(m => !m.hasData || m.blendedReturn === null);

  if (withData.length === 0) {
    // No price data for any fund — all get neutral scores
    const scores: MomentumScore[] = fundMomentums.map(m => ({
      ticker: m.ticker,
      score: 50,
      blendedReturn: null,
      returns: m.returns,
      rank: 1,
    }));
    return {
      scores,
      reasoning: 'Momentum: No price data available for any fund. All scored at neutral 50.',
    };
  }

  // Sort by blended return descending (best first)
  const ranked = [...withData].sort(
    (a, b) => (b.blendedReturn || 0) - (a.blendedReturn || 0)
  );

  const scores: MomentumScore[] = [];
  const n = ranked.length;

  for (let i = 0; i < n; i++) {
    const m = ranked[i];
    // Map rank to score: rank 0 (best) → ~95, rank n-1 (worst) → ~5
    // Formula: score = 95 - (rank / (n - 1)) * 90
    // For a single fund, score = 50
    const score = n === 1
      ? 75 // Single fund with data gets above-neutral
      : Math.round(95 - (i / (n - 1)) * 90);

    scores.push({
      ticker: m.ticker,
      score: Math.max(5, Math.min(95, score)),
      blendedReturn: m.blendedReturn,
      returns: m.returns,
      rank: i + 1,
    });
  }

  // Add neutral scores for funds without data
  for (const m of withoutData) {
    scores.push({
      ticker: m.ticker,
      score: 50,
      blendedReturn: null,
      returns: m.returns,
      rank: n + 1,
    });
  }

  const best = ranked[0];
  const bestPct = best.blendedReturn
    ? (best.blendedReturn * 100).toFixed(1)
    : '?';

  return {
    scores,
    reasoning:
      `Momentum: Ranked ${withData.length} funds cross-sectionally. ` +
      `Best: ${best.ticker} (${bestPct}% blended return). ` +
      `${withoutData.length} funds had no price data.`,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Calculate the return over a lookback window.
 *
 * @param sortedPrices Prices sorted most-recent-first
 * @param currentPrice Most recent price
 * @param months Number of months to look back
 * @returns Return as decimal (e.g. 0.05 = 5%), or null if insufficient data
 */
function calculateReturn(
  sortedPrices: FmpDailyPrice[],
  currentPrice: number,
  months: number
): number | null {
  const targetIndex = months * TRADING_DAYS_PER_MONTH;

  // Need enough data points
  if (sortedPrices.length < targetIndex) {
    return null;
  }

  // Use a window around the target index to handle weekends/holidays
  // Look within ±5 trading days of the target
  const windowStart = Math.max(0, targetIndex - 5);
  const windowEnd = Math.min(sortedPrices.length - 1, targetIndex + 5);
  const pastPrice = sortedPrices[Math.min(targetIndex, windowEnd)];

  const pastClose = pastPrice.adjClose || pastPrice.close;

  if (pastClose <= 0 || currentPrice <= 0) return null;

  return (currentPrice - pastClose) / pastClose;
}

/**
 * Blend multiple return windows into a single momentum signal using
 * the configured weights. Handles missing windows by redistributing
 * weight to available ones.
 */
function blendReturns(returns: FundMomentum['returns']): number | null {
  const windows: Array<{ value: number; weight: number }> = [];

  if (returns.threeMonth != null) {
    windows.push({ value: returns.threeMonth, weight: WINDOW_WEIGHTS.threeMonth });
  }
  if (returns.sixMonth != null) {
    windows.push({ value: returns.sixMonth, weight: WINDOW_WEIGHTS.sixMonth });
  }
  if (returns.nineMonth != null) {
    windows.push({ value: returns.nineMonth, weight: WINDOW_WEIGHTS.nineMonth });
  }
  if (returns.twelveMonth != null) {
    windows.push({ value: returns.twelveMonth, weight: WINDOW_WEIGHTS.twelveMonth });
  }

  if (windows.length === 0) return null;

  // Normalize weights so they sum to 1.0
  const totalWeight = windows.reduce((sum, w) => sum + w.weight, 0);
  let blended = 0;
  for (const w of windows) {
    blended += w.value * (w.weight / totalWeight);
  }

  return blended;
}
