/**
 * FundLens v8 — The Race, Contender A: Quadrant + Stress Override
 * (A2 Task 6; implements CONTENDER_A.md AS FROZEN at blob 08bbdc36…,
 * ratified at S3 — every threshold below is that spec's, cited by section)
 *
 * PURE MODULE (A2 Task 6 order; RACE_RULES §1 acceptance §7.1): functions of
 * (evaluation date, runner-supplied observation reads, prior state) only.
 * No data access of any kind — not even asof.ts — no wall-clock reads, no
 * side effects. The runner performs every read and passes observations in.
 *
 * The storm override (§3.3) lives HERE and is exported: CONTENDER_B §3.3
 * adopts A's override verbatim by blob anchor, and code-level reuse is the
 * literal form of "verbatim" — one implementation, zero drift. Contender C
 * composes both parents (its spec's §1), so it imports from here too.
 *
 * No Claude call anywhere in the race path (charter §2.3).
 */

import type {
  RaceAsOfReads,
  RaceAxisState,
  RaceStormState,
  RaceCitedInput,
  ContenderEvaluation,
  RegimeNormalizedObservation,
} from '../../types.js';

// ─── Frozen thresholds (CONTENDER_A §3; frozen at S3 — a change here is a
//     new rules_version by definition, §3.9) ────────────────────────────────

/** §3.1: below trend when CFNAI-MA3 ≤ this */
const GROWTH_BELOW_MARKER = -0.35;
/** §3.1: back to at/above trend when CFNAI-MA3 ≥ this */
const GROWTH_ABOVE_MARKER = 0.0;
/** §3.1: Sahm fail-safe — non-empty read ≥ this forces below-trend */
const SAHM_TRIGGER = 0.5;
/** §3.2: above anchor when YoY ≥ this (percent) */
const INFLATION_ABOVE_MARKER = 3.0;
/** §3.2: back to at/below anchor when YoY ≤ this (percent) */
const INFLATION_BELOW_MARKER = 2.5;
/** §3.2: breakeven tie-break — ≥ tips above-anchor, ≤ tips at/below */
const BREAKEVEN_TIP_ABOVE = 2.5;
const BREAKEVEN_TIP_BELOW = 2.2;
/** §3.3: storm entry — VIX close ≥ this, or OFR FSI ≥ the OFR marker */
const STORM_VIX_ENTRY = 35;
const STORM_OFR_ENTRY = 2.0;
/** §3.3: storm exit markers — every available instrument below its marker */
const STORM_VIX_EXIT = 25;
const STORM_OFR_EXIT = 1.0;
/** §3.3: exit requires this many consecutive business-day evaluations */
const STORM_EXIT_CONSECUTIVE_EVALS = 5;
/** §3.3: no exit before this minimum storm dwell (business days) */
const STORM_MIN_DWELL_BUSINESS_DAYS = 10;
/** §3.4: a base state must hold this many consecutive grid dates before it
 *  may revert to the immediately-prior state */
const BASE_MIN_HOLD_GRID_DATES = 2;
/** §3.7: the inflation reading is stale when the newest observation
 *  describes a month more than this many days before the evaluation date */
const INFLATION_STALE_DAYS = 75;
/** §3.1: the growth reading is the mean of this many newest observations */
const CFNAI_MA_LENGTH = 3;

/** §2: the inflation priority chain — first link with a computable YoY wins
 *  (F7(d): both the newest and the year-ago observation present) */
const INFLATION_CHAIN = ['PCEPILFE', 'CPILFESL', 'CPIAUCSL'] as const;

/** §3.8: race-scoped tilt map (metric-3 instrumentation only) */
export const CONTENDER_A_WEIGHTS: Record<string, number> = {
  recovery: 0.8,
  overheat: 0.6,
  slowdown: 0.5,
  stagflation: 0.4,
  stress: 0.3,
};

