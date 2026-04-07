/**
 * FundLens v6 — Tiingo API Client
 *
 * Thin wrapper around Tiingo's API for two purposes (spec §4.1, §4.6):
 *
 *   1. **Fund NAV prices** (split-adjusted, back to 1970s) — primary source for
 *      momentum calculations. FMP is the fallback for prices.
 *
 *   2. **Fund fee data** (net/gross expense ratio, 12b-1 fees, load fees, all fee
 *      components) — primary source for enhanced cost-efficiency scoring.
 *
 * Key constraints (spec §5.3, §5.6):
 *   - Env var is TINNGO_KEY (intentional typo per §5.6 — NEVER correct)
 *   - All API calls have 500ms delays between sequential requests (PIPELINE.API_CALL_DELAY_MS)
 *   - Follows same patterns as fmp.ts: thin wrapper, typed responses, delay-aware
 *
 * Session 3 deliverable. References: Spec §4.1, §4.6, §5.3, §5.6.
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

/** Tiingo fund metadata — returned by the daily metadata endpoint */
export interface TiingoFundMeta {
  ticker: string;
  name: string;
  exchangeCode: string;
  startDate: string;
  endDate: string;
  description: string;
}

/**
 * Fee data from Tiingo's fund fee endpoint.
 *
 * Tiingo provides granular fee breakdowns for 34,000+ mutual funds and ETFs.
 * Field names follow Tiingo's API response schema.
 *
 * NOTE: If the Tiingo fee endpoint returns a different shape than documented
 * here, update this interface and the normalization in fetchFundFees().
 */
export interface TiingoFundFees {
  ticker: string;
  /** Net expense ratio (decimal, e.g. 0.0045 = 0.45%) */
  netExpenseRatio: number | null;
  /** Gross expense ratio before waivers (decimal) */
  grossExpenseRatio: number | null;
  /** 12b-1 marketing/distribution fee (decimal, e.g. 0.0025 = 0.25%) */
  twelveb1Fee: number | null;
  /** Front-end sales load (decimal) */
  frontLoad: number | null;
  /** Back-end / deferred sales load (decimal) */
  backLoad: number | null;
  /** Redemption fee (decimal) */
  redemptionFee: number | null;
  /** Other fund operating expenses (decimal) */
  otherExpenses: number | null;
  /** Management fee component (decimal) */
  managementFee: number | null;
  /** Whether fee data was successfully retrieved */
  hasData: boolean;
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
      console.warn(`[tiingo] Rate limited (429) on ${path} — backing off`);
      await delay(10_000);
      return null;
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
 * Fetch fund metadata from Tiingo.
 * Useful for verifying a ticker exists and getting date range.
 *
 * @param ticker Fund ticker
 */
export async function fetchTiingoMeta(
  ticker: string
): Promise<TiingoFundMeta | null> {
  const path = `${TIINGO.ENDPOINTS.FUND_META}/${encodeURIComponent(ticker)}`;
  return tiingoFetch<TiingoFundMeta>(path);
}

/**
 * Fetch fund fee data from Tiingo.
 *
 * This is the PRIMARY source for expense data used in cost-efficiency
 * scoring (spec §4.6). Provides granular breakdowns: net/gross expense
 * ratio, 12b-1 marketing fees, load fees, and other fee components.
 *
 * If the dedicated fee endpoint is not available or returns no data,
 * the pipeline falls back to EDGAR NPORT-P expense data, then Supabase.
 *
 * @param ticker Fund ticker (e.g. "VFINX")
 * @returns Structured fee data, or null if unavailable
 */
export async function fetchFundFees(
  ticker: string
): Promise<TiingoFundFees | null> {
  // Try the dedicated fee endpoint first
  const feePath = `${TIINGO.ENDPOINTS.FUND_FEES}/${encodeURIComponent(ticker)}`;
  const feeData = await tiingoFetch<Record<string, unknown>>(feePath);

  if (feeData && typeof feeData === 'object') {
    return normalizeFeeResponse(ticker, feeData);
  }

  // If dedicated endpoint fails, try metadata endpoint which sometimes
  // includes basic fee info for mutual funds
  const metaPath = `${TIINGO.ENDPOINTS.FUND_META}/${encodeURIComponent(ticker)}`;
  const metaData = await tiingoFetch<Record<string, unknown>>(metaPath);

  if (metaData && typeof metaData === 'object') {
    // Check if metadata contains any fee fields
    const hasFeeFields = ['netExpenseRatio', 'expenseRatio', 'fee12b1',
      'twelveb1Fee', 'managementFee'].some(key => key in metaData);

    if (hasFeeFields) {
      return normalizeFeeResponse(ticker, metaData);
    }
  }

  return null;
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

/**
 * Normalize the fee data from Tiingo into our NormalizedFeeData shape.
 *
 * Tiingo's API response field names may vary — this handles multiple
 * possible field name conventions.
 */
export function normalizeFeeData(fees: TiingoFundFees): NormalizedFeeData {
  return {
    expenseRatio: fees.netExpenseRatio,
    twelveb1Fee: fees.twelveb1Fee,
    frontLoad: fees.frontLoad,
    backLoad: fees.backLoad,
    source: 'tiingo',
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Normalize a raw Tiingo fee response object into our typed TiingoFundFees.
 *
 * Tiingo may use different field naming conventions (camelCase, snake_case,
 * or abbreviated names). This function tries multiple field name variants.
 */
function normalizeFeeResponse(
  ticker: string,
  raw: Record<string, unknown>
): TiingoFundFees {
  const getNum = (...keys: string[]): number | null => {
    for (const key of keys) {
      const val = raw[key];
      if (typeof val === 'number' && !isNaN(val)) {
        return val;
      }
      // Some fields come as strings that parse to numbers
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return null;
  };

  // Try multiple field name conventions that Tiingo might use
  const netExpenseRatio = getNum(
    'netExpenseRatio', 'net_expense_ratio', 'expenseRatio', 'expense_ratio',
    'netExpRatio', 'annualReportExpenseRatio'
  );
  const grossExpenseRatio = getNum(
    'grossExpenseRatio', 'gross_expense_ratio', 'grossExpRatio'
  );
  const twelveb1Fee = getNum(
    'twelveb1Fee', 'twelve_b1_fee', 'fee12b1', '12b1Fee',
    'marketingFee', 'marketing_fee', 'distributionFee', 'distribution_fee'
  );
  const frontLoad = getNum(
    'frontLoad', 'front_load', 'frontEndLoad', 'front_end_load',
    'maxFrontLoad', 'maxFrontEndLoad'
  );
  const backLoad = getNum(
    'backLoad', 'back_load', 'backEndLoad', 'back_end_load',
    'deferredLoad', 'deferred_load', 'maxBackLoad', 'maxDeferredLoad'
  );
  const redemptionFee = getNum(
    'redemptionFee', 'redemption_fee', 'maxRedemptionFee'
  );
  const otherExpenses = getNum(
    'otherExpenses', 'other_expenses', 'otherFundExpenses'
  );
  const managementFee = getNum(
    'managementFee', 'management_fee', 'advisorFee', 'advisor_fee'
  );

  const hasData = netExpenseRatio !== null || grossExpenseRatio !== null ||
    twelveb1Fee !== null || frontLoad !== null;

  return {
    ticker,
    netExpenseRatio,
    grossExpenseRatio,
    twelveb1Fee,
    frontLoad,
    backLoad,
    redemptionFee,
    otherExpenses,
    managementFee,
    hasData,
  };
}
