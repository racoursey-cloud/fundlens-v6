/**
 * FundLens v8 — The Race: D2 library rail adapter (A2 Task 5, S4-ratified)
 *
 * ONE duty: the one-time adoption ingest of RACE_EQ_TR — the daily U.S.
 * equity total-return index CONTENDER_B §4.2 defines — from the D2 library's
 * (Ken French) daily three-factor file, into the vintage memory, where
 * asOf() serves it to contenders exactly like every other series
 * (CONTENDER_B §4.3, ratified at S4: same upstream file, two lawful
 * channels — this registered series for signals; the runner's quarantined
 * metric-3 cache, which never touches the regime tables, comes with Task 6).
 *
 * FROZEN AT ADOPTION (S4 ruling): this ingest runs once. The registry row
 * is dormant (enabled=false) so the daily sweep and the expectations check
 * never touch it; the library's monthly rebuilds therefore never reach our
 * memory, and the restatement caveat lives in SOURCE_VINTAGE_POLICIES §7
 * and the race's honesty notes — not in our data.
 *
 * THE RECONCILIATION GATE (S4 ruling: "a mismatch is a finding, never a
 * silent overwrite"): before anything is written, the fetched file's first
 * data row must reconcile against the S4 primary print (Fabio-side fetch,
 * 2026-07-10 22:41 UTC). Values are the law — the 1926-07-01 market and
 * risk-free returns must match exactly; raw spacing and the file hash may
 * drift with the library's monthly rebuilds and are logged as evidence,
 * never gated on. On mismatch the ingest REFUSES, the run row fails, and
 * the alert email carries the finding.
 *
 * never_revised mechanics: realtime_start = obs_date for every row — each
 * day's index value was knowable that day (exchange closes are final at
 * publication; the computed-file caveat is §7's, stated, not hidden).
 *
 * No Claude call exists anywhere in this module (charter §2.3).
 */

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { supaFetch, supaInsert, supaUpdate } from '../../supabase.js';
import { sendAdminAlert } from '../../admin-alert.js';
import { startRunHeartbeat } from '../../monitor.js';
import type {
  RegimeSeriesRow,
  RegimeIngestRunRow,
  RegimeNormalizedObservation,
} from '../../types.js';
import { ingestObservations } from '../ingest.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

const FRENCH_DAILY_FACTORS_URL =
  'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip';

const RAIL_SERIES_CODE = 'RACE_EQ_TR';

/** CONTENDER_B §4.2: the index base immediately before the verified start */
const RAIL_INDEX_BASE = 100;

/** Stored-value precision — two ingests of the same file are byte-identical */
const RAIL_VALUE_DECIMALS = 6;

/** The S4 primary print (Fabio-side fetch, 2026-07-10 22:41 UTC) — the
 *  adoption anchor every fetch must reconcile against. Values are the gate;
 *  `raw` is the printed line for the log. */
const S4_PRINT = {
  isoDate: '1926-07-01',
  mktRf: 0.09,
  rf: 0.01,
  raw: '19260701,    0.09,   -0.25,   -0.27,    0.01',
} as const;

// ─── Minimal single-entry ZIP extraction (the D2 files ship zipped) ─────────

/** Extract the first (only) entry of a ZIP archive. Deterministic, no
 *  dependencies; refuses loudly on anything but the expected shape. */
export function unzipSingleEntry(buf: Buffer): Buffer {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('D2 rail: response is not a ZIP archive (PK signature missing) — format changed');
  }
  const flags = buf.readUInt16LE(6);
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;

  let compSize = buf.readUInt32LE(18);
  if ((flags & 0x08) !== 0 || compSize === 0) {
    // Sizes live in the central directory — locate it via the end record.
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new Error('D2 rail: ZIP end-of-central-directory not found — format changed');
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) {
      throw new Error('D2 rail: ZIP central directory malformed — format changed');
    }
    compSize = buf.readUInt32LE(cdOffset + 20);
  }

  const data = buf.subarray(dataStart, dataStart + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`D2 rail: unsupported ZIP compression method ${method} — format changed`);
}

// ─── Parsing (exported for offline self-testing, cboe.ts pattern) ───────────

export interface FrenchDailyFile {
  /** The file's own CRSP build-note line, verbatim (adoption evidence) */
  buildNote: string | null;
  /** The first data line, verbatim (the reconciliation anchor's raw form) */
  firstDataRow: string;
  rows: Array<{ isoDate: string; mktRf: number; rf: number }>;
}

/** Parse the daily three-factor CSV: prose banner, a header row
 *  (,Mkt-RF,SMB,HML,RF), YYYYMMDD data rows, prose tail. Column order is
 *  located by header name; a changed layout refuses loudly. */
