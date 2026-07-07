/**
 * FundLens v8 — Regime Harness: backfill runner (A1 Task 9, S4-gated)
 *
 * Loads full available history + needed vintages for enabled series —
 * charter §2.3: "run 30+ years as-published."
 *
 * THE S4 GATE, MECHANICALLY (Clyde's proposed trigger design, in lieu of an
 * admin route the browser-only operator could not call without client
 * changes, which A1 §6 forbids):
 *   1. On boot, if no backfill-kind run exists yet, the ESTIMATE runs —
 *      read-only counting, zero rows written — and emails Robert the
 *      per-series row/API-call numbers and fetch order. That email IS the
 *      S4 presentation, computed on production where the data hosts are
 *      reachable.
 *   2. REGIME_BACKFILL_APPROVED below ships FALSE. Robert's S4 go is a
 *      one-constant commit flipping it TRUE — his merge click is the go,
 *      recorded in git. On the next boot the backfill executes: bulk
 *      history lands only after Robert's go (A1 §4).
 *   3. Execution is sequential, paced (adapters self-pace), heartbeat-
 *      stamped, and closes its run row in a finally block (A0 shape).
 *
 * Bounded as-of strategy for revising (alfred-policy) series — NFCI's
 * weekly full-history revisions are the named volume risk (Record 01
 * §6.5): we do NOT fetch every vintage of every observation. We walk a
 * MONTHLY as-of grid (month-ends, 1990-01 → present) and store, per grid
 * date, only values that CHANGED versus the held vintage (the ingest
 * value-compare dedupe). Honesty note carried into the vintage record: a
 * grid-built realtime_start means "published on or before this date" —
 * grid-granular, which is exactly the granularity a monthly-tempo race
 * needs; finer vintage dates for specific studies can ride ALFRED live via
 * the asOf plumbing later.
 *
 * Per-policy fetch strategy:
 *   never_revised   — one full-history current fetch; realtime_start is
 *                     remapped to obs_date (publication = observation day)
 *   alfred_windowed — one current fetch (FRED serves only its rolling
 *                     window; live duty only, charter §5)
 *   alfred          — the monthly as-of grid walk described above
 *   snapshot_custom — one adapter fetch: OFR full-history snapshot (rows
 *                     vintage-stamped today — pre-snapshot history is
 *                     revised_study-grade per Task 5 §4); Cleveland's feed
 *                     carries true as-published labels to 2013:Q3
 */

import { supaFetch, supaSelect, supaInsert, supaUpdate } from '../supabase.js';
import { sendAdminAlert } from '../admin-alert.js';
import { startRunHeartbeat } from '../monitor.js';
import type {
  RegimeSeriesRow,
  RegimeIngestRunRow,
  RegimeNormalizedObservation,
} from '../types.js';
import { ingestObservations } from './ingest.js';
import { fetchCurrent, fetchAsOf, fetchVintageDates, REGIME_FRED_DELAY_MS } from './sources/alfred.js';
import { fetchOfrFsi } from './sources/ofr.js';
import { fetchClevelandNowcast } from './sources/cleveland.js';
import { runAsOfSelfTest } from './asof.js';

// ─── The S4 gate (regime-module-local constant per A1 §6) ───────────────────

/** Robert's S4 go, given July 7, 2026 after reading the production
 *  estimate email (the read-only counting pass of that morning, 17 series,
 *  0 rows written). His merge of this commit is the go, recorded in git
 *  (A1 §4, STOP S4 — discharged). */
const REGIME_BACKFILL_APPROVED = true;

/** Monthly as-of grid origin for alfred-policy vintage reconstruction */
const GRID_START_YEAR = 1990;

/** Trailing observation window fetched per grid date, by cadence (same
 *  spirit as the sweep's windows; grid steps are monthly so each window
 *  overlaps the next — overlap is free, dedupe discards it) */
const GRID_OBS_WINDOW_DAYS: Record<RegimeSeriesRow['cadence'], number> = {
  daily: 45,
  weekly: 120,
  monthly: 425,
  irregular: 190,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Month-end ISO dates from GRID_START_YEAR-01 through the last full month */
export function monthlyAsOfGrid(todayIso: string = isoDate()): string[] {
  const [ty, tm] = todayIso.split('-').map(Number);
  const grid: string[] = [];
  for (let y = GRID_START_YEAR; y <= ty; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === ty && m >= tm) break; // last FULL month only
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      grid.push(`${y}-${String(m).padStart(2, '0')}-${lastDay}`);
    }
  }
  return grid;
}

