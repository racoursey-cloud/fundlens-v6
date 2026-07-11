/**
 * FundLens v8 — The Race Runner (A2 Task 6)
 *
 * Walks each contender's decision grid per RACE_RULES.md AS FROZEN at blob
 * ea44a7dc… — month-end base grid from each honest start (§2), the shared
 * storm override evaluated every business day (§2 as amended at S2), the
 * §3 constraint and whipsaw model for metric-3 accounting — performs EVERY
 * data read itself, feeds the pure contender modules, and writes
 * regime_classifications rows.
 *
 * THE TWO LEGS (RACE_RULES §1, ruling D1):
 *   Leg 1 — basis='replay': history through asOf() EXCLUSIVELY. Contender
 *   modules import no data access (provable by inspection, acceptance
 *   §7.1); this runner is the only place reads happen, and Leg 1's reads
 *   all go through the one door.
 *   Leg 2 — basis='revised_study': history through ONE separate,
 *   loudly-named reader (readRevisedBasisCurrentVintage_LEG2_ONLY below),
 *   1990-01 forward, labeled on every row. The Leg-2 leg descriptor is the
 *   only construction that pairs that reader with a writer, and that
 *   writer's basis is the hardcoded literal 'revised_study' — mechanically
 *   incapable of stamping anything else.
 *
 * ROW CONTRACT (regime_classifications DDL; Fabio's Task 6 order §2):
 *   one row per grid date per contender per leg; override transition rows
 *   (A, B, C) dated the evaluation day; a transition landing ON a grid
 *   date merges into that grid row (the unique index
 *   (classification_date, basis, engine, rules_version) forbids two);
 *   engine strings 'A' | 'B' | 'C' | 'D:<mix>' (mix-distinct per ruling);
 *   rules_version = SHA-256 of the in-repo ratified spec file, computed at
 *   run time, never hardcoded; inputs jsonb cites every value used.
 *   Unclassifiable dates write NO row and count against coverage.
 *
 * THE METRIC-3 RAIL CACHE (Task 5 order; CONTENDER_B §4.3): the D2 daily
 * file is fetched once per race execution and held IN PROCESS — never a
 * database table, never committed, never touching regime tables or the
 * production scoring path. It exists because the two-asset arithmetic
 * needs the daily RF leg separately, and only the combined RACE_EQ_TR
 * index was adopted into the vintage memory. First-row values gate
 * (Mkt-RF 0.09 / RF 0.01 at 19260701, R3 scope); digest drift is logged
 * evidence, never a gate.
 *
 * STOP S5: dry-run mode walks a bounded range and PRINTS intended rows —
 * production regime_classifications stays untouched until S5 clears.
 * Nothing wires this module to any schedule; execution is Task 7's, after
 * the S5 ruling, with an explicit run boundary date (no wall-clock
 * defaults anywhere in race scoping).
 *
 * No Claude call anywhere in the race path (charter §2.3).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { asOf } from './asof.js';
import { supaFetch, supaSelect } from '../supabase.js';
import {
  FRENCH_DAILY_FACTORS_URL,
  unzipSingleEntry,
  parseFrenchDailyCsv,
  reconcileAgainstS4Print,
} from './sources/french.js';
import type { FrenchDailyFile } from './sources/french.js';
import type {
  RegimeNormalizedObservation,
  RegimeObservationRow,
  RegimeSeriesRow,
  RaceAsOfReads,
  RaceCitedInput,
  ContenderEvaluation,
} from '../types.js';
import {
  evaluateStorm,
  evaluateAGridDate,
  seedAOnStormExit,
  initialAState,
  CONTENDER_A_WEIGHTS,
} from './contenders/a.js';
import type { ContenderAState } from './contenders/a.js';
import {
  evaluateBGridDate,
  seedBOnStormExit,
  initialBState,
  CONTENDER_B_WEIGHTS,
} from './contenders/b.js';
import type { ContenderBState } from './contenders/b.js';
import { evaluateCGridDate, seedCOnStormExit, initialCState } from './contenders/c.js';
import type { ContenderCState } from './contenders/c.js';
import { CONTENDER_D_MIXES, evaluateDGridDate } from './contenders/d.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** Honest starts per the frozen specs (each spec §2/§3; the runner prints
 *  actual first classified dates — coverage accounting reports the truth) */
const HONEST_START: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '2011-05-31', // CONTENDER_A §2: latest required-input earliest-vintage (CFNAI)
  B: '1990-01-02', // CONTENDER_B §2: VIXCLS earliest vintage; first grid 1990-01-31
  C: '2011-05-31', // CONTENDER_C §2: max of parents (CFNAI binding)
  D: '1926-07-01', // CONTENDER_D §3: the rail's verified start, no warm-up
};

