/**
 * FundLens v8 — Regime Harness: Cleveland Fed adapter (A1 Task 4)
 *
 * Cleveland Fed daily inflation nowcasts — updated each business day
 * ~10:00 ET (Record 01 §6.4; charter §5).
 *
 * FETCH ADDRESS (operator-verified live, July 6, 2026 — S3 ruling):
 *   https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_quarter.json?sc_lang=en
 * with nowcast_month.json and nowcast_year.json at the same path for the
 * other horizons (Stage 3 decisions; A1 ingests the quarter horizon, the
 * one whose data format was verified against a real download).
 *
 * FORMAT: the underlying data was verified July 6, 2026 from an
 * operator-downloaded QuarterlyAnnualizedPercentChange2026q3.csv — one row
 * per business day, columns CPI / Core CPI / PCE / Core PCE (quarterly
 * annualized), each row being THAT DAY'S estimate of the SAME target
 * quarter. The JSON endpoint feeds the same chart; its exact envelope has
 * not yet been seen from the build sandbox (network policy), so the parser
 * below accepts the common chart-feed shapes and FAILS LOUDLY with a
 * payload snippet on anything else — a format surprise becomes a Task 7
 * ingest-failure alert on day one, never a silent wrong number. The proven
 * CSV parser is retained below as the format-verified alternate path.
 *
 * Vintage semantics (either path): obs_date = the target quarter's end
 * date; realtime_start = the day the estimate was published. Each quarter
 * file/feed retro-carries its own daily rows, so the current quarter's
 * as-published history reconstructs honestly on first fetch (Task 5 §5).
 *
 * Vintage policy: snapshot_custom (charter §4.2·6).
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

/** Operator-verified July 6, 2026. {HORIZON} ∈ month | quarter | year */
const CLEVELAND_NOWCAST_JSON_PATTERN =
  'https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_{HORIZON}.json?sc_lang=en';

/** A1 ingests the quarter horizon (format verified against a real file) */
const CLEVELAND_HORIZON = 'quarter';

