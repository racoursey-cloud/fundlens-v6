/**
 * FundLens v6 — Holdings Quality Factor (§2.4)
 *
 * Evaluates the financial health of the companies/issuers inside a fund.
 *
 * Three scoring paths by holding type (ported from v5.1 quality.js):
 *   Equity → 25+ financial ratios across 5 dimensions (v6 model, richer than v5.1 Piotroski-lite)
 *   Bond   → Issuer category quality map + distressed adjustments (§2.4.2, ported from v5.1)
 *   Blended → Weighted average by equity/bond portfolio share (§2.4.3)
 *
 * Coverage-based confidence scaling (§2.4.1, Grinold 1989):
 *   When coverage_pct < 0.40, quality weight is reduced proportionally
 *   (floor at 10% of base weight). Freed weight → momentum.
 *   Returns coverage_pct so pipeline can adjust per-fund weights.
 *
 * Weight: 30% of composite (DEFAULT_FACTOR_WEIGHTS.holdingsQuality)
 *
 * Session 5: MISSING-2 (bond scoring) + MISSING-3 (coverage scaling).
 * References: FUNDLENS_SPEC.md §2.4.1, §2.4.2, §2.4.3, §2.4.4.
 */

import { FmpRatios, FmpKeyMetrics } from './fmp.js';
import { EdgarHolding } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Quality score for a single equity holding (company) */
export interface HoldingQualityScore {
  ticker: string;
  name: string;
  /** Position weight in the fund (pctOfNav) */
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
  /** Per-holding breakdown (equity holdings) */
  holdingScores: HoldingQualityScore[];
  /** Holdings that couldn't be scored (no FMP data) */
  unscoredHoldings: Array<{ ticker: string | null; name: string; reason: string }>;
  /** Human-readable summary */
  reasoning: string;
  /** Coverage: fraction of fund weight that was successfully scored (0.0–1.0) */
  coveragePct: number;
  /** Ratio of equity weight to total weight */
  equityRatio: number;
  /** Ratio of bond weight to total weight */
  bondRatio: number;
  /** True when score is a synthetic neutral (no real data available) */
  isFallback?: boolean;
}

/** Input for a single holding to be quality-scored */
export interface QualityHoldingInput {
  ticker: string | null;
  name: string;
  /** Position weight (pctOfNav from EdgarHolding) */
  weight: number;
  ratios: FmpRatios | null;
  keyMetrics: FmpKeyMetrics | null;
  /** Raw EdgarHolding for bond scoring (issuerCategory, isDebt, etc.) */
  edgarHolding?: EdgarHolding | null;
}

// ─── Bond Quality Constants (§2.4.2, ported from v5.1 scoring.js) ──────────

/**
 * Issuer Category Quality Map (§2.4.2).
 * Maps NPORT-P issuerCat codes to quality scores (0.0–1.0 scale).
 * Ported from v5.1 quality.js ISSUER_CAT_QUALITY.
 */
const ISSUER_CAT_QUALITY: Record<string, number> = {
  UST: 1.0, // US Treasury → AAA equivalent
  USG: 0.95, // US Government agency → AA equivalent
  MUN: 0.8, // Municipal → A equivalent
  CORP: 0.6, // Corporate (no distress) → BBB equivalent
};

/** Fallback for unrecognized issuerCat values */
const ISSUER_CAT_DEFAULT = 0.5;

// ─── Dimension Weights ──────────────────────────────────────────────────────
// How much each dimension contributes to the holding's overall quality score.

const DIMENSION_WEIGHTS = {
  profitability: 0.25,
  balanceSheet: 0.2,
  cashFlow: 0.2,
  earningsQuality: 0.15,
  valuation: 0.2,
} as const;

// ─── Bond Scoring (§2.4.2) ─────────────────────────────────────────────────

/**
 * Scores a single bond holding using issuerCat + distressed adjustments (§2.4.2).
 * Returns a 0.0–1.0 quality score.
 *
 * Ported from v5.1 quality.js scoreBondHolding().
 *
 * Distressed adjustments:
 *   isDefault = 'Y' → 0.10
 *   fairValLevel = '3' → 0.35 (for CORP or unknown issuer)
 *   debtInArrears = 'Y' → 0.35 (for CORP or unknown issuer)
 */