/** Leg 2 span: current-vintage history from 1990-01 forward (RACE_RULES §1) */
const LEG2_START = '1990-01-02';

/** The rail's CSV identity (SOURCE_VINTAGE_POLICIES §7; drift = evidence) */
const RAIL_CSV_IDENTITY_SHA256 =
  'f051e37d30c129359c6801d9d2a715c929b19aa3be0ffe684b93995ede9ffebb';

/** asOf window lengths per series — trailing observations each read asks
 *  for. Sized to each spec's stated need plus slack; oversupply is free
 *  (contenders use what their frozen rules name, cite what they use). */
const READ_WINDOWS: Record<string, number> = {
  CFNAI: 4, // §3.1 needs the 3 newest
  SAHMREALTIME: 1,
  PCEPILFE: 14, // newest + the observation 12 months prior (monthly)
  CPILFESL: 14,
  CPIAUCSL: 14,
  T10YIE: 1,
  CLEV_CPI_NOWCAST: 1,
  NFCI: 1,
  VIXCLS: 1,
  OFR_FSI: 1,
  RACE_EQ_TR: 280, // 10 calendar months of trading days (SMA10) + 127 (vol) with slack
};

/** Full-read series per contender (grid dates and storm-exit seed days) */
const GRID_SERIES: Record<'A' | 'B' | 'C', string[]> = {
  A: ['CFNAI', 'SAHMREALTIME', 'PCEPILFE', 'CPILFESL', 'CPIAUCSL', 'T10YIE', 'CLEV_CPI_NOWCAST', 'NFCI', 'VIXCLS', 'OFR_FSI'],
  B: ['RACE_EQ_TR', 'VIXCLS', 'OFR_FSI'],
  C: ['CFNAI', 'SAHMREALTIME', 'PCEPILFE', 'CPILFESL', 'CPIAUCSL', 'T10YIE', 'CLEV_CPI_NOWCAST', 'NFCI', 'RACE_EQ_TR', 'VIXCLS', 'OFR_FSI'],
};

/** RACE_RULES §3: per-switch cost, charged on both legs of a move */
const SWITCH_COST_PER_LEG = 0.001;
/** RACE_RULES §3: roundtrip restriction (calendar days) */
const ROUNDTRIP_DAYS = 30;
/** RACE_RULES §2/§3: override entries/exits act at most weekly */
const OVERRIDE_ACTION_MIN_GAP_DAYS = 7;

const SPEC_PATHS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'docs/regime/contenders/CONTENDER_A.md',
  B: 'docs/regime/contenders/CONTENDER_B.md',
  C: 'docs/regime/contenders/CONTENDER_C.md',
  D: 'docs/regime/contenders/CONTENDER_D.md',
};

// ─── Date helpers (pure) ────────────────────────────────────────────────────

function isWeekday(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

function nextDay(iso: string): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return new Date(t + 86400000).toISOString().slice(0, 10);
}

function isoDaysAfter(iso: string, days: number): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

function monthEnd(y: number, m: number): string {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Month-end grid dates in [from, toExclusiveMonthOf(boundary)) — the last
 *  FULL month before the boundary date ends the grid (RACE_RULES §2). */
export function monthEndGrid(fromIso: string, boundaryIso: string): string[] {
  const [fy, fm] = [Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7))];
  const [by, bm] = [Number(boundaryIso.slice(0, 4)), Number(boundaryIso.slice(5, 7))];
  const grid: string[] = [];
  let [y, m] = [fy, fm];
  while (y < by || (y === by && m < bm)) {
    const end = monthEnd(y, m);
    if (end >= fromIso) grid.push(end);
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return grid;
}

// ─── Runtime spec hashing (computed, never hardcoded — Task 6 order §2) ─────

export function computeRulesVersion(contender: 'A' | 'B' | 'C' | 'D'): string {
  const bytes = readFileSync(SPEC_PATHS[contender]);
  return createHash('sha256').update(bytes).digest('hex');
}

// ─── Readers ────────────────────────────────────────────────────────────────

type RaceReader = (
  seriesCode: string,
  onDate: string,
  windowLength: number
) => Promise<RegimeNormalizedObservation[]>;