// ─── State ──────────────────────────────────────────────────────────────────

export interface ContenderAState {
  /** Growth axis: 'above' | 'below'; null = no prior state yet (§3.0) */
  growth: RaceAxisState | null;
  /** Inflation axis: 'above' | 'below' (anchor); null = no prior state */
  inflation: RaceAxisState | null;
  storm: RaceStormState;
}

export function initialAState(): ContenderAState {
  return {
    growth: null,
    inflation: null,
    storm: { active: false, dwellBusinessDays: 0, consecutiveExitEvals: 0 },
  };
}

// ─── Small pure helpers ─────────────────────────────────────────────────────

function cite(
  series: string,
  o: RegimeNormalizedObservation,
  flag?: string
): RaceCitedInput {
  const c: RaceCitedInput = {
    series,
    obs_date: o.obs_date,
    value: o.value,
    realtime_start: o.realtime_start,
  };
  if (flag) c.flag = flag;
  return c;
}

function isoMonthsBefore(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const zero = y * 12 + (m - 1) - months;
  const ny = Math.floor(zero / 12);
  const nm = (zero % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isoDaysAfter(isoDate: string, days: number): string {
  const t = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10))
  );
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** §3.4 dwell law, one axis step. Returns the axis state after this grid
 *  date given the band's target ('above'/'below') or null (in-band: hold).
 *  `forced` (the §3.1 Sahm fail-safe) bypasses flap suppression. */
export function stepAxis(
  current: RaceAxisState | null,
  target: string | null,
  coldStart: string,
  forced = false
): RaceAxisState {
  if (current === null) {
    // §3.0 cold start: out-of-band target resolves directly; in-band uses
    // the caller-resolved nearest-marker/cautious value (coldStart).
    return { state: target ?? coldStart, prior: null, heldGridDates: 1 };
  }
  if (target === null || target === current.state) {
    return { ...current, heldGridDates: current.heldGridDates + 1 };
  }
  // A transition. §3.4: reverting to the immediately-prior state is
  // suppressed until the current state has held 2 consecutive grid dates.
  if (!forced && target === current.prior && current.heldGridDates < BASE_MIN_HOLD_GRID_DATES) {
    return { ...current, heldGridDates: current.heldGridDates + 1 };
  }
  return { state: target, prior: current.state, heldGridDates: 1 };
}

// ─── Growth axis (§3.1) ─────────────────────────────────────────────────────

interface AxisReading {
  ok: boolean;
  /** Band target: 'above' | 'below' | null (in-band) */
  target?: string | null;
  /** §3.0 cold-start resolution for in-band readings */
  coldStart?: string;
  forced?: boolean;
  cited: RaceCitedInput[];
  reason?: string;
  flags?: Record<string, unknown>;
}

export function readGrowthAxis(reads: RaceAsOfReads): AxisReading {
  const cfnai = reads['CFNAI'] ?? [];
  if (cfnai.length < CFNAI_MA_LENGTH) {
    return {
      ok: false,
      cited: [],
      reason: `CFNAI as-of read has ${cfnai.length} observations — fewer than ${CFNAI_MA_LENGTH} (§3.6)`,
    };
  }
  const window = cfnai.slice(0, CFNAI_MA_LENGTH);
  const ma3 = window.reduce((s, o) => s + o.value, 0) / CFNAI_MA_LENGTH;
  const cited = window.map(o => cite('CFNAI', o));

  // §3.1 Sahm fail-safe: a non-empty read ≥ 0.50 forces below-trend
  const sahm = (reads['SAHMREALTIME'] ?? [])[0];
  if (sahm) cited.push(cite('SAHMREALTIME', sahm));
  if (sahm && sahm.value >= SAHM_TRIGGER) {
    return { ok: true, target: 'below', forced: true, cited, flags: { sahm_forced: true, cfnai_ma3: ma3 } };
  }

  let target: string | null = null;
  if (ma3 <= GROWTH_BELOW_MARKER) target = 'below';
  else if (ma3 >= GROWTH_ABOVE_MARKER) target = 'above';

  // §3.0 cold start for in-band: nearer marker; equidistant → cautious (below)
  const distBelow = Math.abs(ma3 - GROWTH_BELOW_MARKER);
  const distAbove = Math.abs(ma3 - GROWTH_ABOVE_MARKER);
  const coldStart = distBelow <= distAbove ? 'below' : 'above';

  return { ok: true, target, coldStart, cited, flags: { cfnai_ma3: ma3 } };
}