function scoreBondHolding(holding: EdgarHolding): number {
  const cat = (holding.issuerCategory || '').toUpperCase().trim();

  // Distressed: isDefault = 'Y' → worst quality regardless of issuer
  if (holding.debtIsDefault === 'Y') return 0.1;

  // Corporate or unknown with Level 3 fair value or interest in arrears
  // → below investment grade proxy
  if (cat === 'CORP' || cat === 'CORPORATE' || cat === '') {
    const fairVal = (holding.fairValLevel || '').trim();
    if (fairVal === '3' || holding.debtInArrears === 'Y') return 0.35;
  }

  // Look up issuerCat in quality map, normalize common variants
  const normalized = cat
    .replace(/^US\s*TREASURY$/i, 'UST')
    .replace(/^US\s*GOVERNMENT$/i, 'USG')
    .replace(/^MUNICIPAL$/i, 'MUN')
    .replace(/^CORPORATE$/i, 'CORP');

  return ISSUER_CAT_QUALITY[normalized] ?? ISSUER_CAT_DEFAULT;
}

/**
 * Determines if a holding should be scored as a bond/debt security.
 * Uses the isDebt flag from edgar.ts (parsed from <debtSec> element) and
 * asset category codes as fallback.
 */
function isBondHolding(holding: EdgarHolding): boolean {
  if (holding.isDebt) return true;
  const at = (holding.assetCategory || '').toUpperCase();
  return at === 'DBT' || at === 'ABS';
}

/**
 * Determines if a holding is an equity security.
 * Equity = not debt, not a fund, has a meaningful asset category or ticker.
 */
function isEquityHolding(holding: EdgarHolding): boolean {
  if (holding.isDebt) return false;
  if (holding.isInvestmentCompany) return false;
  const at = (holding.assetCategory || '').toUpperCase();
  if (at === 'EC' || at === 'EP') return true; // equity common, equity preferred
  if (at === 'DBT' || at === 'ABS' || at === 'STIV' || at === 'RF') return false;
  // Fallback: if it has an issuerCategory that's clearly bond-like, treat as bond
  const ic = (holding.issuerCategory || '').toUpperCase();
  if (ic === 'UST' || ic === 'USG' || ic === 'MUN') return false;
  // Default: treat as equity if no explicit bond markers
  return true;
}

// ─── Ratio Scoring Functions ────────────────────────────────────────────────
// Each function takes a raw ratio value and returns a 0–100 score.
// Higher is better. The thresholds are calibrated against S&P 500
// median values and represent what "good" looks like for a typical
// large-cap company. Small/mid-cap will naturally cluster differently,
// but these thresholds still produce meaningful relative rankings.

// ── Profitability ──

function scoreGrossProfitMargin(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, 0.05, 0.6));
}

function scoreOperatingMargin(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, -0.05, 0.35));
}

function scoreNetProfitMargin(val: number | null): number {
  if (val == null) return -1;
  return clampScore(linearScore(val, -0.05, 0.25));
}

function scoreROE(val: number | null): number {
  if (val == null) return -1;
  // Cap at 50% — extremely high ROE often means high leverage, not quality
  const capped = Math.min(val, 0.5);
  return clampScore(linearScore(capped, 0, 0.3));
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
  if (val < 0.5) return 5;
  if (val < 1.0) return clampScore(linearScore(val, 0.5, 1.0) * 0.40);
  if (val <= 3.0) return clampScore(40 + linearScore(val, 1.0, 2.0) * 0.60);
  if (val <= 5.0) return clampScore(100 - linearScore(val, 3.0, 5.0) * 0.20);
  return 70;
}

function scoreDebtToEquity(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 30;
  return clampScore(100 - linearScore(val, 0, 3.0) * 100);
}

function scoreInterestCoverage(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10;
  return clampScore(linearScore(val, 0, 15));
}

function scoreDebtToAssets(val: number | null): number {
  if (val == null) return -1;
  return clampScore(100 - linearScore(val, 0, 0.8) * 100);
}

function scoreQuickRatio(val: number | null): number {
  if (val == null) return -1;
  if (val < 0.5) return clampScore(linearScore(val, 0, 0.5) * 0.30);
  if (val <= 2.0) return clampScore(30 + linearScore(val, 0.5, 1.5) * 0.70);
  return 90;
}

// ── Cash Flow ──

