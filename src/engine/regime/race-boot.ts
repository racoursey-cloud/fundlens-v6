/**
 * FundLens v8 — The Race: gated one-shot execution boot task (A2 Task 7a)
 *
 * MERGE = GO (Fabio's Task 7a order, July 11, 2026; Robert's merge click is
 * the reserved production-execution act, recorded in git — the A1 backfill
 * S4-gate / Task 5 rail-adoption pattern, third use of the ratified shape).
 *
 * THE GATE, in order (nothing here ever runs twice):
 *   1. A COMPLETED race run row exists → skip forever.
 *   2. Classification rows exist without one → RESUME (ignore-duplicates
 *      makes resume safe; the determinism pair compares full-walk dumps,
 *      which resume does not disturb).
 *   3. Stale-yardstick guard: boot date past 2026-07-31 → refuse + alert.
 *      (The wall clock may REFUSE a run; it never scopes one — boundaryDate
 *      below is an explicit literal, and every evaluation stays pure.)
 *
 * SEQUENCE (the Task 7 order, verbatim): in-venue spec-hash preflight as a
 * hard gate (four runtime hashes must match the S5 anchors — no match:
 * alert, abort, zero writes) → printed pre-count → Leg 1 run #1 → Leg 1
 * run #2 with canonical-dump SHA-256s compared (mismatch: alert, run row
 * failed, HALT before Leg 2 — RACE_RULES §8, acceptance §7.2) → Leg 2 once
 * → read-only audits (§7.3 vintage law over every replay citation, §7.7
 * rules_version set, zero basis='record' rows, Leg-1 counts vs the S5
 * yardstick — misses are STOP-grade) → run row completed → THE LEDGER
 * EMAIL, the machine-readable digest RACE_RESULTS.md is generated from.
 *
 * Bookkeeping rides regime_ingest_runs (kind='manual', the error field as
 * the note below, A0 heartbeat) — the rail-adoption precedent, no DDL.
 * Failure at any gate: admin alert with the finding; the run row fails;
 * nothing silent. No Claude call anywhere in the race path (charter §2.3).
 */

import { createHash } from 'node:crypto';
import { supaFetch } from '../supabase.js';
import { sendAdminAlert } from '../admin-alert.js';
import { startRunHeartbeat } from '../monitor.js';
import type { RegimeIngestRunRow } from '../types.js';
import {
  raceExecute,
  computeRulesVersion,
  fetchRailCache,
  simulateMetricThree,
  monthEndGrid,
} from './race.js';
import type { IntendedRow, RaceRunSummary, MetricThreeResult, RailCache } from './race.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** The run-row note — also the completed-run detection key */
const RACE_RUN_NOTE = 'RACE EXECUTE (not an error): A2 Task 7';

/** Explicit run boundary (Task 7a order): grids end 2026-06-30 */
const BOUNDARY_DATE = '2026-07-12';

/** Stale-yardstick guard: a boot after this date refuses rather than run
 *  against a stale yardstick (the S5 counts assume grids ending June 2026) */
const YARDSTICK_STALE_AFTER = '2026-07-31';

/** The S5 anchors — the in-venue runtime hashes must reproduce these
 *  exactly, or nothing runs (Task 7 order §1) */
const S5_SPEC_ANCHORS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'a323a1c092a05018d543e945e209b95c3f2051a07471de2ef44d007b727e2b8d',
  B: '2a6b17703feda7c410d081e3114c152fa5b6852462e07d0164f86e9f5fc9c305',
  C: '77f8310fe72845b958cae8ada956bd0351e816ffe099ea01bf113defe21240f4',
  D: 'e2c0662270165f1f223f7a530331a8fa3150ee1f83bfcba9c6136118c43dac3b',
};

/** The S5 yardstick: EXACT Leg-1 row-count predictions per engine — any
 *  miss is a STOP-grade finding (S5 ruling; Task 7 order §2d) */
