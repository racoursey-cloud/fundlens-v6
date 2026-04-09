/**
 * FundLens v6 — Tiingo API Client
 *
 * Thin wrapper around Tiingo's API for fund NAV prices (spec §4.1, §4.6):
 *
 *   **Fund NAV prices** (split-adjusted, back to 1970s) — primary source for
 *   momentum calculations. FMP is the fallback for prices.
 *
 * Fee data note: Tiingo's fee endpoint (/tiingo/fundamentals/fees/{ticker})
 * returns 404 — it does not exist. Fee data (12b-1, loads) now comes from
 * **Finnhub** (fetchFinnhubExpenseRatio in finnhub.ts). The NormalizedFeeData
 * interface is kept here as the shared type for cost-efficiency scoring.
 *
 * Key constraints (spec §5.3, §5.6):
 *   - Env var is TINNGO_KEY (intentional typo per §5.6 — NEVER correct)
 *   - All API calls have 500ms delays between sequential requests (PIPELINE.API_CALL_DELAY_MS)
 *   - Follows same patterns as fmp.ts: thin wrapper, typed responses, delay-aware
 *
 * Session 3 deliverable. Updated Session 5 (removed dead fee code).
 * References: Spec §4.1, §4.6, §5.3, §5.6.
 */

import { TIINGO, PIPELINE } from './constants.js';
import { delay } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Single day's price/NAV from Tiingo daily endpoint */
export interface TiingoDailyPrice {
  /** ISO date string (e.g. "2024-01-15T00:00:00+00:00") */
  date: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  /** Split/distribution-adjusted close — preferred for momentum */
  adjClose: number;
  adjHigh: number;
  adjLow: number;
  adjOpen: number;
  adjVolume: number;
  /** Cash dividends on this date */
  divCash: number;
  /** Split factor on this date */
  splitFactor: number;
}

/**
 * Normalized fee data passed to cost-efficiency scoring.
 * This is the shape that scoreCostEfficiency expects.
 */
export interface NormalizedFeeData {
  /** Net expense ratio as decimal (e.g. 0.0085 = 0.85%) */
  expenseRatio: number | null;
  /** 12b-1 fee as decimal (e.g. 0.0025 = 0.25%) */
  twelveb1Fee: number | null;
  /** Front-end load as decimal */
  frontLoad: number | null;
  /** Back-end load as decimal */
  backLoad: number | null;
  /** Source of the data */
  source: 'tiingo' | 'finnhub' | 'edgar' | 'supabase' | 'unknown';
}

// ─── API Client ─────────────────────────────────────────────────────────────

/**
 * Core fetch function for all Tiingo requests.
 * Uses TINNGO_KEY env var (intentional typo per spec §5.6).
 */
async function tiingoFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  // §5.6: Env var is TINNGO_KEY — intentional typo, do NOT correct
  const token = process.env.TINNGO_KEY;
  if (!token) {
    console.warn('[tiingo] TINNGO_KEY not set — Tiingo calls will fail');
    return null;
  }

  const url = new URL(`${TIINGO.BASE_URL}${path}`);
  url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      // Ticker not found on Tiingo — not an error, just no data
      console.log(`[tiingo] 404 for ${path} — ticker not found`);
      return null;
    }

    if (response.status === 429) {
      console.warn(`[tiingo] Rate limited (429) on ${path} — retrying after 10s`);
      await delay(10_000);
      // Retry once instead of giving up immediately
      const retryResponse = await fetch(url.toString(), {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!retryResponse.ok) {
        console.warn(`[tiingo] Retry also failed (${retryResponse.status}) on ${path}`);
        return null;
      }
      const retryData = await retryResponse.json();
      if (Array.isArray(retryData) && retryData.length === 0) return null;
      return retryData as T;
    }

    if (!response.ok) {
      console.error(`[tiingo] HTTP ${response.status} from ${path}`);
      return null;
    }

    const data = await response.json();

    // Tiingo returns empty arrays for no-data scenarios
    if (Array.isArray(data) && data.length === 0) {
      return null;
    }

    return data as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tiingo] Fetch error for ${path}: ${msg}`);
    return null;
  }
}

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Fetch historical daily NAV prices for a mutual fund.
 *
 * This is the PRIMARY source for momentum calculations (spec §4.6).
 * Returns split/distribution-adjusted prices.
 *
 * @param ticker Fund ticker (e.g. "VFINX", "FXAIX")
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @returns Array of daily prices, most recent last. Null if unavailable.
 */
export async function fetchTiingoPrices(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<TiingoDailyPrice[] | null> {
  const path = `${TIINGO.ENDPOINTS.DAILY_PRICES}/${encodeURIComponent(ticker)}/prices`;
  const data = await tiingoFetch<TiingoDailyPrice[]>(path, {
    startDate,
    endDate,
    resampleFreq: 'daily',
  });

  return data;
}

/**
 * Convert Tiingo prices to FMP-compatible format for use in momentum.ts.
 *
 * momentum.ts expects FmpDailyPrice[] — this adapter converts Tiingo's
 * response to that shape so momentum calculation code doesn't need changes
 * for the data source switch.
 *
 * @param tiingoPrices Prices from fetchTiingoPrices()
 * @returns Prices in FmpDailyPrice-compatible format (sorted most-recent-first)
 */
export function convertTiingoPricesToFmpFormat(
  tiingoPrices: TiingoDailyPrice[]
): Array<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
}> {
  // Tiingo returns dates in ISO format with timezone; extract YYYY-MM-DD
  // Tiingo returns most recent last; FMP returns most recent first
  return tiingoPrices
    .map(p => ({
      date: p.date.split('T')[0],
      open: p.adjOpen ?? p.open,
      high: p.adjHigh ?? p.high,
      low: p.adjLow ?? p.low,
      close: p.adjClose ?? p.close,
      adjClose: p.adjClose ?? p.close,
      volume: p.adjVolume ?? p.volume,
      unadjustedVolume: p.volume,
      change: 0,       // Not provided by Tiingo — computed downstream if needed
      changePercent: 0, // Not provided by Tiingo
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

