/**
 * FundLens v8 — Regime Harness: ALFRED adapter (A1 Task 4)
 *
 * The regime house's own FRED adapter, named for its defining capability —
 * as-published vintage retrieval — so it can never be confused with the
 * thesis-lane src/engine/fred.ts, which stays untouched (A1 §1, §6).
 * Shares only the FRED_API_KEY (A1 O1: one key serves both lanes).
 *
 * Modes (A1 Task 4):
 *   current        — the latest published values of a series
 *   vintage window — observations exactly as published inside a realtime
 *                    window (FRED realtime_start/realtime_end parameters —
 *                    this IS the ALFRED replay plumbing of charter §6·1)
 *   as-of          — the world exactly as it looked on one date (Task 8's
 *                    workhorse for `alfred`-policy series)
 *   vintagedates   — a series' full revision map
 *
 * Honesty note carried into ingest (A1 Task 6): FRED clamps a returned
 * observation's realtime_start to the requested window start when the value
 * was published earlier. A clamped realtime_start is a WINDOW artifact, not
 * a publication date — ingest must dedupe by value comparison against the
 * currently-held vintage, never blind-insert.
 *
 * Pacing: sequential calls, REGIME_FRED_DELAY_MS apart — API courtesy far
 * below FRED's ~120 req/min ceiling (Record 01 §6.2). This constant is an
 * API-courtesy constant, unrelated to the 1.2s Claude-call law (charter §3):
 * no Claude call exists anywhere in A1 (charter §2.3).
 */

import { delay, type RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6 — constants.ts untouched) ─────

const FRED_API_BASE = 'https://api.stlouisfed.org/fred';

/** Courtesy delay between sequential FRED calls (Record 01 §6.2) */
export const REGIME_FRED_DELAY_MS = 250;

// ─── Pacing ─────────────────────────────────────────────────────────────────

let lastCallAtMs = 0;

/** Enforce sequential, paced calls — never parallel (house pattern) */
async function pace(): Promise<void> {
  const now = Date.now();
  const wait = lastCallAtMs + REGIME_FRED_DELAY_MS - now;
  if (wait > 0) await delay(wait);
  lastCallAtMs = Date.now();
}

// ─── Core request ───────────────────────────────────────────────────────────

interface FredObservationJson {
  date: string;
  value: string;
  realtime_start: string;
  realtime_end: string;
}

async function fredRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error('FRED_API_KEY environment variable is not set (A1 O1: the key is shared with the thesis lane)');
  }

  const url = new URL(`${FRED_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');

  await pace();
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FRED ${path} returned ${res.status} for ${params.series_id ?? ''}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Map FRED observation JSON to normalized rows; FRED encodes missing as "." */
function normalize(observations: FredObservationJson[]): RegimeNormalizedObservation[] {
  const out: RegimeNormalizedObservation[] = [];
  for (const o of observations) {
    if (o.value === '.' || o.value === '') continue; // missing datapoint
    const value = Number(o.value);
    if (!Number.isFinite(value)) continue;
    out.push({
      obs_date: o.date,
      value,
      realtime_start: o.realtime_start,
      realtime_end: o.realtime_end === '9999-12-31' ? null : o.realtime_end,
    });
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Current mode: the latest published window of a series (today's vintage).
 * The returned realtime_start is today for every row — callers storing
 * vintages must use fetchVintageWindow instead; this mode serves quick
 * "what does the world say now" reads.
 */
export async function fetchCurrent(
  seriesCode: string,
  observationStart?: string
): Promise<RegimeNormalizedObservation[]> {
  const params: Record<string, string> = { series_id: seriesCode };
  if (observationStart) params.observation_start = observationStart;
  const json = await fredRequest<{ observations: FredObservationJson[] }>(
    'series/observations',
    params
  );
  return normalize(json.observations ?? []);
}

/**
 * Vintage-window mode: every vintage of every observation whose realtime
 * window intersects [realtimeStart, realtimeEnd] — the daily sweep's tool
 * for catching recent revisions as new vintage rows (A1 Task 6).
 * Remember the clamping note in the file header.
 */
export async function fetchVintageWindow(
  seriesCode: string,
  realtimeStart: string,
  realtimeEnd: string,
  observationStart?: string
): Promise<RegimeNormalizedObservation[]> {
  const params: Record<string, string> = {
    series_id: seriesCode,
    realtime_start: realtimeStart,
    realtime_end: realtimeEnd,
  };
  if (observationStart) params.observation_start = observationStart;
  const json = await fredRequest<{ observations: FredObservationJson[] }>(
    'series/observations',
    params
  );
  return normalize(json.observations ?? []);
}

/**
 * As-of mode: the series exactly as published on `onDate` — the world as an
 * observer saw it that day (charter §2.3 race law; consumed by A1 Task 8).
 */
export async function fetchAsOf(
  seriesCode: string,
  onDate: string,
  observationStart?: string
): Promise<RegimeNormalizedObservation[]> {
  return fetchVintageWindow(seriesCode, onDate, onDate, observationStart);
}

/**
 * The revision map: every date on which FRED/ALFRED recorded a new vintage
 * of this series (fred/series/vintagedates; Record 01 §6.2).
 */
export async function fetchVintageDates(seriesCode: string): Promise<string[]> {
  const json = await fredRequest<{ vintage_dates: string[] }>('series/vintagedates', {
    series_id: seriesCode,
    limit: '10000',
  });
  return json.vintage_dates ?? [];
}
