/**
 * FundLens v6 — Holdings Quality Factor
 *
 * Evaluates the financial health of the companies inside a fund.
 * Uses 25+ financial ratios from FMP, grouped into five quality
 * dimensions, then aggregated into a single fund-level score
 * weighted by each holding's position size.
 *
 * Quality dimensions (each scored 0–100, then averaged):
 *   1. Profitability    — Is the company making money efficiently?
 *   2. Balance Sheet    — Is the company financially stable?
 *   3. Cash Flow        — Does the company generate real cash?
 *   4. Earnings Quality — Are earnings sustainable and growing?
 *   5. Valuation        — Is the stock reasonably priced?
 *
 * Fund-level aggregation:
 *   Each holding's quality score is weighted by its pctOfNav.
 *   Sum(score_i × weight_i) / Sum(weight_i) = fund quality score
 *
 * Weight: 30% of composite (DEFAULT_FACTOR_WEIGHTS.holdingsQuality)
 *
 * Session 3 deliverable. References: Master Reference §4 (Holdings Quality).
 */

import { FmpRatios, FmpKeyMetrics } from './fmp.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Quality score for a single holding (company) */
export interface HoldingQualityScore {
  ticker: string;
  name: string;
  /** Position weight in the fund (0.0–1.0) */
  weight: number;
  /** Overall quality score for this holding (0–100) */
  compositeScore: number;
  /** Breakdown by dimension */
  dimensions: {
    profitability: DimensionScore;
    balanceSheet: DimensionScore;
    cashFlow: DimensionScore;
    earningsQuality: DimensionScore;
    valuation: DimensionScore;
  };
  /** Number of ratios that had data (out of 25+) */
  ratiosAvailable: number;
  /** Total ratios attempted */
  ratiosAttempted: number;
}

/** Score for a single quality dimension */
export interface DimensionScore {
  score: number;
  /** Individual ratio scores within this dimension */
  ratios: RatioScore[];
}

/** Score for a single financial ratio */
export interface RatioScore {
  name: string;
  value: number | null;
  score: number;
  /** Weight of this ratio within its dimension */
  weight: number;
}

/** Fund-level quality result */
export interface QualityFactorResult {
  /** Fund-level quality score (0–100), weighted by position size */
  score: number;
  /** Per-holding breakdown */
  holdingScores: HoldingQualityScore[];
  /** Holdings that couldn't be scored (no FMP data) */
  unscoredHoldings: Array<{ ticker: string | null; name: string; reason: string }>;
  /** Human-readable summary */
  reasoning: string;
}

// ─── Dimension Weights ──────────────────────────────────────────────────────
// How much each dimension contributes to the holding's overall quality score.

const DIMENSION_WEIGHTS = {
  profitability: 0.25,
  balanceSheet: 0.20,
  cashFlow: 0.20,
  earningsQuality: 0.15,
  valuation: 0.20,
} as const;

// ─── Ratio Scoring Functions ────────────────────────────────────────────────
// Each function takes a raw ratio value and returns a 0–100 score.
// Higher is better. The thresholds are calibrated against S&P 500
// median values and represent what "good" looks like for a typical
// large-cap company. Small/mid-cap will naturally cluster differently,
// but these thresholds still produce meaningful relative rankings.

// ── Profitability ──

function scoreGrossProfitMargin(val: number | null): number {
  if (val == null) return -1;
  // Great: > 50%, Good: 30–50%, Fair: 15–30%, Poor: < 15%
  return clampScore(linearScore(val, 0.05, 0.60));
}

function scoreOperatingMargin(val: number | null): number {
  if (val == null) return -1;
  // Great: > 25%, Good: 15–25%, Fair: 5–15%, Poor: < 5%
  return clampScore(linearScore(val, -0.05, 0.35));
}

function scoreNetProfitMargin(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, -0.05, 0.25));
}

function scoreROE(val: number | null): number {
  if (val == null) return -1;
  // Great: > 20%, Good: 12–20%, Fair: 5–12%, Poor: < 5%
  // Cap at 50% — extremely high ROE often means high leverage, not quality
  const capped = Math.min(val, 0.50);
  return clampScore(linearScore(capped, 0, 0.30));
}

