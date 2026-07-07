/**
 * FundLens v8 — Regime Harness: ingestion engine (A1 Task 6, alerts Task 7)
 *
 * Two scheduled entry points, registered from cron.ts in America/New_York
 * (every publication clock in Record 01 §6 is Eastern; stored timestamps
 * stay UTC):
 *
 *   runDailySweep          — 17:30 ET: fetch every enabled series after the
 *                            day's publications land (NFCI Wed 8:30 ET,
 *                            Cleveland ~10:00 ET, H.15 ~16:15 ET, VIX close,
 *                            OFR's lagged daily, GDPNow's irregular drops,
 *                            monthlies on release days).
 *   runExpectationsCheck   — 09:00 ET: compare each enabled series' newest
 *                            vintage date against its cadence plus grace and
 *                            alert on breach. Cadence drives EXPECTATION;
 *                            the sweep drives FETCHING — no release calendar
 *                            is ever hard-coded.
 *
 * Both take the A0 shape exactly (charter §6·1): in-memory overlap flag +
 * DB check for a running row, a regime_ingest_runs row, ~60s heartbeats
 * via the shared startRunHeartbeat, closed in a finally block. Liveness is
 * judged by THE shared runIsStale rule (monitor.ts; cron.ts wires the
 * cleanup + stale alert — Task 7 condition 3).
 *
 * Vintage-honest ingest (charter §2.5, §4.2·6): revisions insert new rows
 * and close the superseded row's realtime_end; nothing is overwritten. FRED
 * window-clamped realtime_starts are deduped by VALUE comparison against
 * the held current vintage — a clamp artifact is not a vintage. A new
 * vintage for a never_revised series raises the Task 7 condition-4
 * integrity alert the same day (and the new vintage is still stored:
 * reality is recorded, then reported loudly).
 *
 * Alert wiring (Task 7): the existing A0 admin email path (sendAdminAlert)
 * — reuse, never a second sender. Ingest failures collect into ONE
 * plain-English email per sweep (a FRED outage must not send 14 separate
 * emails); each entry names the series, what was expected, what happened,
 * and what the harness does next (retry at the next sweep).
 *
 * No Claude call exists anywhere in this module — the deterministic path
 * is Claude-free forever (charter §2.3).
 */

import { supaFetch, supaSelect, supaInsert, supaUpdate } from '../supabase.js';
import { sendAdminAlert } from '../admin-alert.js';
import { startRunHeartbeat } from '../monitor.js';
import { delay } from '../types.js';
import type {
  RegimeSeriesRow,
  RegimeObservationRow,
  RegimeIngestRunRow,
  RegimeNormalizedObservation,
} from '../types.js';
import { fetchVintageWindow } from './sources/alfred.js';
import { fetchOfrFsi } from './sources/ofr.js';
import { fetchClevelandNowcast } from './sources/cleveland.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** Attempts per series within a sweep (A1 Task 7 condition 1) */
const INGEST_RETRY_ATTEMPTS = 3;

/** Pause between attempts (A1 Task 7 condition 1: "30s apart") */
const INGEST_RETRY_DELAY_MS = 30 * 1000;

/** FRED vintage window: how far back the sweep looks for fresh vintages.
 *  14 days comfortably covers a missed sweep or two plus weekly NFCI
 *  republications. */
const REALTIME_WINDOW_DAYS = 14;

/** Observation windows per cadence — how far back values are re-checked
 *  for revisions each sweep (proposed at Task 6 findings; deeper history
 *  is backfill's job, S4-gated):
 *  daily 14d (never_revised dailies don't revise; cheap belt);
 *  weekly 730d (NFCI republishes its whole history weekly — two years of
 *  trailing re-check bounds the volume while catching every recent
 *  revision; the pre-window tail is handled at backfill under the bounded
 *  as-of strategy);
 *  monthly 425d (~14 months — catches BLS/BEA annual seasonal revisions);
 *  irregular 190d (GDPNow: current + previous quarter of nowcasts). */
const OBS_WINDOW_DAYS_BY_CADENCE: Record<RegimeSeriesRow['cadence'], number> = {
  daily: 14,
  weekly: 730,
  monthly: 425,
  irregular: 190,
};

/** Expectations-check staleness thresholds (cadence + ratified grace:
 *  daily +1 business day, weekly +2 days, monthly +5 days; irregular
 *  exempt). Daily is measured in business days so ordinary weekends never
 *  false-alarm; a federal-holiday Monday still passes (2 business days). */
const DAILY_BREACH_BUSINESS_DAYS = 2;
const WEEKLY_BREACH_CALENDAR_DAYS = 9;
const MONTHLY_BREACH_CALENDAR_DAYS = 36;

