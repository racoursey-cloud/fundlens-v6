/**
 * FundLens v8 — Regime Harness: Cboe adapter (A1 Task 4)
 *
 * VIX full-history public file — backfill/backstop duty ONLY (charter §5:
 * "belt and suspenders" behind FRED's VIXCLS, which is the live rail).
 * Never called by the daily sweep; used by the Task 9 backfill and as the
 * designated fallback if VIXCLS ever goes dark.
 *
 * Expected format (Cboe public index file, 1990-present, updated daily):
 *   DATE,OPEN,HIGH,LOW,CLOSE  with M/D/YYYY dates.
 * The parser locates DATE and CLOSE by header name and tolerates extra
 * columns. Address proven at first backfill use (S4 gate); a wrong address
 * fails loudly, never silently.
 *
 * Vintage policy: never_revised — a daily close is final at publication,
 * so realtime_start = obs_date. The Task 7 never-revised watch guards the
 * claim on the FRED rail; this file is the cross-check.
 */

import type { RegimeNormalizedObservation } from '../../types.js';

// ─── Constants (regime-module-local per A1 §6) ──────────────────────────────

const CBOE_VIX_HISTORY_URL =
  'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';

// ─── Parsing (exported for offline self-testing) ────────────────────────────

/** Convert M/D/YYYY (Cboe) to ISO YYYY-MM-DD; returns null on mismatch */
export function cboeDateToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

export function parseCboeVixCsv(csv: string): RegimeNormalizedObservation[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Cboe VIX CSV: no data rows — format may have changed');
  }

  const header = lines[0].split(',').map(h => h.trim().toUpperCase());
  const dateIdx = header.indexOf('DATE');
  const closeIdx = header.indexOf('CLOSE');
  if (dateIdx === -1 || closeIdx === -1) {
    throw new Error(
      `Cboe VIX CSV: DATE/CLOSE columns not found in header [${header.join(', ')}] — format changed`
    );
  }

  const out: RegimeNormalizedObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const isoDate = cboeDateToIso(cols[dateIdx] ?? '');
    const raw = cols[closeIdx]?.trim();
    if (!isoDate || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    // never_revised: the close is final the day it prints
    out.push({ obs_date: isoDate, value, realtime_start: isoDate });
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Fetch the full VIX daily-close history (backfill/backstop duty only) */
export async function fetchCboeVixHistory(): Promise<RegimeNormalizedObservation[]> {
  const res = await fetch(CBOE_VIX_HISTORY_URL);
  if (!res.ok) {
    throw new Error(`Cboe VIX fetch returned ${res.status} from ${CBOE_VIX_HISTORY_URL}`);
  }
  const text = await res.text();
  return parseCboeVixCsv(text);
}