function scoreROA(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, 0, 0.15));
}

function scoreROIC(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, 0, 0.25));
}

// ── Balance Sheet ──

function scoreCurrentRatio(val: number | null): number {
  if (val == null) return -1;
  // Sweet spot is 1.5–3.0. Below 1.0 is dangerous. Above 5.0 is idle capital.
  if (val < 0.5) return 5;
  if (val < 1.0) return linearScore(val, 0.5, 1.0) * 40;
  if (val <= 3.0) return 40 + linearScore(val, 1.0, 2.0) * 60;
  if (val <= 5.0) return 100 - linearScore(val, 3.0, 5.0) * 20;
  return 70; // Very high current ratio — not ideal but not terrible
}

function scoreDebtToEquity(val: number | null): number {
  if (val == null) return -1;
  // Lower is better. < 0.5 excellent, 0.5–1.0 good, 1.0–2.0 fair, > 2.0 risky
  if (val < 0) return 30; // Negative equity — problematic
  return clampScore(100 - linearScore(val, 0, 3.0) * 100);
}

function scoreInterestCoverage(val: number | null): number {
  if (val == null) return -1;
  // > 10x excellent, 5–10x good, 2–5x fair, < 2x dangerous
  if (val < 0) return 10;
  return clampScore(linearScore(val, 0, 15));
}

function scoreDebtToAssets(val: number | null): number {
  if (val == null) return -1;
  // Lower is better. < 0.2 excellent, 0.2–0.4 good, 0.4–0.6 fair, > 0.6 risky
  return clampScore(100 - linearScore(val, 0, 0.8) * 100);
}

function scoreQuickRatio(val: number | null): number {
  if (val == null) return -1;
  if (val < 0.5) return linearScore(val, 0, 0.5) * 30;
  if (val <= 2.0) return 30 + linearScore(val, 0.5, 1.5) * 70;
  return 90; // Above 2.0 is solid
}

// ── Cash Flow ──

function scoreFreeCashFlowYield(val: number | null): number {
  if (val == null) return -1;
  // Positive FCF yield is good. > 8% excellent, 4–8% good, 0–4% fair, negative = bad
  if (val < 0) return Math.max(0, 20 + val * 200); // Penalize negative
  return clampScore(linearScore(val, 0, 0.12));
}

function scoreOperatingCFPerShare(val: number | null): number {
  if (val == null) return -1;
  // Positive is good, higher is better (but this is absolute, so normalize loosely)
  if (val <= 0) return 10;
  return clampScore(linearScore(val, 0, 15));
}

function scoreFreeCashFlowPerShare(val: number | null): number {
  if (val == null) return -1;
  if (val <= 0) return 10;
  return clampScore(linearScore(val, 0, 10));
}

function scoreCashPerShare(val: number | null): number {
  if (val == null) return -1;
  if (val <= 0) return 10;
  return clampScore(linearScore(val, 0, 20));
}

function scoreIncomeQuality(val: number | null): number {
  if (val == null) return -1;
  // Income quality = OCF / Net Income. > 1.0 means cash backs up earnings.
  // Sweet spot: 1.0–1.5. Below 0.5 means earnings aren't cash-backed.
  if (val < 0) return 10;
  if (val <= 0.5) return linearScore(val, 0, 0.5) * 40;
  if (val <= 1.5) return 40 + linearScore(val, 0.5, 1.2) * 60;
  return 90; // Very high — cash generation exceeds reported earnings
}

// ── Earnings Quality ──

function scoreEarningsYield(val: number | null): number {
  if (val == null) return -1;
  // Earnings yield = E/P. Higher = cheaper + profitable. > 8% great, < 2% expensive
  if (val < 0) return 15; // Negative earnings
  return clampScore(linearScore(val, 0, 0.12));
}