function scoreFreeCashFlowYield(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return Math.max(0, 20 + val * 200);
  return clampScore(linearScore(val, 0, 0.12));
}

function scoreOperatingCFPerShare(val: number | null): number {
  if (val == null) return -1;
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
  if (val < 0) return 10;
  if (val <= 0.5) return clampScore(linearScore(val, 0, 0.5) * 0.40);
  if (val <= 1.5) return clampScore(40 + linearScore(val, 0.5, 1.2) * 0.60);
  return 90;
}

// ── Earnings Quality ──

function scoreEarningsYield(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 15;
  return clampScore(linearScore(val, 0, 0.12));
}

function scoreDividendYield(val: number | null): number {
  if (val == null) return -1;
  if (val <= 0) return 40; // No dividend — neutral for growth stocks
  if (val <= 0.04) return 40 + linearScore(val, 0, 0.04) * 60;
  if (val <= 0.08) return 100 - linearScore(val, 0.04, 0.08) * 30;
  return 50;
}

function scorePayoutRatio(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 30;
  if (val <= 0.6) return 70 + linearScore(val, 0, 0.6) * 30;
  if (val <= 0.8) return 70 - linearScore(val, 0.6, 0.8) * 20;
  if (val <= 1.0) return 50 - linearScore(val, 0.8, 1.0) * 25;
  return 15;
}

function scoreRevenuePerShare(val: number | null): number {
  if (val == null) return -1;
  if (val <= 0) return 10;
  return clampScore(linearScore(val, 0, 100));
}

function scoreBookValuePerShare(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10;
  return clampScore(linearScore(val, 0, 60));
}

// ── Valuation ──

function scorePE(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 15;
  if (val <= 25) return clampScore(100 - linearScore(val, 5, 25) * 60);
  if (val <= 50) return clampScore(40 - linearScore(val, 25, 50) * 30);
  return 5;
}

function scorePB(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 10;
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
  return clampScore(100 - linearScore(val, 4, 30) * 100);
}

function scorePriceToCashFlow(val: number | null): number {
  if (val == null) return -1;
  if (val < 0) return 15;
  return clampScore(100 - linearScore(val, 3, 30) * 100);
}

// ─── Dimension Assembly ─────────────────────────────────────────────────────

/**
 * Score all ratios for a single equity holding and produce per-dimension scores.
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

  // Weighted composite across dimensions (clamped 0–100 as safety net)
  const compositeScore = Math.max(0, Math.min(100, Math.round(
    dimensions.profitability.score * DIMENSION_WEIGHTS.profitability +
      dimensions.balanceSheet.score * DIMENSION_WEIGHTS.balanceSheet +
      dimensions.cashFlow.score * DIMENSION_WEIGHTS.cashFlow +
      dimensions.earningsQuality.score * DIMENSION_WEIGHTS.earningsQuality +
      dimensions.valuation.score * DIMENSION_WEIGHTS.valuation
  )));

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
 * Score the Holdings Quality factor for an entire fund (§2.4).
 *
 * Three scoring paths:
 *   1. Equity holdings → 25-ratio multi-dimension model (v6)
 *   2. Bond holdings → Issuer category quality map + distressed adjustments (§2.4.2)
 *   3. Blended → Weighted average by equity/bond portfolio share (§2.4.3)
 *
 * Returns coverage_pct for coverage-based confidence scaling (§2.4.1).
 *
 * @param holdings Array of holdings with fundamentals + edgar data
 */