interface ReaderContext {
  /** In-process memo — identical reads answered once per run (determinism
   *  is untouched: same inputs, same answer, fewer round-trips) */
  cache: Map<string, RegimeNormalizedObservation[]>;
  /** Earliest stored vintage per snapshot_custom series (Leg-1 gate: asOf
   *  REFUSES pre-snapshot reads by throwing; the runner respects the
   *  boundary instead of steering by exception) */
  snapshotFloors: Map<string, string>;
  /** registry id per series_code, for the Leg-2 reader */
  seriesIds: Map<string, string>;
  reads: number;
}

async function buildReaderContext(): Promise<ReaderContext> {
  const { data: series, error } = await supaSelect<RegimeSeriesRow[]>('regime_series', {});
  if (error || !series) throw new Error(`race: registry read failed: ${error ?? 'no rows'}`);
  const seriesIds = new Map<string, string>();
  for (const s of series) seriesIds.set(s.series_code, s.id);

  const snapshotFloors = new Map<string, string>();
  for (const s of series.filter(x => x.vintage_policy === 'snapshot_custom')) {
    const { data: earliest } = await supaFetch<Pick<RegimeObservationRow, 'realtime_start'>>(
      'regime_observations',
      {
        params: {
          series_id: `eq.${s.id}`,
          select: 'realtime_start',
          order: 'realtime_start.asc',
          limit: '1',
        },
        single: true,
      }
    );
    if (earliest) snapshotFloors.set(s.series_code, earliest.realtime_start);
  }
  return { cache: new Map(), snapshotFloors, seriesIds, reads: 0 };
}

/** Leg 1: the one door (RACE_RULES §1), memoized per run. Pre-snapshot
 *  reads of snapshot_custom series return EMPTY here — the semantic the
 *  specs handle ("unavailable as-published"), matching asOf's refusal
 *  boundary without exception-driven control flow. */
function makeLeg1Reader(ctx: ReaderContext): RaceReader {
  return async (seriesCode, onDate, windowLength) => {
    const floor = ctx.snapshotFloors.get(seriesCode);
    if (floor !== undefined && onDate < floor) return [];
    const key = `1|${seriesCode}|${onDate}|${windowLength}`;
    const hit = ctx.cache.get(key);
    if (hit) return hit;
    const rows = await asOf(seriesCode, onDate, windowLength);
    ctx.reads++;
    ctx.cache.set(key, rows);
    return rows;
  };
}

/**
 * LEG 2 ONLY — the loudly-named revised-basis reader (RACE_RULES §1).
 * Current-vintage reads: realtime_end IS NULL, obs_date ≤ onDate, newest
 * first. This function feeds ONLY the Leg-2 descriptor below, whose writer
 * stamps the hardcoded literal 'revised_study' — no other basis can reach
 * rows built from these reads.
 */
async function readRevisedBasisCurrentVintage_LEG2_ONLY(
  ctx: ReaderContext,
  seriesCode: string,
  onDate: string,
  windowLength: number
): Promise<RegimeNormalizedObservation[]> {
  const seriesId = ctx.seriesIds.get(seriesCode);
  if (!seriesId) return [];
  const key = `2|${seriesCode}|${onDate}|${windowLength}`;
  const hit = ctx.cache.get(key);
  if (hit) return hit;
  const { data: rows, error } = await supaFetch<RegimeObservationRow[]>('regime_observations', {
    params: {
      series_id: `eq.${seriesId}`,
      realtime_end: 'is.null',
      obs_date: `lte.${onDate}`,
      select: 'obs_date,value,realtime_start,realtime_end',
      order: 'obs_date.desc',
      limit: String(windowLength),
    },
  });
  if (error) throw new Error(`race leg2: revised read failed for ${seriesCode}: ${error}`);
  const out = (rows ?? []).map(r => ({
    obs_date: r.obs_date,
    value: Number(r.value),
    realtime_start: r.realtime_start,
    realtime_end: r.realtime_end,
  }));
  ctx.reads++;
  ctx.cache.set(key, out);
  return out;
}

// ─── Leg descriptors (the mechanical basis binding) ─────────────────────────

interface LegDescriptor {
  basis: 'replay' | 'revised_study';
  reader: RaceReader;
  /** Grid start override: Leg 2 runs 1990-01 forward for everyone */
  gridFloor: string | null;
}

function makeLegs(ctx: ReaderContext): { leg1: LegDescriptor; leg2: LegDescriptor } {
  return {
    leg1: { basis: 'replay', reader: makeLeg1Reader(ctx), gridFloor: null },
    leg2: {
      basis: 'revised_study',
      reader: (code, date, win) => readRevisedBasisCurrentVintage_LEG2_ONLY(ctx, code, date, win),
      gridFloor: LEG2_START,
    },
  };
}

