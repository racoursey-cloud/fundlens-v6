/**
 * FundLens v8 — The Race, Contender B: Trend / Volatility / Stress Stack
 * (A2 Task 6; implements CONTENDER_B.md AS FROZEN at blob c7e21270…,
 * ratified with amendments at S4 — every threshold below is that spec's)
 *
 * PURE MODULE: functions of (evaluation date, runner-supplied reads, prior
 * state) only. No data access imports, no wall clock, no side effects.
 *
 * The storm override is Contender A's §3.3 adopted VERBATIM by anchor
 * (B §3.3) — so this module imports A's implementation rather than copying
 * it: one implementation, zero drift, literal "verbatim". That import is
 * pure contender logic, not data access.
 *
 * No Claude call anywhere in the race path (charter §2.3).
 */

import type {
  RaceAsOfReads,
  RaceAxisState,
  RaceCitedInput,
  ContenderEvaluation,
  RegimeNormalizedObservation,
} from '../../types.js';
import { stepAxis } from './a.js';
import type { ContenderAState } from './a.js';

// Re-export the shared override pieces so the runner (and C) can reach the
// one storm implementation through either parent, as the specs read.
export { evaluateStorm } from './a.js';
export type { StormEvaluation } from './a.js';

// ─── Frozen thresholds (CONTENDER_B §3; frozen at S4) ───────────────────────

/** §3.1: the trend reading's moving-average length (Faber's shape) */
const SMA_MONTHS = 10;
/** §3.1: below path when I ≤ this × SMA10 (1% penetration required) */
const TREND_BELOW_FACTOR = 0.99;
/** §3.1: back to above path when I ≥ this × SMA10 (plain recross) */
const TREND_ABOVE_FACTOR = 1.0;
/** §3.2: the realized-volatility window, trailing daily log returns */
const VOL_RETURN_COUNT = 126;
/** §3.2: volatile when annualized σ ≥ this (percent) */
const VOL_HIGH_MARKER = 20;
/** §3.2: back to calm when annualized σ ≤ this (percent) */
const VOL_CALM_MARKER = 16;
/** §3.2: trading days per year for annualization */
const TRADING_DAYS_PER_YEAR = 252;
/** §3.7: the rail is stale (date unclassifiable) when the newest
 *  observation is more than this many business days before the evaluation */
const RAIL_STALE_BUSINESS_DAYS = 10;

/** §3.8: race-scoped tilt map — deliberately A's rungs (S4 ruling: same
 *  ladder isolates timing as the only difference metric 3 can see) */
export const CONTENDER_B_WEIGHTS: Record<string, number> = {
  uptrend_calm: 0.8,
  uptrend_volatile: 0.6,
  downtrend_calm: 0.5,
  downtrend_volatile: 0.4,
  stress: 0.3,
};

const CELL_LABELS: Record<string, string> = {
  'above|calm': 'uptrend_calm',
  'above|volatile': 'uptrend_volatile',
  'below|calm': 'downtrend_calm',
  'below|volatile': 'downtrend_volatile',
};

// ─── State ──────────────────────────────────────────────────────────────────

export interface ContenderBState {
  /** Trend axis: 'above' | 'below' (path); null = no prior state (§3.0) */
  trend: RaceAxisState | null;
  /** Volatility axis: 'calm' | 'volatile'; null = no prior state */
  vol: RaceAxisState | null;
  /** The shared storm state — A §3.3's machinery, by anchor */
  storm: ContenderAState['storm'];
}