// ─── Inflation axis (§3.2, §3.7) ────────────────────────────────────────────

export function readInflationAxis(
  evalDate: string,
  reads: RaceAsOfReads,
  priorState: RaceAxisState | null
): AxisReading {
  // §3.2 + F7(d): first chain link whose as-of read yields a computable YoY
  let yoy: number | null = null;
  let cited: RaceCitedInput[] = [];
  let newestObsDate: string | null = null;
  let chainSeries: string | null = null;

  for (const series of INFLATION_CHAIN) {
    const obs = reads[series] ?? [];
    if (obs.length === 0) continue;
    const newest = obs[0];
    const yearAgoDate = isoMonthsBefore(newest.obs_date, 12);
    const yearAgo = obs.find(o => o.obs_date === yearAgoDate);
    if (!yearAgo) continue;
    yoy = (newest.value / yearAgo.value - 1) * 100;
    cited = [cite(series, newest), cite(series, yearAgo)];
    newestObsDate = newest.obs_date;
    chainSeries = series;
    break;
  }

  const flags: Record<string, unknown> = {};

  // §3.7 staleness/blackout ladder: chain unusable, or newest observation
  // describes a month more than 75 days before the evaluation date
  const stale =
    yoy === null || (newestObsDate !== null && isoDaysAfter(newestObsDate, INFLATION_STALE_DAYS) < evalDate);
  if (stale) {
    const nowcast = (reads['CLEV_CPI_NOWCAST'] ?? [])[0];
    if (nowcast) {
      yoy = nowcast.value;
      cited = [cite('CLEV_CPI_NOWCAST', nowcast, 'degraded_source')];
      flags.degraded_source = 'CLEV_CPI_NOWCAST';
      if (chainSeries) flags.stale_chain = chainSeries;
    } else if (priorState !== null) {
      // Prior inflation state holds, flagged stale-held
      flags.stale_held = true;
      return { ok: true, target: priorState.state, cited, flags };
    } else {
      return {
        ok: false,
        cited: [],
        reason: 'inflation chain stale/unusable, no nowcast, no prior state to hold (§3.7 → §3.6)',
      };
    }
  } else if (chainSeries) {
    flags.chain_series = chainSeries;
  }
  flags.inflation_yoy = yoy;

  let target: string | null = null;
  if ((yoy as number) >= INFLATION_ABOVE_MARKER) target = 'above';
  else if ((yoy as number) <= INFLATION_BELOW_MARKER) target = 'below';

  // §3.2 in-band tie-break: a non-empty T10YIE read may tip the band; the
  // §3.0 cold start consults it first as well
  let coldStart: string;
  const breakeven = (reads['T10YIE'] ?? [])[0];
  if (target === null && breakeven) {
    cited.push(cite('T10YIE', breakeven));
    if (breakeven.value >= BREAKEVEN_TIP_ABOVE) target = 'above';
    else if (breakeven.value <= BREAKEVEN_TIP_BELOW) target = 'below';
  }
  if (breakeven && (breakeven.value >= BREAKEVEN_TIP_ABOVE || breakeven.value <= BREAKEVEN_TIP_BELOW)) {
    coldStart = breakeven.value >= BREAKEVEN_TIP_ABOVE ? 'above' : 'below';
  } else {
    // nearer marker; equidistant → cautious (above anchor)
    const distAbove = Math.abs((yoy as number) - INFLATION_ABOVE_MARKER);
    const distBelow = Math.abs((yoy as number) - INFLATION_BELOW_MARKER);
    coldStart = distAbove <= distBelow ? 'above' : 'below';
  }

  return { ok: true, target, coldStart, cited, flags };
}

