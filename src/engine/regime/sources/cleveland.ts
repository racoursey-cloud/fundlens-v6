/**
 * FundLens v8 — Regime Harness: Cleveland Fed adapter (A1 Task 4)
 *
 * Cleveland Fed daily inflation nowcasts — updated each business day
 * ~10:00 ET (Record 01 §6.4; charter §5).
 *
 * FORMAT VERIFIED July 6, 2026 from an operator-downloaded
 * QuarterlyAnnualizedPercentChange2026q3.csv: header
 *   Label,CPI Inflation,Core CPI Inflation,PCE Inflation,Core PCE Inflation
 * with one row per business day (Label = MM/DD, no year — the year lives in
 * the file name), each row being THAT DAY'S estimate of the SAME target
 * quarter. The file is therefore its own within-quarter vintage record:
 * obs_date = the target quarter's end date; realtime_start = the row's day.
 *
 * A1 ingests the headline CPI and PCE columns (the two registry rows);
 * the Core columns are one flag-flip away for Stage 3 — registry rows,
 * never schema (A1 §2).
 *
 * Vintage policy: snapshot_custom (charter §4.2·6) — replay begins where
 * our snapshots begin, EXCEPT that each quarter file retro-carries its own
 * daily rows, so the current quarter's earlier nowcasts are honestly
 * reconstructable on first fetch. Whether archived past-quarter files
 * remain downloadable is a Task 5 / S4 verification item.
 *
 * URL: best-known pattern derived from the operator-verified file name.
 * Proven by the first Railway sweep (A1 acceptance item 3); a wrong address
 * fails loudly through the Task 7 ingest-failure alert.
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** {YYYY} and {Q} are substituted per target quarter */
const CLEVELAND_QUARTERLY_CSV_PATTERN =
  'https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/QuarterlyAnnualizedPercentChange{YYYY}q{Q}.csv';

/** Registry series_code → CSV column header (verified July 6, 2026) */
const CLEVELAND_COLUMN_BY_SERIES: Record<string, string> = {
  CLEV_CPI_NOWCAST: 'CPI Inflation',
  CLEV_PCE_NOWCAST: 'PCE Inflation',
};

// ─── Quarter helpers ────────────────────────────────────────────────────────

export interface QuarterRef {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

/** The quarter an ISO date falls in */
export function quarterOf(isoDate: string): QuarterRef {
  const [y, m] = isoDate.split('-').map(Number);
  return { year: y, quarter: (Math.floor((m - 1) / 3) + 1) as QuarterRef['quarter'] };
}

/** ISO end date of a quarter — the obs_date a nowcast row describes */
export function quarterEndDate(q: QuarterRef): string {
  const lastMonth = q.quarter * 3;
  const lastDay = [3, 6, 9, 12].includes(lastMonth)
    ? new Date(Date.UTC(q.year, lastMonth, 0)).getUTCDate()
    : 30;
  return `${q.year}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function quarterlyCsvUrl(q: QuarterRef): string {
  return CLEVELAND_QUARTERLY_CSV_PATTERN.replace('{YYYY}', String(q.year)).replace(
    '{Q}',
    String(q.quarter)
  );
}

// ─── Parsing (exported for the offline self-test against the real file) ─────

/**
 * Parse a Cleveland quarterly nowcast CSV for one registry series.
 * Each MM/DD row becomes a vintage of the quarter-end observation:
 * obs_date = quarter end, realtime_start = the row's own date.
 */
export function parseClevelandQuarterlyCsv(
  csv: string,
  seriesCode: string,
  q: QuarterRef
): RegimeNormalizedObservation[] {
  const column = CLEVELAND_COLUMN_BY_SERIES[seriesCode];
  if (!column) {
    throw new Error(`Cleveland adapter: unknown series_code ${seriesCode}`);
  }

  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Cleveland nowcast CSV: no data rows — format may have changed');
  }

  const header = lines[0].split(',').map(h => h.trim());
  const valueIdx = header.indexOf(column);
  if (valueIdx === -1) {
    throw new Error(
      `Cleveland nowcast CSV: column "${column}" not found in header [${header.join(', ')}] — format changed`
    );
  }

  const obsDate = quarterEndDate(q);
  const out: RegimeNormalizedObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const label = cols[0]?.trim(); // MM/DD
    const raw = cols[valueIdx]?.trim();
    if (!label || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const [mm, dd] = label.split('/');
    if (!mm || !dd) continue;
    out.push({
      obs_date: obsDate,
      value,
      realtime_start: `${q.year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    });
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the current quarter's nowcast file and return every daily vintage
 * it carries for one registry series (the sweep's ingest dedupes rows it
 * already holds — A1 Task 6).
 */
export async function fetchClevelandNowcast(
  seriesCode: string,
  onDate: string
): Promise<RegimeNormalizedObservation[]> {
  const q = quarterOf(onDate);
  const url = quarterlyCsvUrl(q);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cleveland nowcast fetch returned ${res.status} from ${url}`);
  }
  const text = await res.text();
  return parseClevelandQuarterlyCsv(text, seriesCode, q);
}