function isoDaysBefore(iso: string, days: number): string {
  return isoDate(new Date(new Date(`${iso}T00:00:00Z`).getTime() - days * 24 * 60 * 60 * 1000));
}

async function enabledSeries(): Promise<RegimeSeriesRow[]> {
  const { data, error } = await supaSelect<RegimeSeriesRow[]>('regime_series', {
    enabled: 'eq.true',
    order: 'source.asc,series_code.asc',
  });
  if (error || !data) throw new Error(`Reading regime_series failed: ${error ?? 'no rows'}`);
  return data;
}

// ─── Estimate mode (read-only; the S4 numbers, emailed) ─────────────────────

interface SeriesEstimate {
  series: string;
  policy: string;
  strategy: string;
  apiCalls: number;
  approxRows: string;
}

export async function runBackfillEstimate(): Promise<void> {
  const { data: run } = await supaInsert<RegimeIngestRunRow>(
    'regime_ingest_runs',
    { kind: 'backfill', status: 'running', error: 'ESTIMATE (not an error): read-only counting pass' },
    { single: true }
  );
  if (!run) return;
  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');

  try {
    const series = await enabledSeries();
    const grid = monthlyAsOfGrid();
    const estimates: SeriesEstimate[] = [];

    for (const s of series) {
      if (s.source === 'fred' && s.vintage_policy === 'alfred') {
        // Vintagedates shows what unbounded vintage storage WOULD cost —
        // the number the bounded strategy avoids.
        let vintages = 0;
        try {
          vintages = (await fetchVintageDates(s.series_code)).length;
        } catch {
          vintages = -1;
        }
        estimates.push({
          series: s.series_code,
          policy: s.vintage_policy,
          strategy: `monthly as-of grid (${grid.length} dates), changed values only`,
          apiCalls: grid.length,
          approxRows: `history + revisions actually seen (publisher vintage dates on record: ${vintages === -1 ? 'lookup failed' : vintages})`,
        });
      } else if (s.source === 'fred') {
        const obs = await fetchCurrent(s.series_code);
        estimates.push({
          series: s.series_code,
          policy: s.vintage_policy,
          strategy: s.vintage_policy === 'alfred_windowed'
            ? 'one current fetch (rolling window only — live duty)'
            : 'one full-history current fetch',
          apiCalls: 1,
          approxRows: String(obs.length),
        });
      } else if (s.source === 'ofr') {
        const obs = await fetchOfrFsi(isoDate());
        estimates.push({
          series: s.series_code,
          policy: s.vintage_policy,
          strategy: 'one full-history snapshot (pre-snapshot history is revised_study-grade, Task 5 §4)',
          apiCalls: 1,
          approxRows: String(obs.length),
        });
      } else if (s.source === 'cleveland') {
        const obs = await fetchClevelandNowcast(s.series_code);
        estimates.push({
          series: s.series_code,
          policy: s.vintage_policy,
          strategy: 'one feed fetch — true as-published daily vintages to 2013:Q3',
          apiCalls: 1,
          approxRows: String(obs.length),
        });
      }
    }

    const totalCalls = estimates.reduce((sum, e) => sum + e.apiCalls, 0);
    const minutes = Math.ceil((totalCalls * REGIME_FRED_DELAY_MS) / 60000);
    const tableRows = estimates
      .map(
        e =>
          `<tr><td><strong>${e.series}</strong></td><td>${e.policy}</td><td>${e.strategy}</td>` +
          `<td>${e.apiCalls}</td><td>${e.approxRows}</td></tr>`
      )
      .join('');

    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: series.length,
        rows_written: 0,
        error: 'ESTIMATE (not an error): report emailed to Robert — S4 presentation',
      },
      { id: `eq.${run.id}` }
    );

    await sendAdminAlert(
      'Regime harness: backfill estimate — the S4 numbers (nothing was written)',
      `<p>This is the read-only counting pass for STOP S4. No history has been loaded. ` +
        `The backfill executes only after your go (a one-line approval change Clyde commits and you merge).</p>` +
        `<table border="1" cellpadding="4"><tr><th>Series</th><th>Policy</th><th>Strategy</th>` +
        `<th>API calls</th><th>Rows (approx)</th></tr>${tableRows}</table>` +
        `<p><strong>Totals:</strong> ${totalCalls} API calls, sequential and paced — roughly ` +
        `${minutes} minutes of fetching. Fetch order: the cheap single-fetch series land first ` +
        `(full coverage in the first minute), the monthly-grid vintage walks run last.</p>` +
        `<p>The grid strategy stores only values that changed between month-ends — the bounded ` +
        `approach ratified against NFCI's weekly full-history revisions (A1 Task 9).</p>`
    );

    console.log(`[regime] Backfill estimate complete: ${totalCalls} calls across ${series.length} series — report emailed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[regime] Backfill estimate failed: ${msg}`);
    await supaUpdate(
      'regime_ingest_runs',
      { status: 'failed', completed_at: new Date().toISOString(), error: `ESTIMATE failed: ${msg}` },
      { id: `eq.${run.id}` }
    );
  } finally {
    stopHeartbeat();
  }
}

