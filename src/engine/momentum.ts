/**
 * FundLens v6 — Momentum Factor (§2.5)
 *
 * Measures recent price performance trends, volatility-adjusted, cross-sectionally
 * scored via z-score + CDF. Backward-looking confirmation signal.
 *
 * Pipeline (hybrid of v6 multi-window + v5.1 mathematical engine):
 *   1. Fetch daily prices from Tiingo (primary) or FMP (fallback)
 *   2. Calculate returns over 4 lookback windows (3/6/9/12 months)
 *   3. Blend windows: 10/30/30/30 weights (§2.5.1)
 *   4. Volatility adjustment: blended_return / period_vol (§2.5.2)
 *      — Prevents high-vol funds from dominating the momentum signal
 *      — Ported from v5.1 scoring.js (Barroso & Santa-Clara 2015)
 *   5. Cross-sectional z-score + CDF scoring (§2.5.3)
 *      — Bessel-corrected (n-1) z-standardization
 *      — Winsorize ±3 sigma
 *      — Map through Abramowitz & Stegun normal CDF to 0–100
 *      — Ported from v5.1 scoring.js computeCrossSectionalMomentum()
 *
 * Weight: 25% of composite (DEFAULT_FACTOR_WEIGHTS.momentum)
 *
 * Session 5: CRITICAL-2 (vol adjustment) + CRITICAL-3 (z-score + CDF).
 * References: FUNDLENS_SPEC.md §2.5.1, §2.5.2, §2.5.3.
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
  /** Daily returns array for volatility calculation (day-over-day fractional changes) */
  dailyReturns: number[];
  /** Whether sufficient price data was available */
  hasData: boolean;
}

/** Result of cross-sectional momentum scoring for the full fund menu */
export interface MomentumFactorResult {
  /** Per-fund momentum scores (0–100, cross-sectional z-score + CDF) */
  scores: MomentumScore[];
  /** Human-readable summary */
  reasoning: string;
}