/** Registry series_code → data column/series label (verified July 6, 2026) */
const CLEVELAND_LABEL_BY_SERIES: Record<string, string> = {
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
  const lastDay = new Date(Date.UTC(q.year, lastMonth, 0)).getUTCDate();
  return `${q.year}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function clevelandNowcastUrl(horizon: string = CLEVELAND_HORIZON): string {
  return CLEVELAND_NOWCAST_JSON_PATTERN.replace('{HORIZON}', horizon);
}

// ─── Date coercion ──────────────────────────────────────────────────────────

/** Coerce a chart-feed date (epoch ms, ISO string, or MM/DD label) to ISO.
 *  MM/DD labels take their year from the target quarter. */
export function coerceVintageDate(raw: unknown, q: QuarterRef): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const mmdd = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mmdd) {
      return `${q.year}-${mmdd[1].padStart(2, '0')}-${mmdd[2].padStart(2, '0')}`;
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

// ─── JSON parsing (fails loudly on unrecognized envelopes) ──────────────────

interface LabeledSeries {
  label: string;
  points: Array<{ dateRaw: unknown; value: number }>;
}

/** Extract labeled point-series from the common chart-feed shapes:
 *  {series:[{name,data:[...]}]}, bare arrays of row objects, or {data:...}
 *  wrappers. Points may be [x,y] pairs or {x/date/label, y/value} objects. */
function extractLabeledSeries(payload: unknown): LabeledSeries[] {
  // Unwrap {series: [...]} / {data: [...]} envelopes
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.series)) return extractLabeledSeries(obj.series);
    if (Array.isArray(obj.data)) return extractLabeledSeries(obj.data);
  }

  if (!Array.isArray(payload)) return [];

  // Shape A: array of named series [{name|label, data|points|values: [...]}]
  const named = payload.filter(
    (s): s is Record<string, unknown> =>
      !!s && typeof s === 'object' && !Array.isArray(s) &&
      typeof ((s as Record<string, unknown>).name ?? (s as Record<string, unknown>).label) === 'string' &&
      Array.isArray((s as Record<string, unknown>).data ?? (s as Record<string, unknown>).points ?? (s as Record<string, unknown>).values)
  );
  if (named.length > 0) {
    return named.map(s => {
      const label = String(s.name ?? s.label);
      const rawPoints = (s.data ?? s.points ?? s.values) as unknown[];
      const points: LabeledSeries['points'] = [];
      for (const p of rawPoints) {
        if (Array.isArray(p) && p.length >= 2) {
          const v = Number(p[1]);
          if (Number.isFinite(v)) points.push({ dateRaw: p[0], value: v });
        } else if (p && typeof p === 'object') {
          const o = p as Record<string, unknown>;
          const v = Number(o.y ?? o.value ?? o.val);
          const dateRaw = o.x ?? o.date ?? o.label ?? o.Label;
          if (Number.isFinite(v) && dateRaw !== undefined) points.push({ dateRaw, value: v });
        }
      }
      return { label, points };
    });
  }

  // Shape B: array of row objects [{Label:'07/01','CPI Inflation':0.83,...}]
  const rows = payload.filter(
    (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)
  );
  if (rows.length > 0) {
    const dateKey = ['Label', 'label', 'date', 'Date', 'x'].find(k => k in rows[0]);
    if (dateKey) {
      const valueKeys = Object.keys(rows[0]).filter(k => k !== dateKey);
      return valueKeys.map(label => ({
        label,
        points: rows
          .map(r => ({ dateRaw: r[dateKey], value: Number(r[label]) }))
          .filter(p => Number.isFinite(p.value)),
      }));
    }
  }

  return [];
}

/**
 * Parse a Cleveland nowcast JSON payload for one registry series. Every
 * daily estimate becomes a vintage of the quarter-end observation.
 * Throws with a payload snippet when the envelope is unrecognized or the
 * expected series label is absent — loud failure, never a silent zero.
 */
export function parseClevelandNowcastJson(
  payload: unknown,
  seriesCode: string,
  q: QuarterRef
): RegimeNormalizedObservation[] {
  const wanted = CLEVELAND_LABEL_BY_SERIES[seriesCode];
  if (!wanted) throw new Error(`Cleveland adapter: unknown series_code ${seriesCode}`);

  const all = extractLabeledSeries(payload);
  const snippet = () => JSON.stringify(payload)?.slice(0, 300);
  if (all.length === 0) {
    throw new Error(`Cleveland nowcast JSON: unrecognized envelope — payload starts: ${snippet()}`);
  }

  const match = all.find(s => s.label.trim().toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new Error(
      `Cleveland nowcast JSON: series "${wanted}" not found among [${all.map(s => s.label).join(', ')}]`
    );
  }

  const obsDate = quarterEndDate(q);
  const out: RegimeNormalizedObservation[] = [];
  for (const p of match.points) {
    const vintage = coerceVintageDate(p.dateRaw, q);
    if (!vintage) continue;
    out.push({ obs_date: obsDate, value: p.value, realtime_start: vintage });
  }
  if (out.length === 0) {
    throw new Error(`Cleveland nowcast JSON: series "${wanted}" yielded zero parseable points`);
  }
  return out;
}

// ─── CSV parsing — the format-verified alternate path ───────────────────────
// Proven July 6, 2026 against a real QuarterlyAnnualizedPercentChange2026q3.csv
// (header: Label,CPI Inflation,Core CPI Inflation,PCE Inflation,Core PCE
// Inflation; rows MM/DD). Kept as the switchable fallback if the JSON
// envelope proves unusable at first sweep.

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
    const vintage = coerceVintageDate(cols[0]?.trim(), q);
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
 * Fetch the current quarter's nowcast feed and return every daily vintage
 * it carries for one registry series (ingest dedupes held rows — Task 6).
 */
export async function fetchClevelandNowcast(
  seriesCode: string,
  onDate: string
): Promise<RegimeNormalizedObservation[]> {
  const q = quarterOf(onDate);
  const url = clevelandNowcastUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cleveland nowcast fetch returned ${res.status} from ${url}`);
  }
  const payload = await res.json();
  return parseClevelandNowcastJson(payload, seriesCode, q);
}
