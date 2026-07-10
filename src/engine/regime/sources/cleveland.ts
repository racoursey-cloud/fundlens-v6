/**
 * FundLens v8 — Regime Harness: Cleveland Fed adapter (A1 Task 4)
 *
 * Cleveland Fed daily inflation nowcasts — updated each business day
 * ~10:00 ET (Record 01 §6.4; charter §5).
 *
 * FETCH ADDRESS (operator-verified live, July 6, 2026 — S3 ruling):
 *   https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_quarter.json?sc_lang=en
 * with nowcast_month.json and nowcast_year.json at the same path for the
 * other horizons (Stage 3 decisions; A1 ingests the quarter horizon).
 *
 * PAYLOAD SCHEMA (verified live by Fabio, July 6, 2026): a top-level array
 * of chart blocks — ONE PER QUARTER, 2013:Q3 → present — each shaped
 *   { chart: { _comment: "YYYY-MM-DD HH:MM" publication stamp,
 *              subcaption: the quarter },
 *     categories: [ { category: [ { label: "MM/DD" }, ... ] } ],
 *     dataset: exactly four series — CPI, Core CPI, PCE, Core PCE
 *              Inflation — each data[i].value a stringified number
 *              aligned to the category labels }
 * The feed therefore carries the FULL as-published daily nowcast archive
 * back to 2013:Q3 in a single fetch — each block is its own within-quarter
 * vintage record, and the Task 5 §5 open archive question is RESOLVED:
 * the archive ships inside the live file.
 *
 * A1 ingests the headline CPI and PCE series (the two registry rows);
 * Core series are one flag-flip away for Stage 3 — registry rows, never
 * schema (A1 §2).
 *
 * Vintage semantics: obs_date = the block's quarter-end date;
 * realtime_start = the daily label's date (year chosen so the label sits
 * closest to its block's quarter — publications run from a prior-quarter
 * lead-in through post-quarter trailing updates; A2 F2 fix, July 10, 2026).
 * Ingest dedupes held vintages (Task 6).
 *
 * Vintage policy: snapshot_custom (charter §4.2·6); earliest honestly-
 * replayable date 2013:Q3 per the live archive.
 *
 * Any envelope surprise FAILS LOUDLY with a payload snippet — a format
 * change becomes a Task 7 ingest-failure alert, never a silent number.
 * The CSV parser (proven against a real operator download) is retained as
 * the switchable fallback path.
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** Operator-verified July 6, 2026. {HORIZON} ∈ month | quarter | year */
const CLEVELAND_NOWCAST_JSON_PATTERN =
  'https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_{HORIZON}.json?sc_lang=en';

/** A1 ingests the quarter horizon (data verified against a real download) */
const CLEVELAND_HORIZON = 'quarter';

/** Registry series_code → dataset series name (verified July 6, 2026) */
const CLEVELAND_LABEL_BY_SERIES: Record<string, string> = {
  CLEV_CPI_NOWCAST: 'CPI Inflation',
  CLEV_PCE_NOWCAST: 'PCE Inflation',
};