/** Momentum score for a single fund */
export interface MomentumScore {
  ticker: string;
  /** Cross-sectional momentum score (0–100) via z-score + CDF */
  score: number;
  /** Vol-adjusted return used for scoring (blendedReturn / periodVol) */
  volAdjustedReturn: number | null;
  /** Raw blended return before vol adjustment */
  blendedReturn: number | null;
  /** Individual window returns */
  returns: FundMomentum['returns'];
  /** Rank within the fund menu (1 = best momentum) */
  rank: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/** Weights for blending lookback windows into a single momentum signal (§2.5.1) */
const WINDOW_WEIGHTS = {
  threeMonth: 0.10,  // Recent noise — low weight
  sixMonth: 0.30,    // Medium-term trend — solid signal
  nineMonth: 0.30,   // Strong momentum window
  twelveMonth: 0.30, // Classic 12-month momentum
} as const;

/** Approximate trading days per month */
const TRADING_DAYS_PER_MONTH = 21;

/**
 * Minimum daily return observations required for a meaningful volatility estimate.
 * v5.1 uses 10. Below this, vol estimate is unreliable — fall back to raw return.
 */
const MIN_DAILY_RETURNS_FOR_VOL = 10;

// ─── Math Helpers ───────────────────────────────────────────────────────────

/**
 * Abramowitz & Stegun approximation to the standard normal CDF Φ(x).
 * Maximum error ≈ 7.5 × 10⁻⁸.
 * Identical to v5.1 scoring.js normalCDF and v6 scoring.ts normalCDF.
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const y =
    1.0 -
    (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) *
      Math.exp(-0.5 * absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate momentum returns for a single fund from its price history.
 *
 * Computes multi-window returns (§2.5.1) and extracts daily returns for
 * volatility calculation (§2.5.2). The actual vol adjustment and z-score
 * scoring happens in scoreMomentumCrossSectional() which needs all funds.
 *
 * @param ticker Fund ticker
 * @param prices Daily price history (sorted most-recent-first per FMP/Tiingo adapter)
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
      dailyReturns: [],
      hasData: false,
    };
  }

  // Sort by date descending (most recent first) if not already
  const sorted = [...prices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const currentPrice = sorted[0].adjClose || sorted[0].close;

  // Calculate returns for each lookback window (§2.5.1)
  const threeMonth = calculateReturn(sorted, currentPrice, 3);
  const sixMonth = calculateReturn(sorted, currentPrice, 6);
  const nineMonth = calculateReturn(sorted, currentPrice, 9);
  const twelveMonth = calculateReturn(sorted, currentPrice, 12);

  // Blend available windows (§2.5.1: renormalize if any window unavailable)
  const blendedReturn = blendReturns({
    threeMonth,
    sixMonth,
    nineMonth,
    twelveMonth,
  });

  // Extract daily returns for volatility calculation (§2.5.2)
  // Prices are sorted most-recent-first; daily returns need chronological order
  const dailyReturns = computeDailyReturns(sorted);

  return {
    ticker,
    returns: { threeMonth, sixMonth, nineMonth, twelveMonth },
    blendedReturn,
    dailyReturns,
    hasData: blendedReturn !== null,
  };
}

/**
 * Cross-sectional momentum scoring with volatility adjustment.
 *
 * Implements §2.5.2 (vol adjustment) and §2.5.3 (z-score + CDF):
 *   1. For each fund: vol_adjusted_return = blended_return / period_vol
 *   2. Z-standardize vol-adjusted returns across fund universe (Bessel-corrected)
 *   3. Winsorize z-scores to ±3 sigma
 *   4. Map through normal CDF to 0–100
 *
 * Ported from v5.1 scoring.js computeCrossSectionalMomentum(), adapted for
 * v6's multi-window architecture.
 *
 * Edge cases (§2.5.3):
 *   - < 2 funds with valid returns → all funds get 50 (neutral)
 *   - All returns identical (stdev = 0) → all funds get 50
 *   - Single fund with data → score 75
 *   - No price data for a fund → score 50 with dataQuality flag
 *
 * @param fundMomentums Momentum data for all funds in the menu
 */
export function scoreMomentumCrossSectional(
  fundMomentums: FundMomentum[]
): MomentumFactorResult {
  // Separate funds with and without data
  const withData = fundMomentums.filter(
    (m) => m.hasData && m.blendedReturn !== null
  );
  const withoutData = fundMomentums.filter(
    (m) => !m.hasData || m.blendedReturn === null
  );

  // Edge case: no data at all → all neutral (§2.5.3)
  if (withData.length === 0) {
    const scores: MomentumScore[] = fundMomentums.map((m) => ({
      ticker: m.ticker,
      score: 50,
      volAdjustedReturn: null,
      blendedReturn: null,
      returns: m.returns,
      rank: 1,
    }));
    return {
      scores,
      reasoning:
        'Momentum: No price data available for any fund. All scored at neutral 50.',
    };
  }

  // ── Step 1: Volatility adjustment (§2.5.2) ──────────────────────────────
  // For each fund, divide blended return by realized period volatility.
  // This ensures a fund with 12% return / 8% vol scores higher than
  // one with 15% return / 25% vol.
  //
  // Ported from v5.1: dailyVol = stdev(dailyReturns), Bessel-corrected
  //                   periodVol = dailyVol × √(number of daily observations)
  //                   volAdjustedReturn = blendedReturn / periodVol

  const volAdjustedByTicker: Map<
    string,
    { volAdjusted: number; blended: number }
  > = new Map();

  for (const m of withData) {
    const blended = m.blendedReturn!;
    let volAdjusted = blended; // fallback: use raw return if vol unavailable

    if (m.dailyReturns.length >= MIN_DAILY_RETURNS_FOR_VOL) {
      const n = m.dailyReturns.length;
      const mean = m.dailyReturns.reduce((a, b) => a + b, 0) / n;
      const variance =
        m.dailyReturns.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1); // Bessel
      const dailyVol = Math.sqrt(variance);

      if (dailyVol > 0) {
        const periodVol = dailyVol * Math.sqrt(n);
        volAdjusted = blended / periodVol; // risk-adjusted return (Sharpe-like)
      }
    }

    volAdjustedByTicker.set(m.ticker, { volAdjusted, blended });
  }

  // ── Step 2: Collect vol-adjusted returns for z-scoring ────────────────
  const validReturns: number[] = [];
  const tickersWithData: string[] = [];

  for (const m of withData) {
    const entry = volAdjustedByTicker.get(m.ticker);
    if (entry) {
      validReturns.push(entry.volAdjusted);
      tickersWithData.push(m.ticker);
    }
  }

  // Edge case: single fund with data → score 75 (§2.5.3)
  if (validReturns.length === 1) {
    const scores: MomentumScore[] = [];
    const m = withData[0];
    const entry = volAdjustedByTicker.get(m.ticker)!;
    scores.push({
      ticker: m.ticker,
      score: 75,
      volAdjustedReturn: entry.volAdjusted,
      blendedReturn: entry.blended,
      returns: m.returns,
      rank: 1,
    });
    for (const m2 of withoutData) {
      scores.push({
        ticker: m2.ticker,
        score: 50,
        volAdjustedReturn: null,
        blendedReturn: null,
        returns: m2.returns,
        rank: 2,
      });
    }
    return {
      scores,
      reasoning: `Momentum: Only 1 fund with data (${m.ticker}) — scored 75. ${withoutData.length} funds without data scored 50.`,
    };
  }

  // ── Step 3: Z-standardize (Bessel-corrected, §2.5.3) ─────────────────
  const mean = validReturns.reduce((a, b) => a + b, 0) / validReturns.length;
  const variance =
    validReturns.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
    (validReturns.length - 1); // Bessel correction (n-1)
  const stdev = Math.sqrt(variance);

