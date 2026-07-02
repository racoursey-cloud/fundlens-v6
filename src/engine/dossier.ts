/**
 * FundLens v7 — Fund Dossier (A3 Task 4)
 *
 * The Dossier is a persisted, versioned record of each fund's data-quality
 * state for a single pipeline run, graded against the ratified pass
 * thresholds (Robert, July 1, 2026):
 *
 *   - >= 90% of NAV resolved to identified securities
 *   - >= 95% of held weight classified at sector level
 *
 * Definitions (Founding §3 Layer 0, Principles 1 & 2):
 *
 *   "Resolved" — a holding counts as identified when it has a resolved
 *   stock ticker, OR is definitively identified as a debt instrument by
 *   EDGAR metadata (isDebt / debt asset category / always-debt issuer
 *   category), OR is itself an investment company (a named fund is an
 *   identified security even when look-through fails).
 *
 *   "Classified" — weight whose sector came from a REAL signal (EDGAR
 *   metadata pre-gates, the sector cache, or Claude classification).
 *   Weight labeled 'Other' by the pipeline's last-resort give-up rule
 *   counts as UNCLASSIFIED (Robert's July 2 decision) — otherwise the
 *   95% gate would be trivially satisfied and mean nothing (Principle 2).
 *
 *   Money market funds pass as a special case — identity + expenses + NAV,
 *   no N-PORT holdings exist for them (Founding §3 Layer 0).
 *
 * A fund that fails the gate is Not Rated territory: flagged in pipeline
 * output, persisted with reasons, and included in the admin alert email.
 * Pure computation — no API calls, no database access (persist.ts writes).
 */

import type { ResolvedHolding } from './types.js';

// ─── Contract ───────────────────────────────────────────────────────────────

/** Bump when the Dossier's fields or their meanings change */
export const DOSSIER_VERSION = 1;

/** Ratified pass thresholds (July 1, 2026). NOT tunable without Robert. */
export const DOSSIER_THRESHOLDS = {
  /** Minimum % of NAV resolved to identified securities */
  NAV_RESOLVED_PCT: 90,
  /** Minimum % of held weight classified by a real signal */
  CLASSIFIED_PCT: 95,
} as const;

/** One fund's data-quality record for one pipeline run */
export interface FundDossier {
  ticker: string;
  version: number;
  /** EDGAR filing identity (null for money markets / failed fetches) */
  accessionNumber: string | null;
  reportDate: string | null;
  /** % of NAV resolved to identified securities (whole-percent) */
  navResolvedPct: number;
  /** % of held weight classified by a real signal (whole-percent) */
  classifiedPct: number;
  /** % of NAV covered by the holdings the cutoff walk included */
  weightCoveredPct: number;
  holdingsIncluded: number;
  holdingsTotal: number;
  lookthroughDetected: boolean;
  lookthroughSubfunds: number;
  /** Factors scored on synthetic fallback data (0 = all real) */
  fallbackCount: number;
  /** True when low quality coverage reduced the quality factor's weight */
  coverageScalingApplied: boolean;
  /** Quality factor's data coverage (whole-percent) */
  qualityCoveragePct: number;
  isMoneyMarket: boolean;
  passesGate: boolean;
  /** Plain-English reasons when the gate fails (empty when it passes) */
  failReasons: string[];
}

/** Everything the pipeline knows about one fund, needed to grade it */
export interface DossierInput {
  ticker: string;
  isMoneyMarket: boolean;
  /** Included holdings after cutoff (empty for MM funds / EDGAR failures) */
  holdings: ResolvedHolding[];
  /** Total holdings in the filing before the cutoff walk */
  holdingsTotal: number;
  /** Cumulative % of NAV the included holdings cover (whole-percent) */
  weightCoveredPct: number;
  accessionNumber: string | null;
  reportDate: string | null;
  lookthroughDetected: boolean;
  lookthroughSubfunds: number;
  /** Weight (whole-percent) labeled 'Other' by the last-resort rule */
  lastResortWeightPct: number;
  fallbackCount: number;
  coverageScalingApplied: boolean;
  /** Quality factor coverage as whole-percent (0–100) */
  qualityCoveragePct: number;
  /** False when the EDGAR fetch failed outright */
  holdingsAvailable: boolean;
}