// ─── Intended rows ──────────────────────────────────────────────────────────

export interface IntendedRow {
  classification_date: string;
  regime_label: string;
  basis: 'replay' | 'revised_study';
  engine: string;
  rules_version: string;
  inputs: Record<string, unknown>;
}

function buildRow(
  date: string,
  engine: string,
  basis: 'replay' | 'revised_study',
  rulesVersion: string,
  evaluation: ContenderEvaluation,
  rowKind: 'grid' | 'override_entry' | 'override_exit'
): IntendedRow {
  return {
    classification_date: date,
    regime_label: evaluation.label!,
    basis,
    engine,
    rules_version: rulesVersion,
    inputs: {
      row_kind: rowKind,
      weight: evaluation.equityWeight,
      evidence: evaluation.extraEvidence ?? {},
      cited: evaluation.citedInputs,
    },
  };
}

// ─── The contender walk (A, B, C share the storm-interleaved shape) ─────────

interface WalkResult {
  rows: IntendedRow[];
  gridDates: number;
  classifiedGridDates: number;
  unclassifiable: Array<{ date: string; reason: string }>;
  overrideEntries: number;
  overrideExits: number;
}

type StormContender = 'A' | 'B' | 'C';

interface StormWalkHooks {
  grid: (date: string, reads: RaceAsOfReads, stormCited: RaceCitedInput[]) => { evaluation: ContenderEvaluation };
  seed: (date: string, reads: RaceAsOfReads, stormCited: RaceCitedInput[]) => { evaluation: ContenderEvaluation };
  getStorm: () => { active: boolean; dwellBusinessDays: number; consecutiveExitEvals: number };
  setStorm: (s: { active: boolean; dwellBusinessDays: number; consecutiveExitEvals: number }) => void;
}

/**
 * Walk one storm-bearing contender over one leg: business days from the
 * honest start; the shared override evaluated every business day
 * (RACE_RULES §2 as amended); grid rows at month-ends; transition rows on
 * entry/exit days, merged into the grid row when they coincide (row
 * contract). The stress label between transitions is carried by grid rows
 * (storm state rides the contender state).
 */
async function walkStormContender(
  name: StormContender,
  leg: LegDescriptor,
  hooks: StormWalkHooks,
  fromIso: string,
  boundaryIso: string,
  rulesVersion: string
): Promise<WalkResult> {
  const grid = new Set(monthEndGrid(fromIso, boundaryIso));
  const rows: IntendedRow[] = [];
  const unclassifiable: Array<{ date: string; reason: string }> = [];
  let overrideEntries = 0;
  let overrideExits = 0;
  let classifiedGridDates = 0;

  const readAll = async (date: string, series: string[]): Promise<RaceAsOfReads> => {
    const reads: RaceAsOfReads = {};
    for (const code of series) {
      reads[code] = await leg.reader(code, date, READ_WINDOWS[code] ?? 1);
    }
    return reads;
  };

  const lastGrid = [...grid].sort().pop();
  let date = fromIso;
  while (lastGrid !== undefined && date <= lastGrid) {
    if (!isWeekday(date)) {
      date = nextDay(date);
      continue;
    }
    const isGrid = grid.has(date);

    // The shared override, every business day (§2 as amended; A §3.3)
    const vix = (await leg.reader('VIXCLS', date, 1))[0];
    const ofr = (await leg.reader('OFR_FSI', date, 1))[0];
    const storm = evaluateStorm(date, vix, ofr, hooks.getStorm());
    if (storm.evaluated) hooks.setStorm(storm.state);

    if (storm.transition === 'entry') {
      overrideEntries++;
      if (!isGrid) {
        // Entry row: the storm instruments are the classifying inputs
        rows.push(
          buildRow(date, name, leg.basis, rulesVersion, {
            classifiable: true,
            label: 'stress',
            equityWeight: (name === 'A' ? CONTENDER_A_WEIGHTS : CONTENDER_B_WEIGHTS)['stress'],
            citedInputs: storm.cited,
            extraEvidence: { storm_entry: true },
          }, 'override_entry')
        );
      }
    } else if (storm.transition === 'exit') {
      overrideExits++;
      if (!isGrid) {
        const reads = await readAll(date, GRID_SERIES[name]);
        const seeded = hooks.seed(date, reads, storm.cited);
        if (seeded.evaluation.classifiable) {
          rows.push(buildRow(date, name, leg.basis, rulesVersion, seeded.evaluation, 'override_exit'));
        } else {
          unclassifiable.push({ date, reason: seeded.evaluation.unclassifiableReason ?? 'unclassifiable at storm exit' });
        }
      }
    }

    if (isGrid) {
      const reads = await readAll(date, GRID_SERIES[name]);
      const outcome =
        storm.transition === 'exit'
          ? hooks.seed(date, reads, storm.cited)
          : hooks.grid(date, reads, storm.cited);
      if (outcome.evaluation.classifiable) {
        classifiedGridDates++;
        rows.push(
          buildRow(
            date,
            name,
            leg.basis,
            rulesVersion,
            outcome.evaluation,
            storm.transition === 'exit' ? 'override_exit' : storm.transition === 'entry' ? 'override_entry' : 'grid'
          )
        );
      } else {
        unclassifiable.push({ date, reason: outcome.evaluation.unclassifiableReason ?? 'unclassifiable' });
      }
    }

    date = nextDay(date);
  }

  return {
    rows,
    gridDates: grid.size,
    classifiedGridDates,
    unclassifiable,
    overrideEntries,
    overrideExits,
  };
}

