/**
 * FundLens — Full-tier score derivation (U1-B)
 *
 * The evaluative math FundLens.tsx carried, re-homed ahead of that page's
 * retirement (U1 WAVE U1-B: "FundLens.tsx retires"). Two surfaces read it
 * now — the unified Funds grid's score/tier columns and the fund detail's
 * Scores tab — and both must show the same number for the same fund, which
 * is the whole reason it lives in one file instead of two.
 *
 * Carried VERBATIM from client/src/pages/FundLens.tsx: normalCDF's
 * Abramowitz–Stegun erf coefficients, the 0.6745 MAD consistency constant,
 * the five §6.3 tier bands and their hex colors, the median/MAD pair, the
 * money-market short circuit, and the score badge's background/foreground
 * ramps. No threshold, coefficient, or color is altered — a re-home that
 * changed a number would silently restate every fund's standing.
 *
 * THIS FILE IS FULL-TIER ONLY, by data rather than by decree. It consumes
 * FundScore.z_* and composite fields, which the B2 allowlist
 * (src/engine/reference-shape.ts) never emits to a reference account: that
 * payload has no z-scores, no composite, and no tier. A reference caller
 * therefore reaches these functions with nothing to feed them. The fence is
 * the server's, and it is untouched.
 *
 * Weighting note: the composite is the CALLER'S OWN weighted view (the
 * profile's four factor weights), not composite_default — which is what
 * FundLens showed and what Your Brief and Research still show. Re-homing
 * the server's default instead would have quietly changed the number on
 * screen for every account that ever moved a weight slider.
 *
 * Destination: client/src/engine/full-tier-scores.ts
 */

import type { FundScore } from '../api';
import { MONEY_MARKET_TICKERS } from '../pages/reference/constants';
import { theme } from '../theme';

// ─── The user's factor weights ─────────────────────────────────────────────

export interface FactorWeights {
  cost: number;
  quality: number;
  positioning: number;
  momentum: number;
}

/** The profile defaults, matching Settings' "Reset to Defaults" */
export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  cost: 0.25,
  quality: 0.30,
  positioning: 0.20,
  momentum: 0.25,
};

// ─── Statistics (verbatim from FundLens.tsx) ───────────────────────────────

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const absZ = Math.abs(z);
  const x = absZ / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);
  const result = 0.5 * (1.0 + erf);
  return z >= 0 ? result : 1.0 - result;
}

const MAD_CONSISTENCY = 0.6745;

const TIER_BADGES = [
  { tier: 'Top Pick', zMin: 2.0, color: '#F59E0B' },
  { tier: 'Strong',   zMin: 1.2, color: '#10B981' },
  { tier: 'Solid',    zMin: 0.3, color: '#3B82F6' },
  { tier: 'Neutral',  zMin: -0.5, color: '#6B7280' },
  { tier: 'Weak',     zMin: -Infinity, color: '#EF4444' },
] as const;

function clientMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function computeClientTier(
  ticker: string,
  composite: number,
  allComposites: { ticker: string; composite: number }[],
): { tier: string; tierColor: string } {
  if (MONEY_MARKET_TICKERS.has(ticker)) return { tier: 'MM', tierColor: '#4B5563' };
  const nonMM = allComposites.filter(f => !MONEY_MARKET_TICKERS.has(f.ticker));
  if (nonMM.length === 0) return { tier: 'Neutral', tierColor: '#6B7280' };
  const scores = nonMM.map(f => f.composite);
  const med = clientMedian(scores);
  const mad = clientMedian(scores.map(s => Math.abs(s - med)));
  const safeMad = mad > 0 ? mad : 1e-9;
  const modZ = MAD_CONSISTENCY * (composite - med) / safeMad;
  for (const badge of TIER_BADGES) {
    if (modZ >= badge.zMin) return { tier: badge.tier, tierColor: badge.color };
  }
  return { tier: 'Weak', tierColor: '#EF4444' };
}

// ─── Badge presentation (verbatim from FundLens.tsx) ───────────────────────

export function scoreBg(score: number): string {
  if (score >= 75) return '#22c55e22';
  if (score >= 50) return '#3b82f622';
  if (score >= 25) return '#f59e0b22';
  return '#ef444422';
}

export function scoreColor(score: number): string {
  if (score >= 75) return theme.colors.success;
  if (score >= 50) return theme.colors.accentBlue;
  if (score >= 25) return theme.colors.warning;
  return theme.colors.error;
}

// ─── The derived view, one row per fund ────────────────────────────────────

export interface FullTierScore {
  ticker: string;
  /** The caller's own weighted composite, 0–100 */
  composite: number;
  /** §6.3 tier label — 'MM' for the money markets, which never rank */
  tier: string;
  tierColor: string;
  /** The score row itself, for surfaces that need factor_details */
  score: FundScore;
}

/**
 * Derive every fund's weighted composite and tier from one /api/scores
 * payload, keyed by ticker so the caller can join it against the
 * reference-shaped facts row for the same fund.
 *
 * The tier is a standing OF THE SET, so it is computed once across all
 * funds — never per row. Money markets are excluded from the median/MAD
 * population before it is measured, exactly as FundLens did.
 */
export function deriveFullTierScores(
  scores: FundScore[],
  weights: FactorWeights,
): Map<string, FullTierScore> {
  const withComposites = scores.map(s => {
    const zComposite =
      (s.z_cost_efficiency ?? 0) * weights.cost +
      (s.z_holdings_quality ?? 0) * weights.quality +
      (s.z_positioning ?? 0) * weights.positioning +
      (s.z_momentum ?? 0) * weights.momentum;
    const composite = Math.round(Math.max(0, Math.min(100, 100 * normalCDF(zComposite))));
    return { score: s, ticker: s.funds?.ticker || s.fund_id, composite };
  });

  const allComposites = withComposites.map(s => ({ ticker: s.ticker, composite: s.composite }));

  const byTicker = new Map<string, FullTierScore>();
  for (const row of withComposites) {
    const { tier, tierColor } = computeClientTier(row.ticker, row.composite, allComposites);
    byTicker.set(row.ticker, {
      ticker: row.ticker,
      composite: row.composite,
      tier,
      tierColor,
      score: row.score,
    });
  }
  return byTicker;
}