const LEG1_YARDSTICK: Record<string, number> = {
  A: 202,
  B: 473,
  C: 201,
  'D:static_conservative': 1200,
  'D:static_balanced': 1200,
  'D:static_growth': 1200,
};

/** Acceptance: B's Leg-1 first classified grid date, unconditional */
const B_EXPECTED_FIRST_CLASSIFIED = '1990-01-31';

const ENGINES = ['A', 'B', 'C', 'D:static_conservative', 'D:static_balanced', 'D:static_growth'];

/** RACE_RULES §7 overlap windows for metric 3 (honest starts; grid end from
 *  BOUNDARY_DATE). D meets each opponent on that opponent's window; its
 *  solo deep window is labeled additional evidence. */
const GRID_END = '2026-06-30';
const WINDOW_AC = { from: '2011-05-31', to: GRID_END };
const WINDOW_B = { from: '1990-01-31', to: GRID_END };
const WINDOW_D_SOLO = { from: '1926-07-31', to: GRID_END };
const WINDOW_LEG2 = { from: '1990-01-31', to: GRID_END };

// ─── Digest shapes (the ledger the results doc is generated from) ───────────

interface TransitionEntry {
  date: string;
  label: string;
  row_kind: string;
}

interface DwellStat {
  label: string;
  spans: number;
  meanRows: number;
  minRows: number;
}

interface EngineDigest {
  engine: string;
  basis: string;
  rows: number;
  firstClassified: string | null;
  lastClassified: string | null;
  gridDates: number;
  classifiedGridDates: number;
  coveragePct: number;
  transitions: TransitionEntry[];
  dwell: DwellStat[];
  revertFlaps: number;
  unclassifiable: Array<{ date: string; reason: string }>;
}

// ─── Digest computation (pure, from the run's in-memory rows) ───────────────

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function engineRows(rows: IntendedRow[], engine: string, basis: string): IntendedRow[] {
  return rows
    .filter(r => r.engine === engine && r.basis === basis)
    .sort((a, b) => a.classification_date.localeCompare(b.classification_date));
}

function computeTransitions(rows: IntendedRow[]): TransitionEntry[] {
  const out: TransitionEntry[] = [];
  let prevLabel: string | null = null;
  for (const r of rows) {
    const kind = (r.inputs as { row_kind?: string }).row_kind ?? 'grid';
    if (r.regime_label !== prevLabel || kind !== 'grid') {
      out.push({ date: r.classification_date, label: r.regime_label, row_kind: kind });
    }
    prevLabel = r.regime_label;
  }
  return out;
}

function computeDwell(rows: IntendedRow[]): { dwell: DwellStat[]; revertFlaps: number } {
  const spans: Array<{ label: string; length: number }> = [];
  for (const r of rows) {
    const last = spans[spans.length - 1];
    if (last && last.label === r.regime_label) last.length++;
    else spans.push({ label: r.regime_label, length: 1 });
  }
  let revertFlaps = 0;
  for (let i = 1; i < spans.length - 1; i++) {
    if (spans[i].length === 1 && spans[i - 1].label === spans[i + 1].label) revertFlaps++;
  }
  const byLabel = new Map<string, number[]>();
  for (const s of spans) {
    if (!byLabel.has(s.label)) byLabel.set(s.label, []);
    byLabel.get(s.label)!.push(s.length);
  }
  const dwell = [...byLabel.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, lengths]) => ({
      label,
      spans: lengths.length,
      meanRows: Number((lengths.reduce((s, l) => s + l, 0) / lengths.length).toFixed(2)),
      minRows: Math.min(...lengths),
    }));
  return { dwell, revertFlaps };
}

