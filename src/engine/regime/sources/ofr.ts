/**
 * FundLens v8 — Regime Harness: OFR adapter (A1 Task 4)
 *
 * OFR Financial Stress Index — daily CSV, full history to Jan 2000,
 * republished in full every business day with data current through
 * ~2 business days prior (Record 01 §6.5; charter §5).
 *
 * FORMAT VERIFIED July 6, 2026 from an operator-downloaded fsi.csv
 * (6,706 daily rows, 2000-01-03 → 2026-07-02): header
 *   Date,OFR FSI,Credit,Equity valuation,Safe assets,Funding,Volatility,
 *   United States,Other advanced economies,Emerging markets
 * A1 ingests the headline column only; category/regional subindexes are a
 * Stage 3 decision (registry rows by flag, never schema).
 *
 * Vintage policy: snapshot_custom (charter §4.2·6). The publisher reissues
 * the WHOLE history daily, so past values can change silently inside the
 * file — every fetch is a dated snapshot, and ingest (Task 6) compares
 * against held vintages: a changed value becomes a new vintage row stamped
 * with the snapshot date; an unchanged value inserts nothing.
 *
 * URL: best-known address, corroborated by the operator's download naming
 * (fsi.csv). Proven by the first Railway sweep (A1 acceptance item 3);
 * a wrong address fails loudly through the Task 7 ingest-failure alert.
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

const OFR_FSI_CSV_URL =
  'https://www.financialresearch.gov/financial-stress-index/data/fsi.csv';

/** Header label of the headline index column (verified July 6, 2026) */
const OFR_HEADLINE_COLUMN = 'OFR FSI';

// ─── Parsing (exported for the offline self-test against the real file) ─────

/**
 * Parse the OFR FSI CSV into normalized observations. Every row carries
 * realtime_start = snapshotDate: under snapshot_custom policy the vintage
 * date is the day WE saw the value, and ingest dedupes by value comparison.
 */
export function parseOfrFsiCsv(
  csv: string,
  snapshotDate: string
): RegimeNormalizedObservation[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('OFR FSI CSV: no data rows — format may have changed');
  }

  const header = lines[0].split(',').map(h => h.trim());
  const dateIdx = 0;
  const valueIdx = header.indexOf(OFR_HEADLINE_COLUMN);
  if (valueIdx === -1) {
    throw new Error(
      `OFR FSI CSV: headline column "${OFR_HEADLINE_COLUMN}" not found in header [${header.join(', ')}] — format changed`
    );
  }

  const out: RegimeNormalizedObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const obsDate = cols[dateIdx]?.trim();
    const raw = cols[valueIdx]?.trim();
    if (!obsDate || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ obs_date: obsDate, value, realtime_start: snapshotDate });
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch today's full-history snapshot of the OFR FSI headline index.
 * @param snapshotDate ISO date stamped as realtime_start on every row —
 *        the sweep passes its own run date (A1 Task 6)
 */
export async function fetchOfrFsi(
  snapshotDate: string
): Promise<RegimeNormalizedObservation[]> {
  const res = await fetch(OFR_FSI_CSV_URL);
  if (!res.ok) {
    throw new Error(`OFR FSI fetch returned ${res.status} from ${OFR_FSI_CSV_URL}`);
  }
  const text = await res.text();
  return parseOfrFsiCsv(text, snapshotDate);
}