// ─── D's walk (no signals, no storms — D §2–§4) ─────────────────────────────

function walkContenderD(leg: LegDescriptor, boundaryIso: string, rulesVersion: string): WalkResult {
  const from = leg.gridFloor ?? HONEST_START.D;
  const grid = monthEndGrid(from, boundaryIso);
  const rows: IntendedRow[] = [];
  for (const date of grid) {
    for (const mix of CONTENDER_D_MIXES) {
      rows.push(buildRow(date, `D:${mix.name}`, leg.basis, rulesVersion, evaluateDGridDate(date, mix), 'grid'));
    }
  }
  return {
    rows,
    gridDates: grid.length,
    classifiedGridDates: grid.length,
    unclassifiable: [],
    overrideEntries: 0,
    overrideExits: 0,
  };
}

// ─── The metric-3 rail cache (quarantined; Task 5 order) ────────────────────

export interface RailCache {
  /** Trading-day rows, oldest first: ISO date, Mkt-RF and RF in percent */
  rows: Array<{ isoDate: string; mktRf: number; rf: number }>;
  csvSha256: string;
  buildNote: string | null;
}

export async function fetchRailCache(): Promise<RailCache> {
  const res = await fetch(FRENCH_DAILY_FACTORS_URL);
  if (!res.ok) throw new Error(`race rail cache fetch returned ${res.status}`);
  const zipBytes = Buffer.from(await res.arrayBuffer());
  const csvBytes = unzipSingleEntry(zipBytes);
  const csvSha256 = createHash('sha256').update(csvBytes).digest('hex');
  const file: FrenchDailyFile = parseFrenchDailyCsv(csvBytes.toString('utf8'));
  reconcileAgainstS4Print(file); // R3 scope: first-row values are the law
  if (csvSha256 !== RAIL_CSV_IDENTITY_SHA256) {
    console.log(
      `[race] rail cache CSV sha256 ${csvSha256} differs from the adoption identity ` +
        `${RAIL_CSV_IDENTITY_SHA256} — a rebuild; logged as evidence, never a gate (§7 policy)`
    );
  }
  return { rows: file.rows, csvSha256, buildNote: file.buildNote };
}

// ─── Metric-3 accounting (RACE_RULES §3, §6 metric 3) ───────────────────────

export interface MetricThreeResult {
  engine: string;
  basis: 'replay' | 'revised_study';
  window: { from: string; to: string };
  finalValue: number;
  totalSwitchCost: number;
  executedSwitches: number;
  roundtripIncidents: number;
  deferredOverrideActions: number;
}

/**
 * Simulate one contender's classified weight timeline under the §3
 * constraint model on the rail cache: T+1 execution at the next trading
 * day, 0.10% per switched dollar on both legs of a move, 30-day roundtrip
 * restriction with incidents counted, override actions at most weekly.
 */