// ─── Metadata identification (mirrors classify.ts / pipeline.ts signals) ────

const DEBT_ASSET_CATS = new Set(['DBT', 'STIV', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO']);
const ALWAYS_DEBT_ISSUER_CATS = new Set(['UST', 'USGA', 'MUN', 'SOV', 'ABS', 'AGEN', 'AGNCY']);

/** Is this holding identified even without a resolved ticker? */
function isIdentifiedWithoutTicker(h: ResolvedHolding): boolean {
  if (h.isDebt) return true;
  const ac = h.assetCategory?.toUpperCase();
  if (ac && DEBT_ASSET_CATS.has(ac)) return true;
  const ic = h.issuerCategory?.toUpperCase();
  if (ic && ALWAYS_DEBT_ISSUER_CATS.has(ic)) return true;
  if (h.isInvestmentCompany) return true;
  return false;
}

// ─── Computation ────────────────────────────────────────────────────────────

/** Round to 2 decimals for stable persistence/display */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute one fund's Dossier from pipeline data. Pure function.
 */
export function computeDossier(input: DossierInput): FundDossier {
  const base = {
    ticker: input.ticker,
    version: DOSSIER_VERSION,
    accessionNumber: input.accessionNumber,
    reportDate: input.reportDate,
    holdingsIncluded: input.holdings.length,
    holdingsTotal: input.holdingsTotal,
    weightCoveredPct: r2(input.weightCoveredPct),
    lookthroughDetected: input.lookthroughDetected,
    lookthroughSubfunds: input.lookthroughSubfunds,
    fallbackCount: input.fallbackCount,
    coverageScalingApplied: input.coverageScalingApplied,
    qualityCoveragePct: r2(input.qualityCoveragePct),
    isMoneyMarket: input.isMoneyMarket,
  };

  // Money market special case (Founding §3): no N-PORT holdings exist;
  // the fund passes on identity + expenses + NAV.
  if (input.isMoneyMarket) {
    return {
      ...base,
      navResolvedPct: 0,
      classifiedPct: 0,
      passesGate: true,
      failReasons: [],
    };
  }

  // EDGAR failure: nothing to grade — fail loudly with the reason.
  if (!input.holdingsAvailable) {
    return {
      ...base,
      navResolvedPct: 0,
      classifiedPct: 0,
      passesGate: false,
      failReasons: ['Holdings unavailable — EDGAR fetch failed for this run'],
    };
  }

  // NAV resolved %: identified weight, measured against total NAV.
  // pctOfNav is already in whole-percent-of-NAV units, so the sum IS the %.
  let identifiedWeight = 0;
  let includedWeight = 0;
  for (const h of input.holdings) {
    includedWeight += h.pctOfNav;
    if (h.ticker || isIdentifiedWithoutTicker(h)) {
      identifiedWeight += h.pctOfNav;
    }
  }
  const navResolvedPct = r2(Math.min(100, identifiedWeight));

  // Classified %: real-signal classified weight / included weight.
  // Everything gets SOME label by the end of step 5, so real-signal weight
  // = included weight minus what the last-resort rule labeled 'Other'.
  const classifiedRealWeight = Math.max(0, includedWeight - input.lastResortWeightPct);
  const classifiedPct = includedWeight > 0
    ? r2(Math.min(100, (classifiedRealWeight / includedWeight) * 100))
    : 0;

  const failReasons: string[] = [];
  if (navResolvedPct < DOSSIER_THRESHOLDS.NAV_RESOLVED_PCT) {
    failReasons.push(
      `${navResolvedPct.toFixed(1)}% of NAV resolved — threshold is ${DOSSIER_THRESHOLDS.NAV_RESOLVED_PCT}%`
    );
  }
  if (classifiedPct < DOSSIER_THRESHOLDS.CLASSIFIED_PCT) {
    failReasons.push(
      `${classifiedPct.toFixed(1)}% of held weight classified — threshold is ${DOSSIER_THRESHOLDS.CLASSIFIED_PCT}%`
    );
  }

  return {
    ...base,
    navResolvedPct,
    classifiedPct,
    passesGate: failReasons.length === 0,
    failReasons,
  };
}