export function parseFrenchDailyCsv(csv: string): FrenchDailyFile {
  const lines = csv.split(/\r?\n/);
  const buildNote = lines.find(l => l.toLowerCase().includes('crsp database'))?.trim() ?? null;

  const headerIdx = lines.findIndex(l => /mkt[-_ ]?rf/i.test(l) && l.includes(','));
  if (headerIdx === -1) {
    throw new Error('D2 rail: factor header row (Mkt-RF,…) not found — format changed');
  }
  const header = lines[headerIdx].split(',').map(h => h.trim().toLowerCase());
  const mktRfIdx = header.findIndex(h => h.replace(/[-_ ]/g, '') === 'mktrf');
  const rfIdx = header.findIndex(h => h === 'rf');
  if (mktRfIdx === -1 || rfIdx === -1) {
    throw new Error(`D2 rail: Mkt-RF/RF columns not found in header [${header.join(', ')}] — format changed`);
  }

  const rows: FrenchDailyFile['rows'] = [];
  let firstDataRow = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(\d{4})(\d{2})(\d{2})\s*,/);
    if (!m) {
      if (rows.length > 0) break; // prose tail after the data block
      continue;
    }
    const cols = line.split(',');
    const mktRf = Number(cols[mktRfIdx]?.trim());
    const rf = Number(cols[rfIdx]?.trim());
    if (!Number.isFinite(mktRf) || !Number.isFinite(rf)) {
      throw new Error(`D2 rail: non-numeric factor values on data row "${line.trim()}" — format changed`);
    }
    if (firstDataRow === '') firstDataRow = line.replace(/\r$/, '');
    rows.push({ isoDate: `${m[1]}-${m[2]}-${m[3]}`, mktRf, rf });
  }

  if (rows.length === 0) throw new Error('D2 rail: no data rows parsed — format changed');
  return { buildNote, firstDataRow, rows };
}

// ─── The reconciliation gate (S4 ruling) ────────────────────────────────────

/** Refuse unless the fetched file's first data row reconciles against the
 *  S4 primary print. Values are the law; spacing/hash drift is evidence. */
export function reconcileAgainstS4Print(file: FrenchDailyFile): void {
  const first = file.rows[0];
  if (first.isoDate !== S4_PRINT.isoDate || first.mktRf !== S4_PRINT.mktRf || first.rf !== S4_PRINT.rf) {
    throw new Error(
      `D2 rail RECONCILIATION FAILURE — a finding, never a silent overwrite (S4 ruling): ` +
        `fetched first data row "${file.firstDataRow}" (${first.isoDate}: Mkt-RF ${first.mktRf}, RF ${first.rf}) ` +
        `does not reconcile against the S4 primary print "${S4_PRINT.raw}" ` +
        `(${S4_PRINT.isoDate}: Mkt-RF ${S4_PRINT.mktRf}, RF ${S4_PRINT.rf}). Nothing was written.`
    );
  }
  if (file.firstDataRow !== S4_PRINT.raw) {
    console.log(
      `[regime] D2 rail: first row values reconcile; raw spacing differs from the S4 print ` +
        `(theirs: "${file.firstDataRow}") — a rebuild artifact, logged as evidence`
    );
  }
}

// ─── Index construction (CONTENDER_B §4.2, frozen at S4) ────────────────────

/** I₀ = 100 immediately before the verified start; each stored value is the
 *  post-return index Iₜ = Iₜ₋₁ × (1 + (Mkt-RFₜ + RFₜ)/100), rounded to 6
 *  decimals and re-anchored on the stored value so the stored series IS the
 *  series. realtime_start = obs_date (never_revised). */
export function buildRaceEqTrIndex(rows: FrenchDailyFile['rows']): RegimeNormalizedObservation[] {
  let index = RAIL_INDEX_BASE;
  return rows.map(r => {
    index = Number((index * (1 + (r.mktRf + r.rf) / 100)).toFixed(RAIL_VALUE_DECIMALS));
    return { obs_date: r.isoDate, value: index, realtime_start: r.isoDate, realtime_end: null };
  });
}

// ─── The one-time adoption ingest (boot task, cron.ts) ──────────────────────

/**
 * Runs once, ever: if RACE_EQ_TR is registered (the Task 5 migration,
 * Robert's hand) and holds no observations yet, fetch the daily file, gate
 * it against the S4 print, build the index, and ingest — then email the
 * adoption evidence (fetch timestamp, both SHA-256s, the CRSP build note,
 * first/last rows, row count) for the SOURCE_VINTAGE_POLICIES §7 amendment.
 * Any subsequent boot sees stored rows and skips: frozen at adoption.
 */