function buildEngineDigest(
  rows: IntendedRow[],
  summaries: RaceRunSummary['perContender'],
  engine: string,
  basis: string
): EngineDigest {
  const mine = engineRows(rows, engine, basis);
  const summary = summaries.find(p => p.engine === engine && p.basis === basis);
  const { dwell, revertFlaps } = computeDwell(mine);
  return {
    engine,
    basis,
    rows: mine.length,
    firstClassified: mine[0]?.classification_date ?? null,
    lastClassified: mine[mine.length - 1]?.classification_date ?? null,
    gridDates: summary?.gridDates ?? 0,
    classifiedGridDates: summary?.classifiedGridDates ?? 0,
    coveragePct: summary ? Number(((summary.classifiedGridDates / summary.gridDates) * 100).toFixed(2)) : 0,
    transitions: computeTransitions(mine),
    dwell,
    revertFlaps,
    unclassifiable: summary?.unclassifiableSample.length === summary?.unclassifiableCount
      ? (summary?.unclassifiableSample ?? [])
      : (summary?.unclassifiableSample ?? []),
  };
}

/** Acceptance §7.3: every replay row's cited vintage date ≤ its
 *  classification date — full coverage over the in-memory rows, which the
 *  determinism pair proves identical to what landed. */
function auditVintageLaw(rows: IntendedRow[]): { checked: number; violations: string[] } {
  let checked = 0;
  const violations: string[] = [];
  for (const r of rows) {
    if (r.basis !== 'replay') continue;
    const cited = (r.inputs as { cited?: Array<{ series: string; realtime_start: string }> }).cited ?? [];
    for (const c of cited) {
      checked++;
      if (c.realtime_start > r.classification_date) {
        violations.push(`${r.engine} ${r.classification_date}: ${c.series} vintage ${c.realtime_start}`);
      }
    }
  }
  return { checked, violations };
}

// ─── Read-only DB audits ────────────────────────────────────────────────────

async function countWhere(params: Record<string, string>): Promise<number> {
  const { count, error } = await supaFetch('regime_classifications', {
    params: { ...params, select: 'id', limit: '1' },
    headers: { Prefer: 'count=exact' },
  });
  if (error) throw new Error(`race-boot audit count failed: ${error}`);
  return count ?? 0;
}

interface DbAudit {
  totalRows: number;
  recordRows: number;
  countsByEngineBasis: Record<string, number>;
  rulesVersionCounts: Record<string, number>;
  foreignRulesVersionRows: number;
}

async function runDbAudits(rulesVersions: Record<'A' | 'B' | 'C' | 'D', string>): Promise<DbAudit> {
  const totalRows = await countWhere({});
  const recordRows = await countWhere({ basis: 'eq.record' });
  const countsByEngineBasis: Record<string, number> = {};
  for (const engine of ENGINES) {
    for (const basis of ['replay', 'revised_study']) {
      countsByEngineBasis[`${engine}|${basis}`] = await countWhere({
        engine: `eq.${engine}`,
        basis: `eq.${basis}`,
      });
    }
  }
  const rulesVersionCounts: Record<string, number> = {};
  for (const [name, hash] of Object.entries(rulesVersions)) {
    rulesVersionCounts[name] = await countWhere({ rules_version: `eq.${hash}` });
  }
  const foreignRulesVersionRows = await countWhere({
    rules_version: `not.in.(${Object.values(rulesVersions).join(',')})`,
  });
  return { totalRows, recordRows, countsByEngineBasis, rulesVersionCounts, foreignRulesVersionRows };
}

// ─── Metric 3 suite (RACE_RULES §6 metric 3, §7 overlap law) ────────────────