// ─── The shared storm override (§3.3 — exported for B and C) ────────────────

export interface StormEvaluation {
  /** No same-day VIX close (market holiday): no evaluation today (§3.6) */
  evaluated: boolean;
  state: RaceStormState;
  transition: 'entry' | 'exit' | null;
  cited: RaceCitedInput[];
}

/**
 * One business-day storm evaluation (CONTENDER_A §3.3, all dwell in
 * business days). `vix` must be the SAME-DAY close — the runner passes the
 * newest VIXCLS read and this function refuses to evaluate on any other
 * day's value (§3.6 holiday rule). `ofr` is the newest non-empty OFR FSI
 * read when one exists (confirmatory availability per §2).
 */
export function evaluateStorm(
  evalDate: string,
  vix: RegimeNormalizedObservation | undefined,
  ofr: RegimeNormalizedObservation | undefined,
  state: RaceStormState
): StormEvaluation {
  if (!vix || vix.obs_date !== evalDate) {
    // Market holiday: no override evaluation today — not a coverage event
    return { evaluated: false, state, transition: null, cited: [] };
  }
  const cited: RaceCitedInput[] = [cite('VIXCLS', vix)];
  if (ofr) cited.push(cite('OFR_FSI', ofr));

  if (!state.active) {
    // Entry is immediate — speed is the override's reason to exist
    if (vix.value >= STORM_VIX_ENTRY || (ofr !== undefined && ofr.value >= STORM_OFR_ENTRY)) {
      return {
        evaluated: true,
        state: { active: true, dwellBusinessDays: 1, consecutiveExitEvals: 0 },
        transition: 'entry',
        cited,
      };
    }
    return { evaluated: true, state, transition: null, cited };
  }

  // Active storm: dwell advances; exit needs every AVAILABLE instrument
  // below its exit marker for 5 consecutive evaluations, min dwell 10.
  const dwell = state.dwellBusinessDays + 1;
  const belowExit = vix.value <= STORM_VIX_EXIT && (ofr === undefined || ofr.value < STORM_OFR_EXIT);
  const consecutive = belowExit ? state.consecutiveExitEvals + 1 : 0;

  if (consecutive >= STORM_EXIT_CONSECUTIVE_EVALS && dwell >= STORM_MIN_DWELL_BUSINESS_DAYS) {
    return {
      evaluated: true,
      state: { active: false, dwellBusinessDays: 0, consecutiveExitEvals: 0 },
      transition: 'exit',
      cited,
    };
  }
  return {
    evaluated: true,
    state: { active: true, dwellBusinessDays: dwell, consecutiveExitEvals: consecutive },
    transition: null,
    cited,
  };
}

// ─── Base-cell evaluation (§3.1–§3.2 + §3.4–§3.5, one grid or seed date) ────

const CELL_LABELS: Record<string, string> = {
  'above|below': 'recovery',
  'above|above': 'overheat',
  'below|above': 'stagflation',
  'below|below': 'slowdown',
};

export interface ABaseResult {
  ok: boolean;
  growth?: RaceAxisState;
  inflation?: RaceAxisState;
  label?: string;
  cited: RaceCitedInput[];
  flags: Record<string, unknown>;
  reason?: string;
}

/** Evaluate A's base axes on one date (a monthly grid date, or a storm-exit
 *  seed day per §3.3/F7(b)) and step the §3.4 dwell machinery. */