export async function runRailIngestIfNeeded(): Promise<void> {
  const { data: series } = await supaFetch<RegimeSeriesRow>('regime_series', {
    params: { series_code: `eq.${RAIL_SERIES_CODE}`, source: 'eq.french', limit: '1' },
    single: true,
  });
  if (!series) {
    console.log(
      `[regime] D2 rail: ${RAIL_SERIES_CODE} not in the registry — the Task 5 migration has not been applied; skipping (migrations before merges)`
    );
    return;
  }

  const { data: existing } = await supaFetch<{ id: string }>('regime_observations', {
    params: { series_id: `eq.${series.id}`, select: 'id', limit: '1' },
    single: true,
  });
  if (existing) {
    console.log(`[regime] D2 rail: ${RAIL_SERIES_CODE} already holds observations — frozen at adoption; skipping`);
    return;
  }

  const { data: run } = await supaInsert<RegimeIngestRunRow>(
    'regime_ingest_runs',
    { kind: 'manual', status: 'running', error: 'RAIL ADOPTION (not an error): one-time D2 ingest, A2 Task 5' },
    { single: true }
  );
  if (!run) {
    console.error('[regime] D2 rail: could not create the adoption run row — will retry next boot');
    return;
  }
  const stopHeartbeat = startRunHeartbeat(run.id, 'regime_ingest_runs');
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(FRENCH_DAILY_FACTORS_URL);
    if (!res.ok) {
      throw new Error(`D2 rail fetch returned ${res.status} from ${FRENCH_DAILY_FACTORS_URL}`);
    }
    const zipBytes = Buffer.from(await res.arrayBuffer());
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    const csvBytes = unzipSingleEntry(zipBytes);
    const csvSha256 = createHash('sha256').update(csvBytes).digest('hex');

    const file = parseFrenchDailyCsv(csvBytes.toString('utf8'));
    reconcileAgainstS4Print(file);

    const observations = buildRaceEqTrIndex(file.rows);
    const result = await ingestObservations(series, observations, run.id);
    const firstObs = observations[0];
    const lastObs = observations[observations.length - 1];

    await supaUpdate(
      'regime_ingest_runs',
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        series_attempted: 1,
        rows_written: result.written,
        error: 'RAIL ADOPTION (not an error): one-time D2 ingest, A2 Task 5',
      },
      { id: `eq.${run.id}` }
    );

    console.log(
      `[regime] D2 rail adoption complete: ${result.written} rows, ${firstObs.obs_date} → ${lastObs.obs_date}; ` +
        `build note: ${file.buildNote ?? 'NOT FOUND'}; zip sha256 ${zipSha256}; csv sha256 ${csvSha256}`
    );

    await sendAdminAlert(
      'Regime harness: race rail adopted — the one-time D2 price-history load is in',
      `<p>The race's price rail (${RAIL_SERIES_CODE}) has been loaded, once and finally. ` +
        `Its first data row matched the verification print recorded at the S4 ruling exactly, ` +
        `so the gate opened and <strong>${result.written}</strong> daily index values were stored, ` +
        `covering ${firstObs.obs_date} through ${lastObs.obs_date}. This series is deliberately ` +
        `never refreshed — the race runs on this frozen copy.</p>` +
        `<p>Adoption evidence, for the policy-document amendment (SOURCE_VINTAGE_POLICIES §7):</p>` +
        `<ul><li>Fetch timestamp: ${fetchedAt}</li>` +
        `<li>First data row, verbatim: <code>${file.firstDataRow}</code></li>` +
        `<li>File's own build note: ${file.buildNote ?? 'NOT FOUND — flag this'}</li>` +
        `<li>SHA-256 (zip as fetched): ${zipSha256}</li>` +
        `<li>SHA-256 (extracted CSV): ${csvSha256}</li></ul>`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[regime] D2 rail adoption failed: ${msg}`);
    await supaUpdate(
      'regime_ingest_runs',
      { status: 'failed', completed_at: new Date().toISOString(), series_attempted: 1, rows_written: 0, error: msg },
      { id: `eq.${run.id}` }
    );
    sendAdminAlert(
      'Regime harness: the race rail adoption did NOT load — a finding, nothing written',
      `<p>The one-time load of the race's price history stopped before writing anything:</p>` +
        `<p><strong>${msg}</strong></p>` +
        `<p>If this is the reconciliation gate, the source file no longer matches the S4 ` +
        `verification print and a ruling is needed before adoption — that is the gate doing ` +
        `its job. If it is a fetch error, the next server boot retries automatically.</p>`
    ).catch(() => {});
  } finally {
    stopHeartbeat();
  }
}