function metricThreeSuite(rows: IntendedRow[], rail: RailCache): Record<string, MetricThreeResult[]> {
  const dMixes = ['D:static_conservative', 'D:static_balanced', 'D:static_growth'];
  const suite: Record<string, MetricThreeResult[]> = {};
  // Leg 1, A/C window: everyone meets here (head-to-head on overlap, §7)
  suite['leg1_window_2011'] = ['A', 'B', 'C', ...dMixes].map(e =>
    simulateMetricThree(e, 'replay', rows, rail, WINDOW_AC)
  );
  // Leg 1, B's window: B vs D (A/C cannot honestly reach it — stated, not skipped)
  suite['leg1_window_1990'] = ['B', ...dMixes].map(e =>
    simulateMetricThree(e, 'replay', rows, rail, WINDOW_B)
  );
  // Leg 1, D solo deep window: additional evidence, labeled (§7)
  suite['leg1_window_1926_solo_D'] = dMixes.map(e =>
    simulateMetricThree(e, 'replay', rows, rail, WINDOW_D_SOLO)
  );
  // Leg 2, labeled study: everyone from 1990
  suite['leg2_window_1990_labeled_study'] = ['A', 'B', 'C', ...dMixes].map(e =>
    simulateMetricThree(e, 'revised_study', rows, rail, WINDOW_LEG2)
  );
  return suite;
}

// ─── The gated one-shot ─────────────────────────────────────────────────────