/** Dataset order when seriesname is absent (Fabio-verified block layout) */
const CLEVELAND_DATASET_ORDER = [
  'CPI Inflation',
  'Core CPI Inflation',
  'PCE Inflation',
  'Core PCE Inflation',
];

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
  const lastDay = new Date(Date.UTC(q.year, lastMonth, 0)).getUTCDate();
  return `${q.year}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Parse a block's quarter from chart.subcaption (e.g. "2026:Q3") */
export function parseQuarterLabel(subcaption: string): QuarterRef | null {
  const m = subcaption.match(/(\d{4})\s*[:.\s-]?\s*Q([1-4])/i);
  if (!m) return null;
  return { year: Number(m[1]), quarter: Number(m[2]) as QuarterRef['quarter'] };
}

export function clevelandNowcastUrl(horizon: string = CLEVELAND_HORIZON): string {
  return CLEVELAND_NOWCAST_JSON_PATTERN.replace('{HORIZON}', horizon);
}

/** MM/DD label + its block's quarter → ISO vintage date.
 *
 *  A2 F2 fix (July 10, 2026): a quarter's nowcast publications span from a
 *  lead-in in the prior quarter, through the quarter, to trailing updates
 *  after quarter end (until the official print lands). The original rule
 *  ("month past quarter-end ⇒ prior year") dated every trailing label one
 *  year early — and a Q4 block's January/February trailing labels one year
 *  early by the other branch. Correct rule: of the three candidate years,
 *  take the one that places the label closest to the quarter's middle
 *  month — every legitimate label sits within ±6 months of it, so the
 *  choice is unambiguous. */
export function labelToVintageDate(label: string, q: QuarterRef): string | null {
  const m = label.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const quarterMidAbs = q.year * 12 + (q.quarter * 3 - 1);
  let year = q.year;
  let best = Infinity;
  for (const candidate of [q.year - 1, q.year, q.year + 1]) {
    const dist = Math.abs(candidate * 12 + month - quarterMidAbs);
    if (dist < best) {
      best = dist;
      year = candidate;
    }
  }
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// ─── JSON parsing (exact schema; fails loudly on surprises) ─────────────────

interface ClevelandChartBlock {
  chart?: { _comment?: string; subcaption?: string; caption?: string };
  categories?: Array<{ category?: Array<{ label?: string }> }>;
  dataset?: Array<{ seriesname?: string; data?: Array<{ value?: string | number }> }>;
}

/**
 * Parse the Cleveland nowcast JSON for one registry series: every daily
 * estimate in every quarter block becomes a vintage of that block's
 * quarter-end observation. One call returns the full archive (2013:Q3 →
 * present); ingest dedupes rows already held (A1 Task 6).
 */
export function parseClevelandNowcastJson(
  payload: unknown,
  seriesCode: string
): RegimeNormalizedObservation[] {
  const wanted = CLEVELAND_LABEL_BY_SERIES[seriesCode];
  if (!wanted) throw new Error(`Cleveland adapter: unknown series_code ${seriesCode}`);

  const snippet = () => JSON.stringify(payload)?.slice(0, 300);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(
      `Cleveland nowcast JSON: expected a non-empty array of quarter blocks — payload starts: ${snippet()}`
    );
  }

  const out: RegimeNormalizedObservation[] = [];
  let parsedBlocks = 0;

  for (const raw of payload) {
    const block = raw as ClevelandChartBlock;
    const subcaption = block?.chart?.subcaption ?? '';
    const q = parseQuarterLabel(subcaption);
    const labels = block?.categories?.[0]?.category;
    const dataset = block?.dataset;
    if (!q || !Array.isArray(labels) || !Array.isArray(dataset)) continue;

    // Locate the wanted series: by seriesname when present, else by the
    // verified dataset order.
    let seriesEntry = dataset.find(
      d =>
        typeof d?.seriesname === 'string' &&
        d.seriesname.trim().toLowerCase() === wanted.toLowerCase()
    );
    if (!seriesEntry) {
      const idx = CLEVELAND_DATASET_ORDER.indexOf(wanted);
      if (idx !== -1 && dataset[idx]?.data) seriesEntry = dataset[idx];
    }
    if (!seriesEntry?.data) continue;

    const obsDate = quarterEndDate(q);
    for (let i = 0; i < seriesEntry.data.length; i++) {
      const label = labels[i]?.label;
      const rawVal = seriesEntry.data[i]?.value;
      if (typeof label !== 'string' || rawVal === undefined || rawVal === null || rawVal === '') continue;
      const value = Number(rawVal);
      if (!Number.isFinite(value)) continue;
      const vintage = labelToVintageDate(label, q);
      if (!vintage) continue;
      out.push({ obs_date: obsDate, value, realtime_start: vintage });
    }
    parsedBlocks++;
  }

  if (parsedBlocks === 0) {
    throw new Error(
      `Cleveland nowcast JSON: no quarter block matched the verified schema — payload starts: ${snippet()}`
    );
  }
  if (out.length === 0) {
    throw new Error(`Cleveland nowcast JSON: series "${wanted}" yielded zero parseable points`);
  }
  return out;
}

// ─── CSV parsing — the format-verified alternate path ───────────────────────
// Proven July 6, 2026 against a real QuarterlyAnnualizedPercentChange2026q3.csv
// (header: Label,CPI Inflation,Core CPI Inflation,PCE Inflation,Core PCE
// Inflation; rows MM/DD). Kept as the switchable fallback if the JSON feed
// ever changes shape.

export function parseClevelandQuarterlyCsv(
  csv: string,
  seriesCode: string,
  q: QuarterRef
): RegimeNormalizedObservation[] {
  const column = CLEVELAND_LABEL_BY_SERIES[seriesCode];
  if (!column) throw new Error(`Cleveland adapter: unknown series_code ${seriesCode}`);

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
    const vintage = labelToVintageDate(cols[0]?.trim() ?? '', q);
    const raw = cols[valueIdx]?.trim();
    if (!vintage || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ obs_date: obsDate, value, realtime_start: vintage });
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the nowcast feed and return every daily vintage it carries for one
 * registry series — the full 2013:Q3 → present archive in one call
 * (ingest dedupes rows already held — A1 Task 6).
 */
export async function fetchClevelandNowcast(
  seriesCode: string
): Promise<RegimeNormalizedObservation[]> {
  const url = clevelandNowcastUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cleveland nowcast fetch returned ${res.status} from ${url}`);
  }
  const payload = await res.json();
  return parseClevelandNowcastJson(payload, seriesCode);
}