export function evaluateABase(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderAState
): ABaseResult {
  const growth = readGrowthAxis(reads);
  if (!growth.ok) return { ok: false, cited: [], flags: {}, reason: growth.reason };

  const inflation = readInflationAxis(evalDate, reads, state.inflation);
  if (!inflation.ok) return { ok: false, cited: [], flags: {}, reason: inflation.reason };

  const nextGrowth = stepAxis(state.growth, growth.target ?? null, growth.coldStart ?? 'below', growth.forced === true);
  const nextInflation = stepAxis(state.inflation, inflation.target ?? null, inflation.coldStart ?? 'above');

  const cited = [...growth.cited, ...inflation.cited];
  // §2: NFCI is recorded in inputs for the narrative — never a trigger
  const nfci = (reads['NFCI'] ?? [])[0];
  if (nfci) cited.push(cite('NFCI', nfci));

  return {
    ok: true,
    growth: nextGrowth,
    inflation: nextInflation,
    label: CELL_LABELS[`${nextGrowth.state}|${nextInflation.state}`],
    cited,
    flags: { ...growth.flags, ...inflation.flags },
  };
}

// ─── Grid-date evaluation (the runner's monthly call) ───────────────────────

export interface AGridOutcome {
  evaluation: ContenderEvaluation;
  state: ContenderAState;
}

/**
 * One monthly grid date for Contender A. The runner has already run the
 * §3.3 storm machine for this date (storm is a daily concern; the runner
 * passes the post-evaluation storm state in `state`). During a storm the
 * base axes are still computed and recorded but the label is `stress`
 * (§3.3); an unclassifiable base during a storm still writes the stress row
 * with the storm's own citations (the storm instruments are the classifying
 * inputs; base-axis recording is continuity, not a requirement to classify
 * the storm itself is a judgment call recorded at S5 — strictly: required
 * inputs empty make the date unclassifiable, §3.6, so we keep that law:
 * base unclassifiable ⇒ date unclassifiable, storm or not).
 */
export function evaluateAGridDate(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderAState,
  stormCited: RaceCitedInput[]
): AGridOutcome {
  const base = evaluateABase(evalDate, reads, state);
  if (!base.ok) {
    return {
      evaluation: {
        classifiable: false,
        citedInputs: [],
        unclassifiableReason: base.reason,
      },
      state,
    };
  }

  const nextState: ContenderAState = { ...state, growth: base.growth!, inflation: base.inflation! };
  const label = state.storm.active ? 'stress' : base.label!;
  const extraEvidence: Record<string, unknown> = { ...base.flags };
  if (state.storm.active) {
    extraEvidence.storm_active = true;
    extraEvidence.base_axes = { growth: base.growth!.state, inflation: base.inflation!.state };
  }

  return {
    evaluation: {
      classifiable: true,
      label,
      equityWeight: CONTENDER_A_WEIGHTS[label],
      citedInputs: [...base.cited, ...stormCited],
      extraEvidence,
    },
    state: nextState,
  };
}

/** Storm-exit seeding (§3.3/F7(b)): on the exit day the label is the base
 *  cell computed that same day, and the seed becomes the §3.4 state. */
export function seedAOnStormExit(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderAState,
  stormCited: RaceCitedInput[]
): AGridOutcome {
  const base = evaluateABase(evalDate, reads, state);
  if (!base.ok) {
    // Exit computed but base unclassifiable: no row (§3.6); state keeps the
    // storm exit (already applied by the runner) and axes unchanged.
    return {
      evaluation: { classifiable: false, citedInputs: [], unclassifiableReason: base.reason },
      state,
    };
  }
  const nextState: ContenderAState = { ...state, growth: base.growth!, inflation: base.inflation! };
  return {
    evaluation: {
      classifiable: true,
      label: base.label!,
      equityWeight: CONTENDER_A_WEIGHTS[base.label!],
      citedInputs: [...base.cited, ...stormCited],
      extraEvidence: { ...base.flags, storm_exit_seed: true },
    },
    state: nextState,
  };
}