export function scoreQualityFactor(
  holdings: QualityHoldingInput[]
): QualityFactorResult {
  const holdingScores: HoldingQualityScore[] = [];
  const unscoredHoldings: Array<{ ticker: string | null; name: string; reason: string }> = [];

  // ── Classify holdings as equity vs bond (§2.4.2, §2.4.3) ────────────
  const equityHoldings: QualityHoldingInput[] = [];
  const bondHoldings: QualityHoldingInput[] = [];

  for (const h of holdings) {
    if (h.edgarHolding && isBondHolding(h.edgarHolding)) {
      bondHoldings.push(h);
    } else if (h.edgarHolding && isEquityHolding(h.edgarHolding)) {
      equityHoldings.push(h);
    } else {
      // No edgar data — treat as equity (original v6 behavior)
      equityHoldings.push(h);
    }
  }

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const equityWeight = equityHoldings.reduce((s, h) => s + h.weight, 0);
  const bondWeight = bondHoldings.reduce((s, h) => s + h.weight, 0);

  const equityRatio = totalWeight > 0 ? equityWeight / totalWeight : 0;
  const bondRatio = totalWeight > 0 ? bondWeight / totalWeight : 0;

  // ── Score equity holdings (v6 25-ratio model) ────────────────────────
  let equityWeightedSum = 0;
  let equityScoredWeight = 0;

  for (const h of equityHoldings) {
    if (!h.ticker) {
      unscoredHoldings.push({
        ticker: h.ticker,
        name: h.name,
        reason: 'No ticker — CUSIP resolution failed',
      });
      continue;
    }

    if (!h.ratios && !h.keyMetrics) {
      unscoredHoldings.push({
        ticker: h.ticker,
        name: h.name,
        reason: 'No FMP fundamental data available',
      });
      continue;
    }

    const scored = scoreHolding(h.ticker, h.name, h.weight, h.ratios, h.keyMetrics);
    holdingScores.push(scored);
    equityWeightedSum += scored.compositeScore * h.weight;
    equityScoredWeight += h.weight;
  }

  const equityScore = equityScoredWeight > 0
    ? equityWeightedSum / equityScoredWeight
    : null;

  // ── Score bond holdings (§2.4.2 issuer category map) ────────────────
  let bondWeightedQuality = 0;
  let bondScoredWeight = 0;

  for (const h of bondHoldings) {
    if (!h.edgarHolding) continue;

    const quality = scoreBondHolding(h.edgarHolding); // 0.0–1.0
    bondWeightedQuality += quality * h.weight;
    bondScoredWeight += h.weight;
  }

  // Bond quality on 0–100 scale (§2.4.2: bond_quality_scaled = bond_quality × 100)
  const bondScore = bondScoredWeight > 0
    ? (bondWeightedQuality / bondScoredWeight) * 100
    : null;

  // ── Blended fund scoring (§2.4.3) ───────────────────────────────────
  let fundScore: number;
  let qualityIsFallback = false;

  if (equityScore != null && bondScore != null) {
    // Both paths have data — blend by portfolio share (clamped 0–100 as safety net)
    fundScore = Math.max(0, Math.min(100, Math.round(equityScore * equityRatio + bondScore * bondRatio)));
  } else if (equityScore != null) {
    fundScore = Math.max(0, Math.min(100, Math.round(equityScore)));
  } else if (bondScore != null) {
    fundScore = Math.max(0, Math.min(100, Math.round(bondScore)));
  } else {
    fundScore = 50; // Neutral fallback with dataQuality flag
    qualityIsFallback = true;
  }

  // ── Coverage percentage (§2.4.1) ────────────────────────────────────
  // Equity coverage: weight of scored equity holdings / total equity weight
  // Bond coverage: always 1.0 (issuerCat always produces a value)
  const equityCoverage = equityWeight > 0 ? equityScoredWeight / equityWeight : 0;
  const bondCoverage = bondWeight > 0 ? 1.0 : 0;

  // Overall coverage weighted by equity/bond ratio
  let coveragePct = 0;
  if (totalWeight > 0) {
    const scorableWeight = equityWeight + bondWeight;
    if (scorableWeight > 0) {
      coveragePct =
        (equityCoverage * equityWeight + bondCoverage * bondWeight) /
        scorableWeight;
    }
  }

  const scoredPct = totalWeight > 0
    ? (((equityScoredWeight + bondScoredWeight) / totalWeight) * 100).toFixed(0)
    : '0';

  return {
    score: fundScore,
    holdingScores,
    unscoredHoldings,
    reasoning:
      `Holdings Quality: ${fundScore}/100 based on ${holdingScores.length} equity + ${bondHoldings.length} bond holdings ` +
      `(${scoredPct}% of fund weight scored). ` +
      `Equity: ${equityScore != null ? Math.round(equityScore) : 'N/A'}, ` +
      `Bond: ${bondScore != null ? Math.round(bondScore) : 'N/A'}. ` +
      `Coverage: ${(coveragePct * 100).toFixed(0)}%. ` +
      `${unscoredHoldings.length} holdings could not be scored.`,
    coveragePct,
    equityRatio,
    bondRatio,
    isFallback: qualityIsFallback,
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

  const score = totalWeight > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight)))
    : 50;

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
