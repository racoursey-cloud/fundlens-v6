/**
 * FundLens v8 — The Race, Contender D: The Null Hypothesis
 * (A2 Task 6; implements CONTENDER_D.md AS FROZEN at blob 3de165a1… —
 * three static reference mixes, annually rebalanced, no tilting)
 *
 * PURE MODULE — and deliberately near-empty: D takes NO as-of inputs
 * (D §3: empty-asOf law satisfied vacuously; F3 obeyed vacuously). Its one
 * rule is the January rebalance (D §2). Everything else about D lives in
 * the runner's metric-3 arithmetic, where the same constraint model prices
 * its annual resets exactly as it prices everyone's tilts.
 *
 * D writes auditable rows (D §4, S4-ratified): one row per grid date per
 * mix per leg, label 'static', inputs carrying the mix name and standing
 * weights. Engine strings are mix-distinct per Fabio's Task 6 ruling —
 * 'D:static_conservative' | 'D:static_balanced' | 'D:static_growth' —
 * because the table's unique index is (date, basis, engine, rules_version).
 *
 * No Claude call anywhere in the race path (charter §2.3).
 */

import type { ContenderEvaluation } from '../../types.js';

// ─── The three reference mixes (D §1 — D's mixes are its own tilt map) ──────

export interface StaticMix {
  /** Mix name (D §1) — also the engine-string suffix */
  name: 'static_conservative' | 'static_balanced' | 'static_growth';
  /** Fixed equity weight, held permanently, reset each January (D §2) */
  equityWeight: number;
}

export const CONTENDER_D_MIXES: readonly StaticMix[] = [
  { name: 'static_conservative', equityWeight: 0.3 },
  { name: 'static_balanced', equityWeight: 0.6 },
  { name: 'static_growth', equityWeight: 0.8 },
] as const;

/** D §5: the single number quoted first in RACE_RESULTS */
export const CONTENDER_D_PRIMARY_MIX = 'static_balanced';

// ─── The one rule D has (D §2) ──────────────────────────────────────────────

/** The annual rebalance fires at the first monthly grid date of each
 *  calendar year — the January month-end (D §2). */
export function isRebalanceGridDate(gridDate: string): boolean {
  return gridDate.slice(5, 7) === '01';
}

// ─── Grid-date evaluation ───────────────────────────────────────────────────

/**
 * One monthly grid date for one of D's mixes. Always classifiable (D §3:
 * coverage 100% by construction — D is the coverage yardstick); no cited
 * inputs because nothing is read; the row's evidence is the mix itself.
 */
export function evaluateDGridDate(gridDate: string, mix: StaticMix): ContenderEvaluation {
  return {
    classifiable: true,
    label: 'static',
    equityWeight: mix.equityWeight,
    citedInputs: [],
    extraEvidence: {
      mix: mix.name,
      standing_weights: { equity: mix.equityWeight, risk_free: Number((1 - mix.equityWeight).toFixed(2)) },
      rebalance: isRebalanceGridDate(gridDate),
    },
  };
}