// ─── Execute mode (S4-gated by REGIME_BACKFILL_APPROVED) ────────────────────

export async function runBackfillExecute(): Promise<void> {
  const { data: run } = await supaInsert<RegimeIngestRunRow>(
    'regime_ingest_runs',
    { kind: 'backfill', status: 'running' },
    { single: true }
  );
  if (!run) return;
  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');
  const todayIso = isoDate();
  let written = 0;
  let attempted = 0;

  try {
    const series = await enabledSeries();
    const grid = monthlyAsOfGrid(todayIso);

    // Fetch order (S4 presentation): cheap single-fetch series first so
    // full current coverage exists within the first minute; grid walks last.
    const singles = series.filter(s => !(s.source === 'fred' && s.vintage_policy === 'alfred'));
    const gridWalks = series.filter(s => s.source === 'fred' && s.vintage_policy === 'alfred');

    for (const s of singles) {
      attempted++;
      let obs: RegimeNormalizedObservation[] = [];
      if (s.source === 'fred') {
        obs = (await fetchCurrent(s.series_code)).map(o =>
          s.vintage_policy === 'never_revised'
            ? { ...o, realtime_start: o.obs_date, realtime_end: null }
            : { ...o, realtime_start: todayIso, realtime_end: null }
        );
      } else if (s.source === 'ofr') {
        obs = await fetchOfrFsi(todayIso);
      } else if (s.source === 'cleveland') {
        obs = await fetchClevelandNowcast(s.series_code);
      }
      const res = await ingestObservations(s, obs, run.id);
      written += res.written;
      console.log(`[regime] Backfill ${s.series_code}: ${res.written} rows`);
    }

    // Discovered July 7, 2026, by the first execute's honest failure: a
    // series can be labeled alfred-policy in the registry yet be ABSENT
    // from ALFRED entirely — FRED 400s any realtime request for it ("The
    // series does not exist in ALFRED"). CFNAI is the proven case. So the
    // walk now discovers each series' true archive first (vintagedates),
    // clamps the grid to it, and falls back to snapshot semantics when no
    // archive exists — reported as a policy finding, never papered over.
    const policyFindings: string[] = [];

    for (const s of gridWalks) {
      attempted++;
      let seriesRows = 0;

      let vintageDates: string[] = [];
      try {
        vintageDates = await fetchVintageDates(s.series_code);
      } catch {
        vintageDates = [];
      }

      if (vintageDates.length === 0) {
        // No ALFRED archive: store current history as a dated snapshot —
        // as-published replay for this series begins today, and the
        // registry's 'alfred' label needs Robert's correction.
        const obs = (await fetchCurrent(s.series_code)).map(o => ({
          ...o,
          realtime_start: todayIso,
          realtime_end: null,
        }));
        const res = await ingestObservations(s, obs, run.id);
        written += res.written;
        policyFindings.push(
          `${s.series_code}: NOT in ALFRED — ${res.written} rows stored as a today-dated snapshot; ` +
            `as-published replay begins ${todayIso}; registry vintage_policy should become snapshot_custom (Robert's cell edit)`
        );
        console.log(`[regime] Backfill ${s.series_code}: no ALFRED archive — snapshot fallback, ${res.written} rows`);
        continue;
      }

      const firstVintage = vintageDates[0];
      const effectiveGrid = grid.filter(d => d >= firstVintage);
      for (const gridDate of effectiveGrid) {
        const obsStart = isoDaysBefore(gridDate, GRID_OBS_WINDOW_DAYS[s.cadence] ?? 120);
        const obs = await fetchAsOf(s.series_code, gridDate, obsStart);
        if (obs.length === 0) continue;
        const res = await ingestObservations(s, obs, run.id);
        seriesRows += res.written;
      }

      // Completeness pass: one current fetch fills (a) observations from
      // before the archive's first vintage (stored as today-dated snapshot
      // rows — honest: known-as-of-today; invisible to past as-of reads)
      // and (b) revisions since the last month-end. Dedupe discards the rest.
      const current = (await fetchCurrent(s.series_code)).map(o => ({
        ...o,
        realtime_start: todayIso,
        realtime_end: null,
      }));
      const fillRes = await ingestObservations(s, current, run.id);
      seriesRows += fillRes.written;

      if (firstVintage > grid[0]) {
        policyFindings.push(
          `${s.series_code}: ALFRED archive begins ${firstVintage} — as-published replay starts there; ` +
            `earlier observations stored as today-dated snapshot rows only`
        );
      }

      written += seriesRows;
      console.log(
        `[regime] Backfill ${s.series_code}: walked ${effectiveGrid.length} grid dates from ${firstVintage}, ${seriesRows} vintage rows`
      );
    }

    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: attempted,
        rows_written: written,
      },
      { id: `eq.${run.id}` }
    );

    const findingsHtml =
      policyFindings.length > 0
        ? `<p><strong>Archive findings (for the Task 11 record and the race's honesty notes):</strong></p><ul>` +
          policyFindings.map(f => `<li>${f}</li>`).join('') +
          `</ul>`
        : '';

    await sendAdminAlert(
      'Regime harness: historical backfill complete',
      `<p>The S4-approved backfill finished: <strong>${written}</strong> vintage rows across ` +
        `${attempted} series, loaded sequentially and paced. The as-of replay door can now serve ` +
        `the race's history questions from our own vintage memory.</p>` +
        findingsHtml
    );
    console.log(`[regime] Backfill execute complete: ${written} rows across ${attempted} series`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[regime] Backfill execute failed: ${msg}`);
    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        series_attempted: attempted,
        rows_written: written,
        error: msg,
      },
      { id: `eq.${run.id}` }
    );
    sendAdminAlert(
      'Regime harness: historical backfill failed partway',
      `<p>The backfill stopped with an error after writing ${written} rows:</p>` +
        `<p><strong>${msg}</strong></p><p>It is safe to re-run — already-stored vintages ` +
        `dedupe, so a restart resumes rather than duplicates.</p>`
    ).catch(() => {});
  } finally {
    stopHeartbeat();
  }
}

// ─── Boot hook (called once from cron.ts startCronJobs) ─────────────────────

/**
 * Regime boot tasks, in order:
 *   1. The Task 8 CPI self-test (acceptance item 4) — logged every boot,
 *      emailed only on failure. Two paced FRED calls.
 *   2. If NO backfill-kind run exists yet → the estimate (S4 numbers).
 *   3. If approved AND no successful execute exists → the backfill.
 */
export async function regimeBootTasks(): Promise<void> {
  try {
    const selfTest = await runAsOfSelfTest();
    console.log(
      `[regime] As-of self-test ${selfTest.passed ? 'PASSED' : 'FAILED'}: ${selfTest.note}`
    );
    if (!selfTest.passed) {
      sendAdminAlert(
        'Regime harness: the as-of replay self-test FAILED',
        `<p>${selfTest.note}</p><p>Replay results cannot be trusted until this is resolved.</p>`
      ).catch(() => {});
    }
  } catch (err) {
    console.warn(`[regime] As-of self-test could not run: ${err instanceof Error ? err.message : err}`);
  }

  const { data: backfillRuns } = await supaFetch<RegimeIngestRunRow[]>('regime_ingest_runs', {
    params: { kind: 'eq.backfill', select: 'id,status,rows_written,error', limit: '50' },
  });
  const runs = backfillRuns ?? [];
  const estimateExists = runs.some(r => (r.error ?? '').startsWith('ESTIMATE'));
  const executeSucceeded = runs.some(
    r => r.status === 'completed' && !(r.error ?? '').startsWith('ESTIMATE')
  );

  if (!estimateExists) {
    console.log('[regime] No backfill estimate on record — running the S4 counting pass');
    await runBackfillEstimate();
    return; // never estimate and execute in the same boot
  }

  if (REGIME_BACKFILL_APPROVED && !executeSucceeded) {
    console.log('[regime] Backfill approved (S4) and not yet completed — executing');
    await runBackfillExecute();
  }
}