export function simulateMetricThree(
  engine: string,
  basis: 'replay' | 'revised_study',
  rows: IntendedRow[],
  rail: RailCache,
  window: { from: string; to: string }
): MetricThreeResult {
  const timeline = rows
    .filter(r => r.engine === engine && r.basis === basis)
    .map(r => ({
      date: r.classification_date,
      weight: (r.inputs as { weight?: number }).weight ?? 0,
      overrideDriven: (r.inputs as { row_kind?: string }).row_kind !== 'grid',
      // D §2: rebalance rows force a reset trade even though the target
      // weight is unchanged — drift is what the reset unwinds
      forceRebalance:
        ((r.inputs as { evidence?: { rebalance?: boolean } }).evidence?.rebalance ?? false) === true,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (timeline.length === 0) {
    return {
      engine,
      basis,
      window,
      finalValue: 1,
      totalSwitchCost: 0,
      executedSwitches: 0,
      roundtripIncidents: 0,
      deferredOverrideActions: 0,
    };
  }

  const railRows = rail.rows.filter(r => r.isoDate >= window.from && r.isoDate <= window.to);
  let equity = 0;
  let cash = 1;
  let executedWeight = 0;
  let initialized = false;
  let ti = 0;
  let standingTarget: {
    weight: number;
    effectiveFrom: string;
    overrideDriven: boolean;
    forcePending: boolean;
  } | null = null;
  let lastSellDate: string | null = null;
  let lastOverrideExec: string | null = null;
  let totalSwitchCost = 0;
  let executedSwitches = 0;
  let roundtripIncidents = 0;
  let deferredOverrideActions = 0;
  let roundtripCountedForTarget = false;

  for (const day of railRows) {
    // Grow both legs at the day's close
    equity *= 1 + (day.mktRf + day.rf) / 100;
    cash *= 1 + day.rf / 100;

    // Adopt any classifications dated BEFORE today (T+1: signal on D acts
    // at the next trading day's close)
    while (ti < timeline.length && timeline[ti].date < day.isoDate) {
      const t = timeline[ti];
      standingTarget = {
        weight: t.weight,
        effectiveFrom: day.isoDate,
        overrideDriven: t.overrideDriven,
        forcePending: t.forceRebalance,
      };
      roundtripCountedForTarget = false;
      ti++;
    }

    if (!initialized && standingTarget) {
      // First classification: enter the market at the target, cost-free
      // baseline entry (every contender pays the same entry; comparisons
      // start level)
      equity = standingTarget.weight;
      cash = 1 - standingTarget.weight;
      executedWeight = standingTarget.weight;
      initialized = true;
      continue;
    }
    if (!initialized || !standingTarget) continue;

    const currentEquityShare = equity / (equity + cash);
    const wantsTrade =
      Math.abs(standingTarget.weight - executedWeight) > 1e-9 ||
      (standingTarget.forcePending && Math.abs(standingTarget.weight - currentEquityShare) > 1e-9);
    if (wantsTrade) {
      // Tempo cap: override-driven actions at most weekly
      if (
        standingTarget.overrideDriven &&
        lastOverrideExec !== null &&
        day.isoDate < isoDaysAfter(lastOverrideExec, OVERRIDE_ACTION_MIN_GAP_DAYS)
      ) {
        deferredOverrideActions++;
        continue;
      }
      const total = equity + cash;
      const targetEquity = standingTarget.weight * total;
      const increasing = targetEquity > equity;
      // Roundtrip rule: equity sold cannot be repurchased for 30 days
      if (increasing && lastSellDate !== null && day.isoDate < isoDaysAfter(lastSellDate, ROUNDTRIP_DAYS)) {
        if (!roundtripCountedForTarget) {
          roundtripIncidents++;
          roundtripCountedForTarget = true;
        }
        continue;
      }
      const switched = Math.abs(targetEquity - equity);
      const cost = 2 * SWITCH_COST_PER_LEG * switched;
      const afterCost = total - cost;
      equity = standingTarget.weight * afterCost;
      cash = (1 - standingTarget.weight) * afterCost;
      if (!increasing) lastSellDate = day.isoDate;
      if (standingTarget.overrideDriven) lastOverrideExec = day.isoDate;
      executedWeight = standingTarget.weight;
      standingTarget.forcePending = false;
      totalSwitchCost += cost;
      executedSwitches++;
    }
  }

  return {
    engine,
    basis,
    window,
    finalValue: equity + cash,
    totalSwitchCost,
    executedSwitches,
    roundtripIncidents,
    deferredOverrideActions,
  };
}

// ─── Contender orchestration ────────────────────────────────────────────────

async function walkContender(
  name: 'A' | 'B' | 'C',
  leg: LegDescriptor,
  boundaryIso: string,
  rulesVersion: string,
  fromOverride?: string
): Promise<WalkResult> {
  // Leg 1 walks from the contender's honest start; Leg 2 walks from the
  // leg's 1990-01 floor for EVERYONE (RACE_RULES §1: the revised-basis
  // study is where the charter's 30-year span lives — A meets 2008 here).
  const from = fromOverride ?? leg.gridFloor ?? HONEST_START[name];

  if (name === 'A') {
    let state: ContenderAState = initialAState();
    return walkStormContender('A', leg, {
      grid: (d, r, sc) => {
        const o = evaluateAGridDate(d, r, state, sc);
        state = o.state;
        return o;
      },
      seed: (d, r, sc) => {
        const o = seedAOnStormExit(d, r, state, sc);
        state = o.state;
        return o;
      },
      getStorm: () => state.storm,
      setStorm: s => {
        state = { ...state, storm: s };
      },
    }, from, boundaryIso, rulesVersion);
  }
  if (name === 'B') {
    let state: ContenderBState = initialBState();
    return walkStormContender('B', leg, {
      grid: (d, r, sc) => {
        const o = evaluateBGridDate(d, r, state, sc);
        state = o.state;
        return o;
      },
      seed: (d, r, sc) => {
        const o = seedBOnStormExit(d, r, state, sc);
        state = o.state;
        return o;
      },
      getStorm: () => state.storm,
      setStorm: s => {
        state = { ...state, storm: s };
      },
    }, from, boundaryIso, rulesVersion);
  }
  let state: ContenderCState = initialCState();
  return walkStormContender('C', leg, {
    grid: (d, r, sc) => {
      const o = evaluateCGridDate(d, r, state, sc);
      state = o.state;
      return o;
    },
    seed: (d, r, sc) => {
      const o = seedCOnStormExit(d, r, state, sc);
      state = o.state;
      return o;
    },
    // C composes ONE override: the shared storm state is kept in lockstep
    // across both parents' state structs (C §1: one detector, one behavior)
    getStorm: () => state.a.storm,
    setStorm: s => {
      state = { a: { ...state.a, storm: s }, b: { ...state.b, storm: s } };
    },
  }, from, boundaryIso, rulesVersion);
}

// ─── Canonical output dump (RACE_RULES §8 determinism check) ────────────────

/** Canonical, byte-stable serialization of classification output: sorted by
 *  (engine, basis, classification_date), fixed key order, one JSON line per
 *  row. Two consecutive Leg-1 runs must produce identical dumps. */
export function canonicalDump(rows: IntendedRow[]): string {
  return [...rows]
    .sort(
      (a, b) =>
        a.engine.localeCompare(b.engine) ||
        a.basis.localeCompare(b.basis) ||
        a.classification_date.localeCompare(b.classification_date)
    )
    .map(r =>
      JSON.stringify({
        classification_date: r.classification_date,
        regime_label: r.regime_label,
        basis: r.basis,
        engine: r.engine,
        rules_version: r.rules_version,
        inputs: r.inputs,
      })
    )
    .join('\n');
}

// ─── Entry points ───────────────────────────────────────────────────────────

export interface RaceRunOptions {
  /** Explicit run boundary (grids end at the last full month before this).
   *  REQUIRED — no wall-clock default anywhere in race scoping. */
  boundaryDate: string;
  /** Contenders to walk (default: all) */
  contenders?: Array<'A' | 'B' | 'C' | 'D'>;
  /** Legs to walk (default: both) */
  legs?: Array<'replay' | 'revised_study'>;
  /** Dry-run only: clamp every contender's walk start (bounded range) */
  dryRunFrom?: string;
  /** Dry-run only: rows to print per contender per leg */
  sampleLimit?: number;
}

export interface RaceRunSummary {
  mode: 'dry-run' | 'execute';
  boundaryDate: string;
  perContender: Array<{
    engine: string;
    basis: string;
    gridDates: number;
    classifiedGridDates: number;
    rowsIntended: number;
    overrideEntries: number;
    overrideExits: number;
    firstClassified: string | null;
    unclassifiableCount: number;
    unclassifiableSample: Array<{ date: string; reason: string }>;
  }>;
  totalRows: number;
  totalReads: number;
  rows: IntendedRow[];
}

async function walkRace(opts: RaceRunOptions, mode: 'dry-run' | 'execute'): Promise<RaceRunSummary> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.boundaryDate)) {
    throw new Error('race: boundaryDate must be an explicit ISO date — no wall-clock defaults');
  }
  const contenders = opts.contenders ?? (['A', 'B', 'C', 'D'] as const);
  const legNames = opts.legs ?? (['replay', 'revised_study'] as const);
  const ctx = await buildReaderContext();
  const { leg1, leg2 } = makeLegs(ctx);
  const legs = { replay: leg1, revised_study: leg2 } as const;

  const rulesVersions = {
    A: computeRulesVersion('A'),
    B: computeRulesVersion('B'),
    C: computeRulesVersion('C'),
    D: computeRulesVersion('D'),
  };
  console.log(
    `[race] rules_version (computed at run time): A ${rulesVersions.A.slice(0, 12)}… B ${rulesVersions.B.slice(0, 12)}… ` +
      `C ${rulesVersions.C.slice(0, 12)}… D ${rulesVersions.D.slice(0, 12)}…`
  );

  const summary: RaceRunSummary = {
    mode,
    boundaryDate: opts.boundaryDate,
    perContender: [],
    totalRows: 0,
    totalReads: 0,
    rows: [],
  };

  for (const legName of legNames) {
    const leg = legs[legName];
    for (const name of contenders) {
      let result: WalkResult;
      if (name === 'D') {
        result = walkContenderD(leg, opts.boundaryDate, rulesVersions.D);
        if (opts.dryRunFrom) result.rows = result.rows.filter(r => r.classification_date >= opts.dryRunFrom!);
      } else {
        const from = opts.dryRunFrom;
        result = await walkContender(name, leg, opts.boundaryDate, rulesVersions[name], from);
      }
      const engines = name === 'D' ? CONTENDER_D_MIXES.map(m => `D:${m.name}`) : [name];
      for (const engine of engines) {
        const engineRows = result.rows.filter(r => r.engine === engine);
        summary.perContender.push({
          engine,
          basis: leg.basis,
          gridDates: result.gridDates,
          classifiedGridDates: name === 'D' ? result.classifiedGridDates : result.classifiedGridDates,
          rowsIntended: engineRows.length,
          overrideEntries: result.overrideEntries,
          overrideExits: result.overrideExits,
          firstClassified: engineRows.length > 0 ? engineRows[0].classification_date : null,
          unclassifiableCount: result.unclassifiable.length,
          unclassifiableSample: result.unclassifiable.slice(0, 5),
        });
      }
      summary.rows.push(...result.rows);
    }
  }
  summary.totalRows = summary.rows.length;
  summary.totalReads = ctx.reads;
  return summary;
}