export async function runRaceIfNeeded(): Promise<void> {
  // Gate 1: a completed race run exists → skip forever
  const { data: doneRun } = await supaFetch<RegimeIngestRunRow>('regime_ingest_runs', {
    params: { kind: 'eq.manual', status: 'eq.completed', error: `eq.${RACE_RUN_NOTE}`, limit: '1' },
    single: true,
  });
  if (doneRun) {
    console.log('[race-boot] A completed race run exists — the race ran once, skipping forever');
    return;
  }

  // Gate 2: classification rows without a completed run → resume
  const preCount = await countWhere({});
  const resuming = preCount > 0;

  // Gate 3: stale-yardstick guard — the wall clock may refuse, never scope
  const bootDate = new Date().toISOString().slice(0, 10);
  if (bootDate > YARDSTICK_STALE_AFTER) {
    console.error(`[race-boot] REFUSED: boot date ${bootDate} is past ${YARDSTICK_STALE_AFTER} — the S5 yardstick is stale`);
    sendAdminAlert(
      'The race did NOT run — its expectations have gone stale',
      `<p>The race trigger refused to start: today (${bootDate}) is past ${YARDSTICK_STALE_AFTER}, ` +
        `and the S5-ratified row-count expectations assume grids ending 2026-06-30. Running against a ` +
        `stale yardstick would make every acceptance comparison meaningless. Fabio re-rules the ` +
        `yardstick, then this guard is amended — nothing was written.</p>`
    ).catch(() => {});
    return;
  }

  const { data: run } = await supaFetch<RegimeIngestRunRow>('regime_ingest_runs', {
    method: 'POST',
    body: { kind: 'manual', status: 'running', error: RACE_RUN_NOTE },
    headers: { Prefer: 'return=representation' },
    single: true,
  });
  if (!run) {
    console.error('[race-boot] Could not create the race run row — will retry next boot');
    return;
  }
  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');
  const startedMs = Date.now(); // bookkeeping only — no evaluation sees this

  const fail = async (finding: string, htmlDetail: string): Promise<void> => {
    console.error(`[race-boot] FAILED: ${finding}`);
    await supaFetch('regime_ingest_runs', {
      method: 'PATCH',
      body: { status: 'failed', completed_at: new Date().toISOString(), error: `RACE EXECUTE FAILED: ${finding}` },
      params: { id: `eq.${run.id}` },
    });
    sendAdminAlert('The race stopped on a finding — nothing silent', htmlDetail).catch(() => {});
  };

  try {
    // Preflight 1: in-venue spec hashes must reproduce the S5 anchors
    const rulesVersions = {
      A: computeRulesVersion('A'),
      B: computeRulesVersion('B'),
      C: computeRulesVersion('C'),
      D: computeRulesVersion('D'),
    };
    console.log(
      `[race-boot] In-venue rules_version: A ${rulesVersions.A} · B ${rulesVersions.B} · C ${rulesVersions.C} · D ${rulesVersions.D}`
    );
    const hashMisses = (Object.keys(S5_SPEC_ANCHORS) as Array<'A' | 'B' | 'C' | 'D'>).filter(
      k => rulesVersions[k] !== S5_SPEC_ANCHORS[k]
    );
    if (hashMisses.length > 0) {
      await fail(
        `spec-hash preflight: ${hashMisses.join(', ')} do not match the S5 anchors — zero writes`,
        `<p>The in-venue spec files hash differently than the S5-anchored frozen specs ` +
          `(${hashMisses.join(', ')}). The race refused to start and wrote nothing. Either the deploy ` +
          `does not carry the ratified files or something touched them — a finding for Fabio.</p>`
      );
      return;
    }

    // Preflight 2: printed pre-count (expect 0 fresh; >0 = resume, safe)
    console.log(`[race-boot] Pre-count: ${preCount} classification rows${resuming ? ' — RESUMING (ignore-duplicates)' : ''}`);

    // Preflight 3: the rail cache, gated on the S4 print (R1/R3)
    const rail = await fetchRailCache();
    console.log(`[race-boot] Rail cache: ${rail.rows.length} trading days; csv sha256 ${rail.csvSha256}; build note: ${rail.buildNote}`);

    // Leg 1, run #1
    const leg1a = await raceExecute({ boundaryDate: BOUNDARY_DATE, legs: ['replay'] });
    const dump1Sha = sha256(leg1a.dump);
    console.log(`[race-boot] Leg 1 run #1: ${leg1a.written} rows written, ${leg1a.totalRows} intended, dump sha256 ${dump1Sha}`);

    // Leg 1, run #2 — the determinism pair (RACE_RULES §8, acceptance §7.2)
    const leg1b = await raceExecute({ boundaryDate: BOUNDARY_DATE, legs: ['replay'] });
    const dump2Sha = sha256(leg1b.dump);
    console.log(`[race-boot] Leg 1 run #2: ${leg1b.written} new rows (expect 0), dump sha256 ${dump2Sha}`);
    if (dump1Sha !== dump2Sha) {
      await fail(
        `determinism pair broke: run #1 ${dump1Sha} ≠ run #2 ${dump2Sha} — HALTED before Leg 2`,
        `<p>Two consecutive full Leg-1 walks produced different canonical dumps — the byte-identical ` +
          `law (RACE_RULES §8) failed. Leg 2 did not run. The Leg-1 rows stand in the table for ` +
          `diagnosis; nothing further was written. This is a STOP.</p>`
      );
      return;
    }

    // Leg 2, once
    const leg2 = await raceExecute({ boundaryDate: BOUNDARY_DATE, legs: ['revised_study'] });
    console.log(`[race-boot] Leg 2: ${leg2.written} rows written, ${leg2.totalRows} intended`);

    // Read-only audits
    const allRows = [...leg1b.rows, ...leg2.rows];
    const vintage = auditVintageLaw(leg1b.rows);
    const db = await runDbAudits(rulesVersions);
    const yardstickMisses: string[] = [];
    for (const [engine, expected] of Object.entries(LEG1_YARDSTICK)) {
      const actual = db.countsByEngineBasis[`${engine}|replay`] ?? 0;
      if (actual !== expected) yardstickMisses.push(`${engine}: expected ${expected}, actual ${actual}`);
    }
    const bFirst = engineRows(leg1b.rows, 'B', 'replay')[0]?.classification_date ?? 'none';
    const audits = {
      vintageLaw: { checked: vintage.checked, violations: vintage.violations },
      recordRows: db.recordRows,
      foreignRulesVersionRows: db.foreignRulesVersionRows,
      rulesVersionCounts: db.rulesVersionCounts,
      leg1YardstickMisses: yardstickMisses,
      bFirstClassified: { expected: B_EXPECTED_FIRST_CLASSIFIED, actual: bFirst },
    };

    const auditFindings: string[] = [];
    if (vintage.violations.length > 0) auditFindings.push(`§7.3 vintage law: ${vintage.violations.length} violations`);
    if (db.recordRows !== 0) auditFindings.push(`${db.recordRows} basis='record' rows exist`);
    if (db.foreignRulesVersionRows !== 0) auditFindings.push(`${db.foreignRulesVersionRows} rows carry a rules_version outside the four anchors`);
    if (yardstickMisses.length > 0) auditFindings.push(`Leg-1 yardstick misses (STOP-grade): ${yardstickMisses.join('; ')}`);
    if (bFirst !== B_EXPECTED_FIRST_CLASSIFIED) auditFindings.push(`B first classified ${bFirst} ≠ ${B_EXPECTED_FIRST_CLASSIFIED}`);

    // The digest the results document is generated from
    const digest = {
      venue: 'production boot (Railway) — the deployed engine, the sanctioned code path',
      boundaryDate: BOUNDARY_DATE,
      bootDate,
      resumed: resuming,
      preCount,
      rulesVersions,
      rail: { csvSha256: rail.csvSha256, buildNote: rail.buildNote, tradingDays: rail.rows.length },
      leg1: { dumpSha256Run1: dump1Sha, dumpSha256Run2: dump2Sha, written: leg1a.written, rewrittenOnRun2: leg1b.written, reads: leg1a.totalReads },
      leg2: { written: leg2.written, reads: leg2.totalReads },
      audits,
      engines: (['replay', 'revised_study'] as const).flatMap(basis =>
        ENGINES.map(engine =>
          buildEngineDigest(allRows, [...leg1b.perContender, ...leg2.perContender], engine, basis)
        )
      ),
      metric3: metricThreeSuite(allRows, rail),
      wallSeconds: Math.round((Date.now() - startedMs) / 1000),
    };

    if (auditFindings.length > 0) {
      await fail(
        auditFindings.join(' · '),
        `<p>The race executed but the post-run audits surfaced findings — STOP-grade, for Fabio:</p>` +
          `<ul>${auditFindings.map(f => `<li>${f}</li>`).join('')}</ul>` +
          `<p>The rows stand in the table for diagnosis. The full ledger follows for the record.</p>` +
          `<pre>${JSON.stringify(digest, null, 1)}</pre>`
      );
      return;
    }

    await supaFetch('regime_ingest_runs', {
      method: 'PATCH',
      body: {
        status: 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: ENGINES.length,
        rows_written: leg1a.written + leg2.written,
      },
      params: { id: `eq.${run.id}` },
    });

    console.log(
      `[race-boot] RACE COMPLETE: ${leg1a.written} replay + ${leg2.written} revised_study rows, ` +
        `determinism pair identical (${dump1Sha}), all audits clean, ${digest.wallSeconds}s`
    );

    await sendAdminAlert(
      'The race has run — both legs in, determinism proven, audits clean',
      `<p>The A2 race executed on this boot, once and finally. Leg 1 was run twice and produced ` +
        `byte-identical output (the determinism law holds); Leg 2 is labeled study context. Every ` +
        `audit passed: the vintage law (${vintage.checked.toLocaleString()} citations checked, zero ` +
        `violations), zero record-basis rows, the four spec hashes exactly, and every Leg-1 row count ` +
        `landed exactly on the S5 yardstick. Robert rules at S6 from the published results document, ` +
        `which Clyde now drafts from the ledger below.</p>` +
        `<p><strong>THE RUN LEDGER (machine-readable — the source for RACE_RESULTS.md):</strong></p>` +
        `<pre>${JSON.stringify(digest, null, 1)}</pre>`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fail(
      msg,
      `<p>The race stopped with an error:</p><p><strong>${msg}</strong></p>` +
        `<p>Already-written rows stand (ignore-duplicates makes a rerun a safe resume). ` +
        `The next boot resumes automatically unless a completed run row exists.</p>`
    );
  } finally {
    stopHeartbeat();
  }
}