function scoreDividendYield(val: number | null): number {
  if (val == null) return -1;
  // 0% isn't bad for growth companies. > 5% might signal distress. Sweet spot 1–4%.
  if (val <= 0) return 40; // No dividend — neutral for growth stocks
  if (val <= 0.04) return 40 + linearScore(val, 0, 0.04) * 60;
  if (val <= 0.08) return 100 - linearScore(val, 0.04, 0.08) * 30;
  return 50; // Very high yield — potential value trap
}

function scorePayoutRatio(val: number | null): number {
  if (val == null) return -1;
  // 0–60% sustainable, 60–80% high, > 80% risky, > 100% unsustainable
  if (val < 0) return 30; // Negative — paying dividend despite losses
  if (val <= 0.60) return 70 + linearScore(val, 0, 0.60) * 30;
  if (val <= 0.80) return 70 - linearScore(val, 0.60, 0.80) * 20;
  if (val <= 1.0) return 50 - linearScore(val, 0.80, 1.0) * 25;
  return 15; // Payout > 100% — unsustainable
}

function scoreRevenuePerShare(val: number | null): number {
  if (val == null) return -1;
  if (val <= 0) return 10;
  return clampScore(linearScore(val, 0, 100));
}

function scoreBookValuePerShare(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10; // Negative book value
  return clampScore(linearScore(val, 0, 60));
}

// ── Valuation ──

function scorePE(val: number | null): number {
  if (val == null) return -1;
  // Lower is cheaper. < 12 cheap, 12–18 fair, 18–30 growth premium, > 30 expensive
  // Negative PE (losses) is bad
  if (val < 0) return 15;
  if (val <= 25) return clampScore(100 - linearScore(val, 5, 25) * 60);
  if (val <= 50) return clampScore(40 - linearScore(val, 25, 50) * 30);
  return 5; // Very high PE
}

function scorePB(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10;
  // < 1.5 cheap, 1.5–3 fair, 3–6 growth premium, > 6 expensive
  return clampScore(100 - linearScore(val, 0.5, 8) * 100);
}

function scorePriceToSales(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10;
  return clampScore(100 - linearScore(val, 0.5, 12) * 100);
}

function scoreEVtoEBITDA(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 20;
  // < 8 cheap, 8–14 fair, 14–25 growth, > 25 expensive
  return clampScore(100 - linearScore(val, 4, 30) * 100);
}

function scorePriceToCashFlow(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 15;
  return clampScore(100 - linearScore(val, 3, 30) * 100);
}

// ─── Dimension Assembly ─────────────────────────────────────────────────────

/**
 * Score all ratios for a single holding and produce per-dimension scores.
 * Ratios that return -1 (no data) are excluded from the dimension average.
 */