/**
 * DRY-RUN (STOP S5): walk a bounded range, PRINT intended rows, write
 * NOTHING. Production regime_classifications stays untouched — there is no
 * write path in this function at all.
 */
export async function raceDryRun(opts: RaceRunOptions): Promise<RaceRunSummary> {
  const summary = await walkRace(opts, 'dry-run');
  const limit = opts.sampleLimit ?? 3;
  console.log(`[race] DRY-RUN — nothing written; ${summary.totalRows} rows intended, ${summary.totalReads} reads`);
  for (const pc of summary.perContender) {
    console.log(
      `[race]   ${pc.engine}/${pc.basis}: ${pc.rowsIntended} rows (${pc.classifiedGridDates}/${pc.gridDates} grid dates classified, ` +
        `${pc.overrideEntries} storm entries, ${pc.overrideExits} exits, ${pc.unclassifiableCount} unclassifiable)`
    );
    for (const row of summary.rows.filter(r => r.engine === pc.engine && r.basis === pc.basis).slice(0, limit)) {
      console.log(`[race]     ${JSON.stringify({ ...row, inputs: { ...row.inputs, cited: `${(row.inputs.cited as unknown[]).length} citations` } })}`);
    }
  }
  return summary;
}

/**
 * FULL EXECUTION — Task 7 only, after S5 clears on the record. Writes
 * batched rows with ignore-duplicates under the table's unique key (safe
 * to resume; §2.5-spirit: never update in place) and returns the summary
 * plus the canonical dump for the §8 determinism check.
 */
export async function raceExecute(
  opts: RaceRunOptions
): Promise<RaceRunSummary & { dump: string; written: number }> {
  const summary = await walkRace(opts, 'execute');
  let written = 0;
  const BATCH = 200;
  for (let i = 0; i < summary.rows.length; i += BATCH) {
    const batch = summary.rows.slice(i, i + BATCH);
    const { data, error } = await supaFetch<unknown[]>('regime_classifications', {
      method: 'POST',
      body: batch,
      params: { on_conflict: 'classification_date,basis,engine,rules_version' },
      headers: { Prefer: 'return=representation, resolution=ignore-duplicates' },
    });
    if (error) throw new Error(`race: writing rows ${i}–${i + batch.length} failed: ${error}`);
    written += Array.isArray(data) ? data.length : batch.length;
  }
  console.log(`[race] EXECUTE: ${written} rows written (${summary.totalRows} intended; duplicates ignored on resume)`);
  return { ...summary, dump: canonicalDump(summary.rows), written };
}
