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
 *
 * v2 (A4 Task 6, endorsed July 2, approved July 5, 2026): grading moves to
 * RESOLVABLE NAV. Three visible numbers replace the conflated v1 gate:
 * % examined (the cutoff's doing), % of examined structurally resolvable
 * (derivative category OR no CUSIP and no ISIN = unresolvable — asset
 * category alone can't define it; bullion files as EC and STIV), and
 * % of resolvable NAV resolved — the graded number, threshold 90. All
 * ratios run over positive-weight holdings; negative-weight overlay legs
 * are reported in their own field, never averaged in.
 */

import type { ResolvedHolding } from './types.js';

// ─── Contract ───────────────────────────────────────────────────────────────

/** Bump when the Dossier's fields or their meanings change.
 *  v2 (A4 Task 6): grading moves to resolvable NAV. The v1 gate conflated
 *  three facts and failed seven funds on denominator artifacts alone —
 *  PRPFX's "missing" 34% is its bullion, working as designed. */
export const DOSSIER_VERSION = 2;

/** Ratified pass thresholds (July 1, 2026). NOT tunable without Robert. */
export const DOSSIER_THRESHOLDS = {
  /** v2 graded number: minimum % of structurally RESOLVABLE NAV resolved
   *  to identified securities (A4 Task 6, endorsed July 2, 2026) */
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
  /** % of NAV resolved to identified securities (whole-percent).
   *  v1 continuity number — kept for comparison across versions. */
  navResolvedPct: number;
  /** % of held weight classified by a real signal (whole-percent) */
  classifiedPct: number;
  /** % of NAV covered by the holdings the cutoff walk included */
  weightCoveredPct: number;
  // ── v2 metrics (A4 Task 6) — all over POSITIVE-weight holdings only ──
  /** % of examined NAV that is structurally resolvable */
  resolvablePct: number;
  /** THE GRADED NUMBER: % of resolvable NAV resolved (threshold 90) */
  resolvedOfResolvablePct: number;
  /** The visible unresolvable slice (derivatives, bullion, sweeps, no-id) */
  unresolvableWeightPct: number;
  /** Net weight of negative-weight rows (short/overlay legs) — excluded
   *  from the ratios above, shown here instead of hidden (Principle 1) */
  shortOverlayWeightPct: number;
  /** A4 Task 4: % of positive included weight below the liquidity firewall */
  momentumFirewalledWeightPct: number;
  /** A4 Task 3: industry-tag provenance shares of positive included weight */
  industryFmpPct: number;
  industryHaikuPct: number;
  industryNonePct: number;
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

  // v2 zero-filled metrics for the special-case branches below
  const v2Zeros = {
    resolvablePct: 0,
    resolvedOfResolvablePct: 0,
    unresolvableWeightPct: 0,
    shortOverlayWeightPct: 0,
    momentumFirewalledWeightPct: 0,
    industryFmpPct: 0,
    industryHaikuPct: 0,
    industryNonePct: 0,
  };

  // Money market special case (Founding §3): no N-PORT holdings exist;
  // the fund passes on identity + expenses + NAV.
  if (input.isMoneyMarket) {
    return {
      ...base,
      ...v2Zeros,
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
      ...v2Zeros,
      navResolvedPct: 0,
      classifiedPct: 0,
      passesGate: false,
      failReasons: ['Holdings unavailable — EDGAR fetch failed for this run'],
    };
  }

  // ── v2 walk (A4 Task 6) — one pass over the included holdings ───────────
  // pctOfNav is in whole-percent-of-NAV units, so sums ARE percentages.
  // Negative-weight rows (short/overlay derivative legs, observed in
  // DRRYX's filing) are excluded from every ratio and reported in their
  // own field (Robert's July 5 decision — nothing hidden, nothing warped).
  let examinedPos = 0;        // positive included weight (all ratios' base)
  let shortOverlayWeight = 0; // net weight of negative rows
  let unresolvableWeight = 0; // structurally unresolvable positive weight
  let resolvableWeight = 0;   // positive weight eligible for resolution
  let resolvedWeight = 0;     // resolvable weight actually identified
  let identifiedWeight = 0;   // v1 continuity numerator (all identified)
  let firewalledWeight = 0;   // A4 Task 4: momentum_eligible === false
  let industryFmpWeight = 0;  // A4 Task 3 provenance shares
  let industryHaikuWeight = 0;

  for (const h of input.holdings) {
    if (h.pctOfNav < 0) {
      shortOverlayWeight += h.pctOfNav;
      continue;
    }
    examinedPos += h.pctOfNav;

    const identified = Boolean(h.ticker) || isIdentifiedWithoutTicker(h);
    if (identified) identifiedWeight += h.pctOfNav;

    if (h.structurallyUnresolvable) {
      unresolvableWeight += h.pctOfNav;
    } else {
      resolvableWeight += h.pctOfNav;
      if (identified) resolvedWeight += h.pctOfNav;
    }

    if (h.momentumEligible === false) firewalledWeight += h.pctOfNav;
    if (h.industrySource === 'fmp') industryFmpWeight += h.pctOfNav;
    else if (h.industrySource === 'haiku') industryHaikuWeight += h.pctOfNav;
  }

  const pctOf = (part: number, whole: number): number =>
    whole > 0 ? r2(Math.min(100, (part / whole) * 100)) : 0;

  const navResolvedPct = r2(Math.min(100, identifiedWeight)); // v1 continuity
  const resolvablePct = pctOf(resolvableWeight, examinedPos);
  // Vacuous pass when nothing is resolvable (a pure-bullion fund has
  // nothing to resolve and nothing missing) — the unresolvable slice is
  // displayed right beside it, so nothing is hidden.
  const resolvedOfResolvablePct = resolvableWeight > 0
    ? pctOf(resolvedWeight, resolvableWeight)
    : 100;

  // Classified %: real-signal classified weight / positive included weight.
  // Everything gets SOME label by the end of step 5, so real-signal weight
  // = positive included weight minus what the last-resort rule labeled
  // 'Other'.
  const classifiedRealWeight = Math.max(0, examinedPos - input.lastResortWeightPct);
  const classifiedPct = pctOf(classifiedRealWeight, examinedPos);

  const industryFmpPct = pctOf(industryFmpWeight, examinedPos);
  const industryHaikuPct = pctOf(industryHaikuWeight, examinedPos);
  const industryNonePct = examinedPos > 0
    ? r2(Math.max(0, 100 - industryFmpPct - industryHaikuPct))
    : 0;

  const failReasons: string[] = [];
  if (resolvedOfResolvablePct < DOSSIER_THRESHOLDS.NAV_RESOLVED_PCT) {
    failReasons.push(
      `${resolvedOfResolvablePct.toFixed(1)}% of resolvable NAV resolved — threshold is ${DOSSIER_THRESHOLDS.NAV_RESOLVED_PCT}%`
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
    resolvablePct,
    resolvedOfResolvablePct,
    unresolvableWeightPct: pctOf(unresolvableWeight, examinedPos),
    shortOverlayWeightPct: r2(shortOverlayWeight),
    momentumFirewalledWeightPct: pctOf(firewalledWeight, examinedPos),
    industryFmpPct,
    industryHaikuPct,
    industryNonePct,
    passesGate: failReasons.length === 0,
    failReasons,
  };
}
