/**
 * FundLens v8 — Regime Harness: as-of replay interface (A1 Task 8)
 *
 * ONE function — asOf(seriesCode, onDate, windowLength) — returning the
 * trailing observations EXACTLY as published on onDate. This is the only
 * door the race's contenders may use to see history (charter §2.3 race
 * law: "no contender ever sees a revision before its publication date").
 *
 * The answer comes from OUR vintage memory (regime_observations), which is
 * the point of the harness: a vintage-correct read is a plain filter —
 *   the vintage current ON onDate = rows with realtime_start <= onDate
 *   AND (realtime_end IS NULL OR realtime_end > onDate)
 * — ordered by obs_date descending, windowLength rows.
 *
 * Policy-specific refusals (charter §4.2·6; Task 5 policies; refuse, never
 * silently substitute):
 *   alfred          — nothing special; vintages land at backfill (S4)
 *   never_revised   — nothing special; single vintage per observation
 *   alfred_windowed — REFUSE onDate older than FRED's rolling 3-year
 *                     window, pointing to the documented OFR mitigation
 *                     (charter §5)
 *   snapshot_custom — REFUSE onDate earlier than the series' earliest held
 *                     vintage (the Task 5 earliest-replayable date)
 *
 * The self-test (acceptance item 4) proves the ALFRED plumbing against the
 * live API: a known-revised CPI observation must show as-published ≠
 * current, both cited by vintage date.
 */

import { supaFetch } from '../supabase.js';
import type {
  RegimeSeriesRow,
  RegimeObservationRow,
  RegimeNormalizedObservation,
} from '../types.js';
import { fetchAsOf, fetchCurrent } from './sources/alfred.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** FRED's rolling window on ICE BofA series (Record 01 §6.1; charter §5) */
const ALFRED_WINDOW_YEARS = 3;

// ─── The one door ───────────────────────────────────────────────────────────

/**
 * The trailing `windowLength` observations of `seriesCode` exactly as
 * published on `onDate` (ISO date), newest first.
 */
export async function asOf(
  seriesCode: string,
  onDate: string,
  windowLength: number
): Promise<RegimeNormalizedObservation[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
    throw new Error(`asOf: onDate must be an ISO date (got "${onDate}")`);
  }
  if (!Number.isInteger(windowLength) || windowLength < 1) {
    throw new Error(`asOf: windowLength must be a positive integer (got ${windowLength})`);
  }

  const { data: series, error: seriesError } = await supaFetch<RegimeSeriesRow>('regime_series', {
    params: { series_code: `eq.${seriesCode}`, limit: '1' },
    single: true,
  });
  if (seriesError) throw new Error(`asOf: registry read failed for ${seriesCode}: ${seriesError}`);
  if (!series) throw new Error(`asOf: ${seriesCode} is not in the regime_series registry`);

  // Policy refusals — loud, specific, never a silent substitution
  if (series.vintage_policy === 'alfred_windowed') {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ALFRED_WINDOW_YEARS);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    if (onDate < cutoffIso) {
      throw new Error(
        `asOf: ${seriesCode} is live-duty only — FRED clamps it to a rolling ${ALFRED_WINDOW_YEARS}-year window ` +
          `(earliest ${cutoffIso}); replay past the window rides the OFR FSI per charter §5 / Task 5 §3`
      );
    }
  }

  if (series.vintage_policy === 'snapshot_custom') {
    const { data: earliest } = await supaFetch<Pick<RegimeObservationRow, 'realtime_start'>>(
      'regime_observations',
      {
        params: {
          series_id: `eq.${series.id}`,
          select: 'realtime_start',
          order: 'realtime_start.asc',
          limit: '1',
        },
        single: true,
      }
    );
    if (!earliest) {
      throw new Error(
        `asOf: ${seriesCode} has no stored snapshots yet — snapshot_custom replay begins at the first stored vintage (Task 5)`
      );
    }
    if (onDate < earliest.realtime_start) {
      throw new Error(
        `asOf: ${seriesCode} replays honestly only from ${earliest.realtime_start} (its earliest stored vintage — Task 5 ` +
          `earliest-replayable date); ${onDate} predates it. Pre-snapshot history is revised_study-grade only, never race input`
      );
    }
  }

  // The vintage-correct read: the vintage current ON onDate
  const { data: rows, error: rowsError } = await supaFetch<RegimeObservationRow[]>(
    'regime_observations',
    {
      params: {
        series_id: `eq.${series.id}`,
        realtime_start: `lte.${onDate}`,
        or: `(realtime_end.is.null,realtime_end.gt.${onDate})`,
        obs_date: `lte.${onDate}`,
        select: 'obs_date,value,realtime_start,realtime_end',
        order: 'obs_date.desc',
        limit: String(windowLength),
      },
    }
  );
  if (rowsError) throw new Error(`asOf: vintage read failed for ${seriesCode}: ${rowsError}`);

  return (rows ?? []).map(r => ({
    obs_date: r.obs_date,
    value: Number(r.value),
    realtime_start: r.realtime_start,
    realtime_end: r.realtime_end,
  }));
}

// ─── Self-test (acceptance item 4) ──────────────────────────────────────────

export interface AsOfSelfTestResult {
  seriesCode: string;
  obsDate: string;
  asOfDate: string;
  asPublished: number | null;
  current: number | null;
  differ: boolean;
  passed: boolean;
  note: string;
}

/**
 * Prove the ALFRED replay plumbing against the live API: April 2020 CPI
 * (a known-revised print — pandemic-era values were reshaped by later
 * seasonal revisions) as published on 2020-05-15 (days after its first
 * release) must differ from today's value for the same month. Runs against
 * FRED directly, so it works before any backfill; costs two paced calls.
 */
export async function runAsOfSelfTest(): Promise<AsOfSelfTestResult> {
  const seriesCode = 'CPIAUCSL';
  const obsDate = '2020-04-01';
  const asOfDate = '2020-05-15';

  const [vintage, current] = [
    await fetchAsOf(seriesCode, asOfDate, obsDate),
    await fetchCurrent(seriesCode, obsDate),
  ];

  const asPublished = vintage.find(o => o.obs_date === obsDate)?.value ?? null;
  const currentValue = current.find(o => o.obs_date === obsDate)?.value ?? null;
  const differ = asPublished !== null && currentValue !== null && asPublished !== currentValue;

  return {
    seriesCode,
    obsDate,
    asOfDate,
    asPublished,
    current: currentValue,
    differ,
    passed: differ,
    note: differ
      ? `As published ${asOfDate}: ${asPublished}; current vintage: ${currentValue} — the plumbing sees history as it was, not as it became.`
      : `Values match (${asPublished}) — investigate before trusting replay: either the revision assumption or the vintage plumbing is wrong.`,
  };
}