export function scoreHolding(
  ticker: string,
  name: string,
  weight: number,
  ratios: FmpRatios | null,
  keyMetrics: FmpKeyMetrics | null
): HoldingQualityScore {
  let ratiosAttempted = 0;
  let ratiosAvailable = 0;

  function track(score: number): number {
    ratiosAttempted++;
    if (score >= 0) ratiosAvailable++;
    return score;
  }

  // ── Profitability dimension ──
  const profRatios: RatioScore[] = [
    { name: 'Gross Profit Margin', value: ratios?.grossProfitMargin ?? null, score: track(scoreGrossProfitMargin(ratios?.grossProfitMargin ?? null)), weight: 0.15 },
    { name: 'Operating Margin', value: ratios?.operatingProfitMargin ?? null, score: track(scoreOperatingMargin(ratios?.operatingProfitMargin ?? null)), weight: 0.20 },
    { name: 'Net Profit Margin', value: ratios?.netProfitMargin ?? null, score: track(scoreNetProfitMargin(ratios?.netProfitMargin ?? null)), weight: 0.15 },
    { name: 'Return on Equity', value: ratios?.returnOnEquity ?? null, score: track(scoreROE(ratios?.returnOnEquity ?? null)), weight: 0.20 },
    { name: 'Return on Assets', value: ratios?.returnOnAssets ?? null, score: track(scoreROA(ratios?.returnOnAssets ?? null)), weight: 0.15 },
    { name: 'Return on Invested Capital', value: keyMetrics?.roic ?? null, score: track(scoreROIC(keyMetrics?.roic ?? null)), weight: 0.15 },
  ];

  // ── Balance Sheet dimension ──
  const bsRatios: RatioScore[] = [
    { name: 'Current Ratio', value: ratios?.currentRatio ?? null, score: track(scoreCurrentRatio(ratios?.currentRatio ?? null)), weight: 0.20 },
    { name: 'Quick Ratio', value: ratios?.quickRatio ?? null, score: track(scoreQuickRatio(ratios?.quickRatio ?? null)), weight: 0.15 },
    { name: 'Debt to Equity', value: ratios?.debtEquityRatio ?? null, score: track(scoreDebtToEquity(ratios?.debtEquityRatio ?? null)), weight: 0.25 },
    { name: 'Debt to Assets', value: keyMetrics?.debtToAssets ?? null, score: track(scoreDebtToAssets(keyMetrics?.debtToAssets ?? null)), weight: 0.20 },
    { name: 'Interest Coverage', value: ratios?.interestCoverage ?? null, score: track(scoreInterestCoverage(ratios?.interestCoverage ?? null)), weight: 0.20 },
  ];

  // ── Cash Flow dimension ──
  const cfRatios: RatioScore[] = [
    { name: 'Free Cash Flow Yield', value: keyMetrics?.freeCashFlowYield ?? null, score: track(scoreFreeCashFlowYield(keyMetrics?.freeCashFlowYield ?? null)), weight: 0.25 },
    { name: 'Operating CF per Share', value: keyMetrics?.operatingCashFlowPerShare ?? null, score: track(scoreOperatingCFPerShare(keyMetrics?.operatingCashFlowPerShare ?? null)), weight: 0.20 },
    { name: 'Free CF per Share', value: keyMetrics?.freeCashFlowPerShare ?? null, score: track(scoreFreeCashFlowPerShare(keyMetrics?.freeCashFlowPerShare ?? null)), weight: 0.20 },
    { name: 'Cash per Share', value: keyMetrics?.cashPerShare ?? null, score: track(scoreCashPerShare(keyMetrics?.cashPerShare ?? null)), weight: 0.15 },
    { name: 'Income Quality', value: keyMetrics?.incomeQuality ?? null, score: track(scoreIncomeQuality(keyMetrics?.incomeQuality ?? null)), weight: 0.20 },
  ];

  // ── Earnings Quality dimension ──
  const eqRatios: RatioScore[] = [
    { name: 'Earnings Yield', value: keyMetrics?.earningsYield ?? null, score: track(scoreEarningsYield(keyMetrics?.earningsYield ?? null)), weight: 0.25 },
    { name: 'Dividend Yield', value: ratios?.dividendYield ?? null, score: track(scoreDividendYield(ratios?.dividendYield ?? null)), weight: 0.20 },
    { name: 'Payout Ratio', value: ratios?.payoutRatio ?? null, score: track(scorePayoutRatio(ratios?.payoutRatio ?? null)), weight: 0.20 },
    { name: 'Revenue per Share', value: keyMetrics?.revenuePerShare ?? null, score: track(scoreRevenuePerShare(keyMetrics?.revenuePerShare ?? null)), weight: 0.15 },
    { name: 'Book Value per Share', value: keyMetrics?.bookValuePerShare ?? null, score: track(scoreBookValuePerShare(keyMetrics?.bookValuePerShare ?? null)), weight: 0.20 },
  ];

  // ── Valuation dimension ──
  const valRatios: RatioScore[] = [
    { name: 'P/E Ratio', value: ratios?.priceEarningsRatio ?? null, score: track(scorePE(ratios?.priceEarningsRatio ?? null)), weight: 0.25 },
    { name: 'P/B Ratio', value: ratios?.priceToBookRatio ?? null, score: track(scorePB(ratios?.priceToBookRatio ?? null)), weight: 0.20 },
    { name: 'Price to Sales', value: ratios?.priceToSalesRatio ?? null, score: track(scorePriceToSales(ratios?.priceToSalesRatio ?? null)), weight: 0.20 },
    { name: 'EV/EBITDA', value: ratios?.enterpriseValueMultiple ?? null, score: track(scoreEVtoEBITDA(ratios?.enterpriseValueMultiple ?? null)), weight: 0.20 },
    { name: 'Price to Cash Flow', value: ratios?.priceCashFlowRatio ?? null, score: track(scorePriceToCashFlow(ratios?.priceCashFlowRatio ?? null)), weight: 0.15 },
  ];

  const dimensions = {
    profitability: aggregateDimension(profRatios),
    balanceSheet: aggregateDimension(bsRatios),
    cashFlow: aggregateDimension(cfRatios),
    earningsQuality: aggregateDimension(eqRatios),
    valuation: aggregateDimension(valRatios),
  };

  // Weighted composite across dimensions
  const compositeScore = Math.round(
    dimensions.profitability.score * DIMENSION_WEIGHTS.profitability +
    dimensions.balanceSheet.score * DIMENSION_WEIGHTS.balanceSheet +
    dimensions.cashFlow.score * DIMENSION_WEIGHTS.cashFlow +
    dimensions.earningsQuality.score * DIMENSION_WEIGHTS.earningsQuality +
    dimensions.valuation.score * DIMENSION_WEIGHTS.valuation
  );

  return {
    ticker,
    name,
    weight,
    compositeScore,
    dimensions,
    ratiosAvailable,
    ratiosAttempted,
  };
}

