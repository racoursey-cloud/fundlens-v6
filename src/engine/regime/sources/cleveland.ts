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
 *
 * ── A1-F1 p1: the artifact lag (ruled August 14, 2026) ─────────────────
 *
 * The publisher's own page runs AHEAD of this artifact. Measured from our
 * ingest record, the file we read has fallen behind in steps — same-day
 * through July 14, one business day to July 31, and two business days from
 * August 4 onward. Operator-verified the evening of August 14: every table
 * on the nowcasting page read "Updated 08/14" while that evening's sweep
 * artifact carried 08-12. The page is server-rendered — it fires no data
 * endpoint at all, the tables live in its HTML — so there is no fresher
 * endpoint to adopt. This URL remains the only machine-readable channel.
 *
 * Two things are therefore done here, and neither changes a number:
 *
 *   1. THE ARTIFACT'S OWN STAMP IS LOGGED at every fetch, beside the newest
 *      vintage the file actually carries and the response's cache headers.
 *      That triple settles the open question within a week of sweeps: if the
 *      stamp is today's and the newest row is two days old, the publisher's
 *      data file genuinely lags their page; if the stamp itself is two days
 *      old, we are being served a stale copy. Diagnosis before cure.
 *   2. THE FETCH ASKS PAST ANY INTERMEDIARY CACHE, and falls back to the
 *      exact production URL if that request fails for any reason. The
 *      cache-bust could not be tested before shipping (this environment's
 *      egress policy denies clevelandfed.org), so it is built to degrade to
 *      today's behaviour rather than risk a dark series.
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** Operator-verified July 6, 2026. {HORIZON} ∈ month | quarter | year */
const CLEVELAND_NOWCAST_JSON_PATTERN =
  'https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_{HORIZON}.json?sc_lang=en';

/** A1 ingests the quarter horizon (data verified against a real download) */
const CLEVELAND_HORIZON = 'quarter';

/** A1-F1 p1: query parameter appended to defeat an intermediary cache.
 *  Unrecognized by the origin, which is why the fetch falls back to the
 *  plain production URL if the busted request is refused. */
const CLEVELAND_CACHE_BUST_PARAM = '_cb';

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

/**
 * A1-F1 p1 — the artifact's own publication stamp.
 *
 * Every quarter block carries `chart._comment` as "YYYY-MM-DD HH:MM", which
 * is the publisher's statement of when THIS FILE was written. The newest one
 * across blocks is the file's stamp. Read beside the newest vintage the file
 * carries, it separates a stale copy (old stamp) from a genuinely lagging
 * data file (today's stamp, old rows). Lexical comparison is safe: the
 * format is fixed-width and zero-padded.
 *
 * Returns null rather than throwing — a missing stamp degrades the log line,
 * never the ingest. Parsing owns the loud failures; this is diagnosis.
 */
export function clevelandArtifactStamp(payload: unknown): string | null {
  if (!Array.isArray(payload)) return null;
  let newest: string | null = null;
  for (const raw of payload) {
    const comment = (raw as ClevelandChartBlock)?.chart?._comment;
    if (typeof comment !== 'string') continue;
    const trimmed = comment.trim();
    if (trimmed && (newest === null || trimmed > newest)) newest = trimmed;
  }
  return newest;
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
  const productionUrl = clevelandNowcastUrl();
  const bustedUrl = `${productionUrl}&${CLEVELAND_CACHE_BUST_PARAM}=${Date.now()}`;

  // A1-F1 p1: ask past any intermediary cache first. If that request fails
  // for ANY reason — an origin that rejects the unknown parameter, a cache
  // that refuses no-cache, a transport error — fall straight back to the
  // exact URL that has been working. The bust could not be tested before
  // shipping, so its worst case is today's behaviour, never a dark series.
  let res: Response | null = null;
  let cacheBusted = true;
  try {
    const attempt = await fetch(bustedUrl, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (attempt.ok) res = attempt;
  } catch {
    // fall through to the production URL
  }
  if (!res) {
    cacheBusted = false;
    res = await fetch(productionUrl);
    if (!res.ok) {
      throw new Error(`Cleveland nowcast fetch returned ${res.status} from ${productionUrl}`);
    }
  }

  const payload = await res.json();
  const observations = parseClevelandNowcastJson(payload, seriesCode);

  // The diagnostic triple (A1-F1 p1). Parsing has already succeeded, so
  // `observations` is non-empty and the reduce below has a seed.
  const newestInFile = observations.reduce(
    (max, o) => (o.realtime_start > max ? o.realtime_start : max),
    observations[0]!.realtime_start
  );
  console.log(
    `[regime] Cleveland nowcast ${seriesCode}: file stamp ${clevelandArtifactStamp(payload) ?? 'absent'}; ` +
      `newest vintage in file ${newestInFile}; ` +
      `served ${cacheBusted ? 'cache-busted' : 'plain URL (bust fell back)'}; ` +
      `last-modified ${res.headers.get('last-modified') ?? 'absent'}; ` +
      `age ${res.headers.get('age') ?? 'absent'}`
  );

  return observations;
}