  // Edge case: all identical returns (stdev = 0) → all get 50 (§2.5.3)
  if (stdev === 0) {
    const scores: MomentumScore[] = [];
    for (const m of withData) {
      const entry = volAdjustedByTicker.get(m.ticker)!;
      scores.push({
        ticker: m.ticker,
        score: 50,
        volAdjustedReturn: entry.volAdjusted,
        blendedReturn: entry.blended,
        returns: m.returns,
        rank: 1,
      });
    }
    for (const m of withoutData) {
      scores.push({
        ticker: m.ticker,
        score: 50,
        volAdjustedReturn: null,
        blendedReturn: null,
        returns: m.returns,
        rank: withData.length + 1,
      });
    }
    return {
      scores,
      reasoning:
        'Momentum: All funds have identical vol-adjusted returns. All scored at 50.',
    };
  }

  // ── Step 4: Z-score → winsorize ±3 → CDF → 0–100 (§2.5.3) ───────────
  // Ported from v5.1: z = (val - mean) / stdev, clamp [-3, 3],
  // then 100 × Φ(z) for v6's 0–100 scale (v5.1 used 1 + 9 × Φ(z) for 1–10)

  interface ScoredFund {
    ticker: string;
    score: number;
    volAdjusted: number;
    blended: number;
    returns: FundMomentum['returns'];
  }

  const scored: ScoredFund[] = [];

  for (let i = 0; i < tickersWithData.length; i++) {
    const ticker = tickersWithData[i];
    const entry = volAdjustedByTicker.get(ticker)!;
    const fundData = withData.find((m) => m.ticker === ticker)!;

    const z = (entry.volAdjusted - mean) / stdev;
    const zWinsorized = Math.min(3, Math.max(-3, z)); // clamp ±3 sigma
    const score = Math.round(100 * normalCDF(zWinsorized));

    scored.push({
      ticker,
      score: Math.max(0, Math.min(100, score)),
      volAdjusted: entry.volAdjusted,
      blended: entry.blended,
      returns: fundData.returns,
    });
  }

  // Sort by score descending for ranking
  scored.sort((a, b) => b.score - a.score);

  const scores: MomentumScore[] = [];

  for (let i = 0; i < scored.length; i++) {
    const s = scored[i];
    scores.push({
      ticker: s.ticker,
      score: s.score,
      volAdjustedReturn: s.volAdjusted,
      blendedReturn: s.blended,
      returns: s.returns,
      rank: i + 1,
    });
  }

  // Add neutral scores for funds without data
  for (const m of withoutData) {
    scores.push({
      ticker: m.ticker,
      score: 50,
      volAdjustedReturn: null,
      blendedReturn: null,
      returns: m.returns,
      rank: scored.length + 1,
    });
  }

  const best = scored[0];
  const bestPct = best.blended ? (best.blended * 100).toFixed(1) : '?';

  return {
    scores,
    reasoning:
      `Momentum: Vol-adjusted z-score + CDF scoring for ${withData.length} funds. ` +
      `Best: ${best.ticker} (${bestPct}% blended return, vol-adj=${best.volAdjusted.toFixed(3)}). ` +
      `${withoutData.length} funds had no price data.`,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Calculate the return over a lookback window (§2.5.1).
 *
 * Window tolerance: ±5 trading days around the target lookback (§2.5.1).
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

  // Use a window around the target index to handle weekends/holidays (§2.5.1: ±5 tolerance)
  const windowEnd = Math.min(sortedPrices.length - 1, targetIndex + 5);
  const pastPrice = sortedPrices[Math.min(targetIndex, windowEnd)];

  const pastClose = pastPrice.adjClose || pastPrice.close;

  if (pastClose <= 0 || currentPrice <= 0) return null;

  return (currentPrice - pastClose) / pastClose;
}

/**
 * Compute daily returns from price history for volatility calculation (§2.5.2).
 *
 * Prices come in most-recent-first order. We need chronological order for
 * day-over-day fractional changes: (close[i] - close[i-1]) / close[i-1].
 *
 * Ported from v5.1 tiingo.js extractReturns().
 *
 * @param sortedPrices Prices sorted most-recent-first
 * @returns Array of day-over-day fractional returns (chronological order)
 */
function computeDailyReturns(sortedPrices: FmpDailyPrice[]): number[] {
  if (sortedPrices.length < 2) return [];

  // Reverse to chronological (oldest first)
  const chronological = [...sortedPrices].reverse();

  const closes = chronological
    .map((p) => p.adjClose || p.close)
    .filter((v) => v != null && v > 0);

  if (closes.length < 2) return [];

  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  return dailyReturns;
}

/**
 * Blend multiple return windows into a single momentum signal (§2.5.1).
 *
 * Uses configured weights, redistributing proportionally to available
 * windows when any window has insufficient data.
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
    windows.push({
      value: returns.twelveMonth,
      weight: WINDOW_WEIGHTS.twelveMonth,
    });
  }

  if (windows.length === 0) return null;

  // Normalize weights so they sum to 1.0 (§2.5.1: renormalize if any unavailable)
  const totalWeight = windows.reduce((sum, w) => sum + w.weight, 0);
  let blended = 0;
  for (const w of windows) {
    blended += w.value * (w.weight / totalWeight);
  }

  return blended;
}
