/**
 * FundLens v8 — The Race, Contender C: The Blend
 * (A2 Task 6; implements CONTENDER_C.md AS FROZEN at blob 28e20264… —
 * "quadrant narrates, trend/vol computes, stress overrides both")
 *
 * STRICTLY A COMPOSITION (C §1): every rule here is a call into A or B.
 * This module owns ZERO thresholds, ZERO numbers, ZERO new inputs — its
 * only original logic is the composition law itself:
 *   1. label  = Contender A's label (A §§3.0–3.2, 3.4–3.7)
 *   2. weight = Contender B's ladder rung from B's base state (B §3.8)
 *   3. storm  = the one shared override (A §3.3 ≡ B §3.3): label `stress`,
 *               weight = the ladder floor
 * Classifiable ONLY when both parents classify (C §2: intersection
 * coverage — half a blend is a different contender).
 *
 * PURE MODULE: no data access imports, no wall clock, no side effects.
 * No Claude call anywhere in the race path (charter §2.3).
 */

import type { RaceAsOfReads, RaceCitedInput, ContenderEvaluation } from '../../types.js';
import { seedAOnStormExit, evaluateAGridDate, initialAState } from './a.js';
import type { ContenderAState } from './a.js';
import { seedBOnStormExit, evaluateBGridDate, initialBState, CONTENDER_B_WEIGHTS } from './b.js';
import type { ContenderBState } from './b.js';

/** C's storm weight is the shared ladder floor (both parents' §3.8 floor) */
const STRESS_WEIGHT = CONTENDER_B_WEIGHTS['stress'];

// ─── State: exactly the two parents' states, one shared storm ───────────────

export interface ContenderCState {
  a: ContenderAState;
  b: ContenderBState;
}

export function initialCState(): ContenderCState {
  // One override, one state: the parents' storm fields are kept in
  // lockstep by the runner (identical rules on identical reads produce
  // identical machines; C carries them inside its parents' states).
  return { a: initialAState(), b: initialBState() };
}

// ─── Grid-date evaluation ───────────────────────────────────────────────────

export interface CGridOutcome {
  evaluation: ContenderEvaluation;
  state: ContenderCState;
}

function composeCited(aCited: RaceCitedInput[], bCited: RaceCitedInput[]): RaceCitedInput[] {
  // Union of the parents' citations, each value cited once (RACE_RULES §8)
  const seen = new Set<string>();
  const out: RaceCitedInput[] = [];
  for (const c of [...aCited, ...bCited]) {
    const key = `${c.series}|${c.obs_date}|${c.realtime_start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * One monthly grid date for Contender C: run both parents' grid
 * evaluations; classifiable only when both are (C §2). Label from A,
 * weight from B, storm overriding both (C §1).
 */
export function evaluateCGridDate(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderCState,
  stormCited: RaceCitedInput[]
): CGridOutcome {
  const a = evaluateAGridDate(evalDate, reads, state.a, stormCited);
  const b = evaluateBGridDate(evalDate, reads, state.b, []);

  // Parents' axis machinery advances only where a parent classified; an
  // unclassifiable parent's state is returned unchanged by that parent.
  const nextState: ContenderCState = { a: a.state, b: b.state };

  if (!a.evaluation.classifiable || !b.evaluation.classifiable) {
    const reasons = [
      a.evaluation.classifiable ? null : `A: ${a.evaluation.unclassifiableReason}`,
      b.evaluation.classifiable ? null : `B: ${b.evaluation.unclassifiableReason}`,
    ].filter(Boolean);
    return {
      evaluation: {
        classifiable: false,
        citedInputs: [],
        unclassifiableReason: `parent unclassifiable — ${reasons.join('; ')} (C §2 intersection coverage)`,
      },
      state: nextState,
    };
  }

  const stormActive = state.a.storm.active;
  const label = stormActive ? 'stress' : a.evaluation.label!;
  // B's grid evaluation already resolves its own storm label; C's weight is
  // B's BASE-state rung (trend/vol computes the tilts), floored in a storm.
  const bBaseLabel = stormActive
    ? (b.evaluation.extraEvidence?.base_axes as { trend: string; vol: string } | undefined)
    : null;
  const weight = stormActive
    ? STRESS_WEIGHT
    : b.evaluation.equityWeight!;

  return {
    evaluation: {
      classifiable: true,
      label,
      equityWeight: weight,
      citedInputs: composeCited(a.evaluation.citedInputs, b.evaluation.citedInputs),
      extraEvidence: {
        a_label: a.evaluation.label,
        b_label: b.evaluation.label,
        ...(bBaseLabel ? { b_base_axes: bBaseLabel } : {}),
        a_evidence: a.evaluation.extraEvidence ?? {},
        b_evidence: b.evaluation.extraEvidence ?? {},
      },
    },
    state: nextState,
  };
}

/** Storm-exit seeding: both parents seed from the same exit-day
 *  computation (the one shared override exits once, for both). */
export function seedCOnStormExit(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderCState,
  stormCited: RaceCitedInput[]
): CGridOutcome {
  const a = seedAOnStormExit(evalDate, reads, state.a, stormCited);
  const b = seedBOnStormExit(evalDate, reads, state.b, []);
  const nextState: ContenderCState = { a: a.state, b: b.state };

  if (!a.evaluation.classifiable || !b.evaluation.classifiable) {
    const reasons = [
      a.evaluation.classifiable ? null : `A: ${a.evaluation.unclassifiableReason}`,
      b.evaluation.classifiable ? null : `B: ${b.evaluation.unclassifiableReason}`,
    ].filter(Boolean);
    return {
      evaluation: {
        classifiable: false,
        citedInputs: [],
        unclassifiableReason: `parent unclassifiable at storm-exit seed — ${reasons.join('; ')} (C §2)`,
      },
      state: nextState,
    };
  }

  return {
    evaluation: {
      classifiable: true,
      label: a.evaluation.label!,
      equityWeight: b.evaluation.equityWeight!,
      citedInputs: composeCited(a.evaluation.citedInputs, b.evaluation.citedInputs),
      extraEvidence: {
        a_label: a.evaluation.label,
        b_label: b.evaluation.label,
        storm_exit_seed: true,
      },
    },
    state: nextState,
  };
}