/**
 * Score the Holdings Quality factor for an entire fund.
 *
 * Takes pre-fetched fundamentals for each holding (fetched via fmp.ts)
 * and produces a weighted-average quality score.
 *
 * @param holdings Array of { ticker, name, weight, ratios, keyMetrics }
 */
export function scoreQualityFactor(
  holdings: Array<{
    ticker: string | null;
    name: string;
    weight: number;
    ratios: FmpRatios | null;
    keyMetrics: FmpKeyMetrics | null;
  }>
): QualityFactorResult {
  const holdingScores: HoldingQualityScore[] = [];
  const unscoredHoldings: Array<{ ticker: string | null; name: string; reason: string }> = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const h of holdings) {
    // Skip holdings without a ticker — can't look up fundamentals
    if (!h.ticker) {
      unscoredHoldings.push({
        ticker: h.ticker,
        name: h.name,
        reason: 'No ticker — CUSIP resolution failed',
      });
      continue;
    }

    // Skip holdings with no fundamental data at all
    if (!h.ratios && !h.keyMetrics) {
      unscoredHoldings.push({
        ticker: h.ticker,
        name: h.name,
        reason: 'No FMP fundamental data available',
      });
      continue;
    }

    const scored = scoreHolding(
      h.ticker,
      h.name,
      h.weight,
      h.ratios,
      h.keyMetrics
    );

    holdingScores.push(scored);
    weightedSum += scored.compositeScore * h.weight;
    totalWeight += h.weight;
  }

  // Weighted average quality score for the fund
  const fundScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  const scoredPct = totalWeight > 0
    ? ((totalWeight / holdings.reduce((s, h) => s + h.weight, 0)) * 100).toFixed(0)
    : '0';

  return {
    score: fundScore,
    holdingScores,
    unscoredHoldings,
    reasoning:
      `Holdings Quality: ${fundScore}/100 based on ${holdingScores.length} holdings ` +
      `(${scoredPct}% of fund weight scored). ` +
      `${unscoredHoldings.length} holdings could not be scored.`,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Aggregate ratio scores within a dimension using weighted average.
 * Ratios with score -1 (missing data) are excluded from the average.
 */
function aggregateDimension(ratios: RatioScore[]): DimensionScore {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of ratios) {
    if (r.score >= 0) {
      weightedSum += r.score * r.weight;
      totalWeight += r.weight;
    }
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  return { score, ratios };
}

/**
 * Simple linear mapping: value at `low` maps to score 0, value at `high` maps to 100.
 * Returns raw value (not clamped) — caller should clamp.
 */
function linearScore(val: number, low: number, high: number): number {
  if (high === low) return 50;
  return ((val - low) / (high - low)) * 100;
}

/** Clamp a score to 0–100. */
function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