export function initialBState(): ContenderBState {
  return {
    trend: null,
    vol: null,
    storm: { active: false, dwellBusinessDays: 0, consecutiveExitEvals: 0 },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cite(series: string, o: RegimeNormalizedObservation): RaceCitedInput {
  return { series, obs_date: o.obs_date, value: o.value, realtime_start: o.realtime_start };
}

/** Whole business days (Mon–Fri) strictly between two ISO dates — the same
 *  counting rule ingest.ts uses (kept local: contenders import no engine
 *  machinery beyond types and sibling contender logic). */
function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ─── Trend axis (§3.1) ──────────────────────────────────────────────────────

interface BAxisReading {
  ok: boolean;
  target?: string | null;
  coldStart?: string;
  cited: RaceCitedInput[];
  reason?: string;
  flags?: Record<string, unknown>;
}

export function readTrendAxis(evalDate: string, reads: RaceAsOfReads): BAxisReading {
  const rail = reads['RACE_EQ_TR'] ?? [];
  if (rail.length === 0) {
    return { ok: false, cited: [], reason: 'RACE_EQ_TR as-of read empty (§3.6)' };
  }
  const newest = rail[0];

  // §3.7: prices have no legitimate blackout — stale rail is unclassifiable
  if (businessDaysBetween(newest.obs_date, evalDate) > RAIL_STALE_BUSINESS_DAYS) {
    return {
      ok: false,
      cited: [],
      reason: `RACE_EQ_TR newest observation ${newest.obs_date} is more than ${RAIL_STALE_BUSINESS_DAYS} business days before ${evalDate} — rail failed (§3.7)`,
    };
  }

  // §3.1: SMA10 = mean of the index at the last available trading day of
  // each of the 10 most recent calendar months ending with the eval month.
  const evalMonth = evalDate.slice(0, 7);
  const months: string[] = [];
  let [y, m] = [Number(evalMonth.slice(0, 4)), Number(evalMonth.slice(5, 7))];
  for (let i = 0; i < SMA_MONTHS; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  // Reads are newest-first; the first observation seen per month IS that
  // month's last available trading day.
  const monthEnd = new Map<string, RegimeNormalizedObservation>();
  for (const o of rail) {
    const month = o.obs_date.slice(0, 7);
    if (!monthEnd.has(month)) monthEnd.set(month, o);
  }
  const monthEnds = months.map(mo => monthEnd.get(mo)).filter((o): o is RegimeNormalizedObservation => !!o);
  if (monthEnds.length < SMA_MONTHS) {
    return {
      ok: false,
      cited: [],
      reason: `RACE_EQ_TR yields ${monthEnds.length} month-end observations — fewer than ${SMA_MONTHS} for the SMA (§3.6)`,
    };
  }

  const sma = monthEnds.reduce((s, o) => s + o.value, 0) / SMA_MONTHS;
  const index = newest.value;

  let target: string | null = null;
  if (index <= TREND_BELOW_FACTOR * sma) target = 'below';
  else if (index >= TREND_ABOVE_FACTOR * sma) target = 'above';

  // §3.0 cold start: nearer marker; equidistant → cautious (below path)
  const distBelow = Math.abs(index - TREND_BELOW_FACTOR * sma);
  const distAbove = Math.abs(index - TREND_ABOVE_FACTOR * sma);
  const coldStart = distBelow <= distAbove ? 'below' : 'above';

  const cited = monthEnds.map(o => cite('RACE_EQ_TR', o));
  if (!monthEnds.includes(newest)) cited.push(cite('RACE_EQ_TR', newest));

  return { ok: true, target, coldStart, cited, flags: { index, sma10: sma } };
}

// ─── Volatility axis (§3.2) ─────────────────────────────────────────────────

export function readVolAxis(reads: RaceAsOfReads): BAxisReading {
  const rail = reads['RACE_EQ_TR'] ?? [];
  if (rail.length < VOL_RETURN_COUNT + 1) {
    return {
      ok: false,
      cited: [],
      reason: `RACE_EQ_TR as-of read has ${rail.length} observations — fewer than the ${VOL_RETURN_COUNT + 1} needed for ${VOL_RETURN_COUNT} daily returns (§3.6)`,
    };
  }
  // Newest-first: returns between consecutive observations, newest window.
  const window = rail.slice(0, VOL_RETURN_COUNT + 1);
  const returns: number[] = [];
  for (let i = 0; i < VOL_RETURN_COUNT; i++) {
    returns.push(Math.log(window[i].value / window[i + 1].value));
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (returns.length - 1);
  const sigma = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100; // percent, annualized

  let target: string | null = null;
  if (sigma >= VOL_HIGH_MARKER) target = 'volatile';
  else if (sigma <= VOL_CALM_MARKER) target = 'calm';

  // §3.0 cold start: nearer marker; equidistant → cautious (volatile)
  const distHigh = Math.abs(sigma - VOL_HIGH_MARKER);
  const distCalm = Math.abs(sigma - VOL_CALM_MARKER);
  const coldStart = distHigh <= distCalm ? 'volatile' : 'calm';

  return {
    ok: true,
    target,
    coldStart,
    cited: window.map(o => cite('RACE_EQ_TR', o)),
    flags: { realized_vol_pct: sigma },
  };
}

// ─── Base-cell evaluation (one grid or storm-exit seed date) ────────────────

export interface BBaseResult {
  ok: boolean;
  trend?: RaceAxisState;
  vol?: RaceAxisState;
  label?: string;
  cited: RaceCitedInput[];
  flags: Record<string, unknown>;
  reason?: string;
}

export function evaluateBBase(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderBState
): BBaseResult {
  const trend = readTrendAxis(evalDate, reads);
  if (!trend.ok) return { ok: false, cited: [], flags: {}, reason: trend.reason };

  const vol = readVolAxis(reads);
  if (!vol.ok) return { ok: false, cited: [], flags: {}, reason: vol.reason };

  const nextTrend = stepAxis(state.trend, trend.target ?? null, trend.coldStart ?? 'below');
  const nextVol = stepAxis(state.vol, vol.target ?? null, vol.coldStart ?? 'volatile');

  // The two axes read overlapping RACE_EQ_TR windows — cite each
  // observation once (RACE_RULES §8: every value used, not every use).
  const seen = new Set<string>();
  const cited: RaceCitedInput[] = [];
  for (const c of [...trend.cited, ...vol.cited]) {
    const key = `${c.series}|${c.obs_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cited.push(c);
  }

  return {
    ok: true,
    trend: nextTrend,
    vol: nextVol,
    label: CELL_LABELS[`${nextTrend.state}|${nextVol.state}`],
    cited,
    flags: { ...trend.flags, ...vol.flags },
  };
}

// ─── Grid-date evaluation (the runner's monthly call) ───────────────────────

export interface BGridOutcome {
  evaluation: ContenderEvaluation;
  state: ContenderBState;
}

export function evaluateBGridDate(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderBState,
  stormCited: RaceCitedInput[]
): BGridOutcome {
  const base = evaluateBBase(evalDate, reads, state);
  if (!base.ok) {
    return {
      evaluation: { classifiable: false, citedInputs: [], unclassifiableReason: base.reason },
      state,
    };
  }

  const nextState: ContenderBState = { ...state, trend: base.trend!, vol: base.vol! };
  const label = state.storm.active ? 'stress' : base.label!;
  const extraEvidence: Record<string, unknown> = { ...base.flags };
  if (state.storm.active) {
    extraEvidence.storm_active = true;
    extraEvidence.base_axes = { trend: base.trend!.state, vol: base.vol!.state };
  }

  return {
    evaluation: {
      classifiable: true,
      label,
      equityWeight: CONTENDER_B_WEIGHTS[label],
      citedInputs: [...base.cited, ...stormCited],
      extraEvidence,
    },
    state: nextState,
  };
}

/** Storm-exit seeding — the shared override's exit seeds B's base state
 *  from the exit-day computation, exactly as it seeds A's (B §3.3 adopts
 *  A §3.3 verbatim, including F7(b)'s seeding clause). */
export function seedBOnStormExit(
  evalDate: string,
  reads: RaceAsOfReads,
  state: ContenderBState,
  stormCited: RaceCitedInput[]
): BGridOutcome {
  const base = evaluateBBase(evalDate, reads, state);
  if (!base.ok) {
    return {
      evaluation: { classifiable: false, citedInputs: [], unclassifiableReason: base.reason },
      state,
    };
  }
  const nextState: ContenderBState = { ...state, trend: base.trend!, vol: base.vol! };
  return {
    evaluation: {
      classifiable: true,
      label: base.label!,
      equityWeight: CONTENDER_B_WEIGHTS[base.label!],
      citedInputs: [...base.cited, ...stormCited],
      extraEvidence: { ...base.flags, storm_exit_seed: true },
    },
    state: nextState,
  };
}