// ─── Small date helpers ─────────────────────────────────────────────────────

function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number, from: Date = new Date()): string {
  return isoDate(new Date(from.getTime() - days * 24 * 60 * 60 * 1000));
}

/** Whole business days (Mon–Fri) strictly between two ISO dates */
export function businessDaysBetween(fromIso: string, toIso: string): number {
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

// ─── Overlap guards (A0 shape: in-memory flag + DB check) ───────────────────

const jobState = {
  sweepRunning: false,
  expectationsRunning: false,
};

async function hasRunningRow(kinds: string[]): Promise<RegimeIngestRunRow | null> {
  const { data } = await supaFetch<RegimeIngestRunRow>('regime_ingest_runs', {
    params: {
      status: 'eq.running',
      kind: `in.(${kinds.join(',')})`,
      limit: '1',
    },
    single: true,
  });
  return data ?? null;
}

// ─── Fetch dispatch ─────────────────────────────────────────────────────────

/** Fetch one series' fresh observations via its source adapter. cboe never
 *  runs in the sweep — it is backfill/backstop duty only (charter §5). */
async function fetchSeries(
  series: RegimeSeriesRow,
  todayIso: string
): Promise<RegimeNormalizedObservation[]> {
  switch (series.source) {
    case 'fred': {
      const obsWindow = OBS_WINDOW_DAYS_BY_CADENCE[series.cadence] ?? 30;
      return fetchVintageWindow(
        series.series_code,
        isoDaysAgo(REALTIME_WINDOW_DAYS),
        todayIso,
        isoDaysAgo(obsWindow)
      );
    }
    case 'ofr':
      return fetchOfrFsi(todayIso);
    case 'cleveland':
      return fetchClevelandNowcast(series.series_code);
    case 'cboe':
      throw new Error(
        `${series.series_code}: cboe source is backfill/backstop duty only — it must not be enabled for the sweep (charter §5)`
      );
    default:
      throw new Error(`${series.series_code}: unknown source ${series.source}`);
  }
}

// ─── Vintage-honest ingest ──────────────────────────────────────────────────

interface IngestResult {
  written: number;
  neverRevisedViolations: Array<{ obsDate: string; heldValue: number; newValue: number }>;
}

/**
 * Write a batch of normalized observations for one series under §2.5 law:
 * new (series, obs_date, realtime_start) rows insert; a changed value for
 * an obs_date closes the held vintage's realtime_end and inserts the new
 * vintage; an unchanged value inserts NOTHING (window-clamp artifacts are
 * not vintages). Exported for the S4 backfill runner to reuse.
 */
export async function ingestObservations(
  series: RegimeSeriesRow,
  incoming: RegimeNormalizedObservation[],
  ingestRunId: string
): Promise<IngestResult> {
  const result: IngestResult = { written: 0, neverRevisedViolations: [] };
  if (incoming.length === 0) return result;

  const minObsDate = incoming.reduce(
    (min, o) => (o.obs_date < min ? o.obs_date : min),
    incoming[0].obs_date
  );

  const { data: held, error: heldError } = await supaSelect<RegimeObservationRow[]>(
    'regime_observations',
    {
      series_id: `eq.${series.id}`,
      obs_date: `gte.${minObsDate}`,
      order: 'obs_date.asc,realtime_start.asc',
    },
    'id,obs_date,value,realtime_start,realtime_end'
  );
  if (heldError) throw new Error(`${series.series_code}: reading held vintages failed: ${heldError}`);

  const existingKeys = new Set<string>();
  const openByObsDate = new Map<string, RegimeObservationRow>();
  for (const row of held ?? []) {
    existingKeys.add(`${row.obs_date}|${row.realtime_start}`);
    if (row.realtime_end === null) openByObsDate.set(row.obs_date, row);
  }

  // Oldest vintages first so multi-vintage FRED windows replay in order
  const ordered = [...incoming].sort((a, b) =>
    a.obs_date === b.obs_date
      ? a.realtime_start.localeCompare(b.realtime_start)
      : a.obs_date.localeCompare(b.obs_date)
  );

  const toInsert: Array<Record<string, unknown>> = [];
  const toClose: Array<{ id: string; realtimeEnd: string }> = [];

  for (const obs of ordered) {
    const key = `${obs.obs_date}|${obs.realtime_start}`;
    if (existingKeys.has(key)) continue;

    const open = openByObsDate.get(obs.obs_date);
    if (open && Number(open.value) === obs.value) continue; // no new information

    if (open) {
      // A genuine revision: close the held vintage at the new vintage date
      toClose.push({ id: open.id, realtimeEnd: obs.realtime_start });
      if (series.vintage_policy === 'never_revised') {
        result.neverRevisedViolations.push({
          obsDate: obs.obs_date,
          heldValue: Number(open.value),
          newValue: obs.value,
        });
      }
    }

    const newRow = {
      series_id: series.id,
      obs_date: obs.obs_date,
      value: obs.value,
      realtime_start: obs.realtime_start,
      realtime_end: obs.realtime_end ?? null,
      ingest_run_id: ingestRunId,
    };
    toInsert.push(newRow);
    existingKeys.add(key);
    // The just-inserted row becomes the open vintage for later revisions
    openByObsDate.set(obs.obs_date, {
      id: '',
      series_id: series.id,
      obs_date: obs.obs_date,
      value: obs.value,
      realtime_start: obs.realtime_start,
      realtime_end: obs.realtime_end ?? null,
      fetched_at: '',
      ingest_run_id: ingestRunId,
    });
  }

  for (const close of toClose) {
    if (!close.id) continue; // in-batch predecessor: realtime_end was set at insert
    const { error } = await supaUpdate(
      'regime_observations',
      { realtime_end: close.realtimeEnd },
      { id: `eq.${close.id}` }
    );
    if (error) throw new Error(`${series.series_code}: closing superseded vintage failed: ${error}`);
  }

  if (toInsert.length > 0) {
    // Conflict-tolerant insert under the vintage law's unique key —
    // PostgREST ignore-duplicates on (series_id, obs_date, realtime_start).
    // The value-compare above decides what SHOULD land; this makes a
    // resume or race unable to throw on rows that already did (Fabio's
    // July 7 requirement: "safe to re-run" is true by behavior). Never
    // merge-duplicates: §2.5 forbids updating a vintage row in place.
    const { data, error } = await supaFetch<RegimeObservationRow[]>('regime_observations', {
      method: 'POST',
      body: toInsert,
      params: { on_conflict: 'series_id,obs_date,realtime_start' },
      headers: { Prefer: 'return=representation, resolution=ignore-duplicates' },
    });
    if (error) throw new Error(`${series.series_code}: inserting ${toInsert.length} vintages failed: ${error}`);
    result.written = Array.isArray(data) ? data.length : toInsert.length;
  }

  return result;
}

// ─── The daily sweep (17:30 ET) ─────────────────────────────────────────────

export async function runDailySweep(): Promise<void> {
  if (jobState.sweepRunning) {
    console.log('[regime] Sweep already running in-process — skipping');
    return;
  }
  const running = await hasRunningRow(['sweep', 'backfill']);
  if (running) {
    console.log(`[regime] Ingest run ${running.id} (${running.kind}) already in progress — skipping sweep`);
    return;
  }

  jobState.sweepRunning = true;
  const { data: run, error: createError } = await supaInsert<RegimeIngestRunRow>(
    'regime_ingest_runs',
    { kind: 'sweep', status: 'running' },
    { single: true }
  );
  if (createError || !run) {
    console.error(`[regime] Failed to create sweep run row: ${createError}`);
    jobState.sweepRunning = false;
    return;
  }

  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');
  const todayIso = isoDate();
  let attempted = 0;
  let written = 0;
  const failures: Array<{ series: string; error: string }> = [];
  const violations: Array<{ series: string; detail: string }> = [];

  try {
    const { data: allSeries, error: seriesError } = await supaSelect<RegimeSeriesRow[]>(
      'regime_series',
      { enabled: 'eq.true', order: 'source.asc,series_code.asc' }
    );
    if (seriesError || !allSeries) {
      throw new Error(`Reading regime_series registry failed: ${seriesError ?? 'no rows'}`);
    }

    // Strictly sequential — adapters pace themselves; the sweep never
    // parallelizes (house pattern).
    for (const series of allSeries) {
      attempted++;
      let lastError = '';
      let ingested = false;

      for (let attempt = 1; attempt <= INGEST_RETRY_ATTEMPTS && !ingested; attempt++) {
        try {
          const observations = await fetchSeries(series, todayIso);
          const res = await ingestObservations(series, observations, run.id);
          written += res.written;
          for (const v of res.neverRevisedViolations) {
            violations.push({
              series: series.series_code,
              detail: `${v.obsDate}: held ${v.heldValue} → new vintage ${v.newValue}`,
            });
          }
          ingested = true;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[regime] ${series.series_code} attempt ${attempt}/${INGEST_RETRY_ATTEMPTS} failed: ${lastError}`
          );
          if (attempt < INGEST_RETRY_ATTEMPTS) await delay(INGEST_RETRY_DELAY_MS);
        }
      }

      if (!ingested) failures.push({ series: series.series_code, error: lastError });
    }

    await supaUpdate(
      'regime_ingest_runs',
      {
        status: failures.length === attempted && attempted > 0 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: attempted,
        rows_written: written,
        error: failures.length > 0 ? `${failures.length} series failed` : null,
      },
      { id: `eq.${run.id}` }
    );

    console.log(
      `[regime] Sweep ${run.id} done: ${attempted} series attempted, ${written} vintage rows written, ${failures.length} failures`
    );

    // Task 7 condition 1 — one plain-English email per sweep, not per series
    if (failures.length > 0) {
      const list = failures
        .map(f => `<li><strong>${f.series}</strong> — ${f.error}</li>`)
        .join('');
      sendAdminAlert(
        `Regime harness: ${failures.length} data feed${failures.length > 1 ? 's' : ''} failed tonight's sweep`,
        `<p>The 5:30 PM ET data sweep tried each of these ${INGEST_RETRY_ATTEMPTS} times, ` +
          `30 seconds apart, and could not bring them in:</p><ul>${list}</ul>` +
          `<p>Everything else came in normally (${written} new data points stored). ` +
          `The harness will retry these automatically at tomorrow's sweep; ` +
          `if the same series appears again tomorrow, something is genuinely wrong at the source.</p>`
      ).catch(() => {});
    }

    // Task 7 condition 4 — never-revised violation: same-day integrity alert
    if (violations.length > 0) {
      const list = violations
        .map(v => `<li><strong>${v.series}</strong> — ${v.detail}</li>`)
        .join('');
      sendAdminAlert(
        'Regime harness: a "never revised" series just revised — data integrity alert',
        `<p>These series carry the policy that a published value is final, and today's ` +
          `sweep found changed values anyway:</p><ul>${list}</ul>` +
          `<p>Both the old and new values are stored as separate dated vintages — nothing was ` +
          `overwritten (charter §2.5). The policy claim for these series should be re-examined ` +
          `on the record before the race trusts them.</p>`
      ).catch(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[regime] Sweep ${run.id} failed: ${msg}`);
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
      'Regime harness: tonight\'s data sweep failed',
      `<p>The 5:30 PM ET sweep stopped with an error before finishing:</p>` +
        `<p><strong>${msg}</strong></p>` +
        `<p>${written} data points were stored before the stop. The harness retries in full at tomorrow's sweep.</p>`
    ).catch(() => {});
  } finally {
    stopHeartbeat();
    jobState.sweepRunning = false;
  }
}

// ─── The expectations check (09:00 ET) ──────────────────────────────────────

interface ExpectationBreach {
  series: string;
  displayName: string;
  cadence: string;
  newestVintage: string | null;
  expectation: string;
}

/** Evaluate one series against its cadence + grace. Exported for tests and
 *  for the acceptance item 6 dry-run. */
export function expectationBreached(
  series: Pick<RegimeSeriesRow, 'cadence'>,
  newestVintageIso: string | null,
  todayIso: string
): boolean {
  if (series.cadence === 'irregular') return false; // GDPNow exempt (A1 Task 6)
  if (!newestVintageIso) return false; // bootstrap state: nothing ingested yet — sweep alerts cover fetch failures
  if (series.cadence === 'daily') {
    return businessDaysBetween(newestVintageIso, todayIso) > DAILY_BREACH_BUSINESS_DAYS;
  }
  const days = Math.floor(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${newestVintageIso}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000)
  );
  if (series.cadence === 'weekly') return days > WEEKLY_BREACH_CALENDAR_DAYS;
  return days > MONTHLY_BREACH_CALENDAR_DAYS;
}

export async function runExpectationsCheck(): Promise<void> {
  if (jobState.expectationsRunning) {
    console.log('[regime] Expectations check already running — skipping');
    return;
  }
  const running = await hasRunningRow(['expectations_check']);
  if (running) {
    console.log(`[regime] Expectations check ${running.id} already in progress — skipping`);
    return;
  }

  jobState.expectationsRunning = true;
  const { data: run, error: createError } = await supaInsert<RegimeIngestRunRow>(
    'regime_ingest_runs',
    { kind: 'expectations_check', status: 'running' },
    { single: true }
  );
  if (createError || !run) {
    console.error(`[regime] Failed to create expectations run row: ${createError}`);
    jobState.expectationsRunning = false;
    return;
  }

  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');
  const todayIso = isoDate();
  let attempted = 0;
  const breaches: ExpectationBreach[] = [];

  try {
    const { data: allSeries, error: seriesError } = await supaSelect<RegimeSeriesRow[]>(
      'regime_series',
      { enabled: 'eq.true', order: 'source.asc,series_code.asc' }
    );
    if (seriesError || !allSeries) {
      throw new Error(`Reading regime_series registry failed: ${seriesError ?? 'no rows'}`);
    }

    for (const series of allSeries) {
      attempted++;
      const { data: newest } = await supaFetch<Pick<RegimeObservationRow, 'realtime_start'>>(
        'regime_observations',
        {
          params: {
            series_id: `eq.${series.id}`,
            select: 'realtime_start',
            order: 'realtime_start.desc',
            limit: '1',
          },
          single: true,
        }
      );
      const newestVintage = newest?.realtime_start ?? null;

      if (expectationBreached(series, newestVintage, todayIso)) {
        breaches.push({
          series: series.series_code,
          displayName: series.display_name,
          cadence: series.cadence,
          newestVintage,
          expectation:
            series.cadence === 'daily'
              ? `a new value every business day (grace: ${DAILY_BREACH_BUSINESS_DAYS} business days)`
              : series.cadence === 'weekly'
                ? `a new value every week (grace: ${WEEKLY_BREACH_CALENDAR_DAYS} days total)`
                : `a new value every month (grace: ${MONTHLY_BREACH_CALENDAR_DAYS} days total)`,
        });
      }
    }

    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: attempted,
        rows_written: 0,
        error: breaches.length > 0 ? `${breaches.length} missed publications` : null,
      },
      { id: `eq.${run.id}` }
    );

    console.log(
      `[regime] Expectations check ${run.id} done: ${attempted} series checked, ${breaches.length} breaches`
    );

    // Task 7 condition 2 — the Oct 2025 CPI blackout is the motivating case:
    // the harness's job is to NOTICE, loudly, the same morning.
    if (breaches.length > 0) {
      const list = breaches
        .map(
          b =>
            `<li><strong>${b.displayName}</strong> (${b.series}) — expected ${b.expectation}; ` +
            `last new data ${b.newestVintage ?? 'never'}.</li>`
        )
        .join('');
      sendAdminAlert(
        `Regime harness: ${breaches.length} data series ${breaches.length > 1 ? 'have' : 'has'} gone quiet`,
        `<p>The 9:00 AM ET check found data that should have arrived by now and hasn't:</p>` +
          `<ul>${list}</ul>` +
          `<p>What happens next: tonight's 5:30 PM ET sweep retries automatically. If the source ` +
          `has data by then, this resolves itself. If this alert repeats tomorrow, the publisher ` +
          `itself has likely gone dark (the October 2025 CPI blackout is the precedent) and the ` +
          `registry's fallback channel for the series should be considered.</p>`
      ).catch(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[regime] Expectations check ${run.id} failed: ${msg}`);
    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        series_attempted: attempted,
        rows_written: 0,
        error: msg,
      },
      { id: `eq.${run.id}` }
    );
  } finally {
    stopHeartbeat();
    jobState.expectationsRunning = false;
  }
}

// ─── Stale ingest runs (Task 7 condition 3 — called from cron.ts) ───────────

/**
 * Mark regime ingest runs whose heartbeat has gone silent per THE shared
 * rule, and alert. Wired into cron.ts's existing 30-minute cleanup job —
 * one schedule, both tables, one definition of "stale".
 */
export async function cleanupStaleIngestRuns(
  isStale: (run: { status: string; started_at: string; heartbeat_at?: string | null }) => boolean
): Promise<void> {
  const { data: runningRuns } = await supaSelect<RegimeIngestRunRow[]>('regime_ingest_runs', {
    status: 'eq.running',
  });

  for (const stale of (runningRuns ?? []).filter(r => isStale(r))) {
    console.warn(
      `[regime] Marking stale ingest run ${stale.id} (${stale.kind}) as failed ` +
        `(started ${stale.started_at}, last heartbeat ${stale.heartbeat_at ?? 'none recorded'})`
    );
    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: 'Marked as failed by stale-run cleanup — no heartbeat for 10+ minutes, or past the 6-hour ceiling',
      },
      { id: `eq.${stale.id}` }
    );

    sendAdminAlert(
      'Regime harness: a data run went silent and was marked failed',
      `<p>Ingest run <strong>${stale.id}</strong> (${stale.kind}, started ${stale.started_at}) ` +
        `stopped sending its every-minute heartbeat and has been marked failed. A crash or ` +
        `deploy most likely killed it mid-run. The next scheduled run picks up automatically.</p>`
    ).catch(() => {});
  }
}
