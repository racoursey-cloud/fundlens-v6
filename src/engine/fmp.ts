/**
 * FundLens v6 — FMP API Client
 *
 * Thin wrapper around Financial Modeling Prep's /stable/ API endpoints.
 * Every function enforces sequential calls with delays (PIPELINE.API_CALL_DELAY_MS)
 * to stay within Starter plan rate limits.
 *
 * FMP Starter ($19/mo) provides:
 *   - Company profiles, quotes
 *   - Income statements, balance sheets, cash flow statements
 *   - Financial ratios, key metrics
 *   - Historical daily prices (EOD)
 *   - Stock news with sentiment
 *   - Search by name
 *
 * NOT available on Starter (requires Professional):
 *   - /stable/etf/holdings (we use EDGAR instead)
 *
 * All endpoints migrated to /stable/ after August 31, 2025.
 * The old /api/v3/ returns "Legacy Endpoint" errors.
 *
 * Session 3 deliverable. References: Master Reference §5, §8 steps 4, 8.
 */

import { FMP, PIPELINE } from './constants.js';
import { delay } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Company profile from FMP /stable/profile */
export interface FmpProfile {
  symbol: string;
  companyName: string;
  currency: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  sector: string;
  country: string;
  description: string;
  cik: string;
  cusip: string;
  isFund: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
  mktCap: number;
  price: number;
}

/** Real-time quote from FMP /stable/quote */
export interface FmpQuote {
  symbol: string;
  price: number;
  changesPercentage: number;
  dayLow: number;
  dayHigh: number;
  yearLow: number;
  yearHigh: number;
  priceAvg50: number;
  priceAvg200: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  pe: number;
  eps: number;
}

/** Single period from income statement, balance sheet, or cash flow */
export interface FmpFinancialPeriod {
  date: string;
  symbol: string;
  period: string;
  [key: string]: string | number | null;
}

/** Financial ratios from FMP /stable/ratios */
export interface FmpRatios {
  date: string;
  symbol: string;
  period: string;
  // Profitability
  grossProfitMargin: number | null;
  operatingProfitMargin: number | null;
  netProfitMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnCapitalEmployed: number | null;
  // Liquidity
  currentRatio: number | null;
  quickRatio: number | null;
  cashRatio: number | null;
  // Leverage
  debtEquityRatio: number | null;
  debtRatio: number | null;
  interestCoverage: number | null;
  // Efficiency
  assetTurnover: number | null;
  inventoryTurnover: number | null;
  receivablesTurnover: number | null;
  // Valuation
  priceEarningsRatio: number | null;
  priceToBookRatio: number | null;
  priceToSalesRatio: number | null;
  enterpriseValueMultiple: number | null;
  priceCashFlowRatio: number | null;
  // Cash flow
  operatingCashFlowPerShare: number | null;
  freeCashFlowPerShare: number | null;
  cashPerShare: number | null;
  // Dividends
  dividendYield: number | null;
  payoutRatio: number | null;
  // Catch-all for additional ratios
  [key: string]: string | number | null;
}

/** Key metrics from FMP /stable/key-metrics */
export interface FmpKeyMetrics {
  date: string;
  symbol: string;
  period: string;
  revenuePerShare: number | null;
  netIncomePerShare: number | null;
  operatingCashFlowPerShare: number | null;
  freeCashFlowPerShare: number | null;
  cashPerShare: number | null;
  bookValuePerShare: number | null;
  tangibleBookValuePerShare: number | null;
  shareholdersEquityPerShare: number | null;
  interestDebtPerShare: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  peRatio: number | null;
  pocfratio: number | null;
  pfcfRatio: number | null;
  pbRatio: number | null;
  ptbRatio: number | null;
  evToSales: number | null;
  enterpriseValueOverEBITDA: number | null;
  evToOperatingCashFlow: number | null;
  evToFreeCashFlow: number | null;
  earningsYield: number | null;
  freeCashFlowYield: number | null;
  debtToEquity: number | null;
  debtToAssets: number | null;
  netDebtToEBITDA: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  incomeQuality: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  roic: number | null;
  roe: number | null;
  capexPerShare: number | null;
  [key: string]: string | number | null;
}

/** Single day's price from FMP /stable/historical-price-eod */
export interface FmpDailyPrice {
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
}

/** Historical price response wrapper */
export interface FmpHistoricalPrices {
  symbol: string;
  historical: FmpDailyPrice[];
}

// ─── API Client ─────────────────────────────────────────────────────────────

/**
 * Core fetch function. All FMP requests go through here.
 * Appends the API key and handles errors consistently.
 */
async function fmpFetch<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error('FMP_API_KEY environment variable is not set');
  }

  const url = new URL(`${FMP.BASE_URL}${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.error(
      `[fmp] HTTP ${response.status} from ${endpoint} (${url.searchParams.get('symbol') || ''})`
    );
    return null;
  }

  const data = await response.json();

  // FMP returns empty arrays for not-found symbols
  if (Array.isArray(data) && data.length === 0) {
    return null;
  }

  return data as T;
}

// ─── Public Functions ───────────────────────────────────────────────────────

/** Fetch company profile. Returns first result or null. */
export async function fetchProfile(symbol: string): Promise<FmpProfile | null> {
  const data = await fmpFetch<FmpProfile[]>(FMP.ENDPOINTS.PROFILE, { symbol });
  return data?.[0] || null;
}

/** Fetch real-time quote. Returns first result or null. */
export async function fetchQuote(symbol: string): Promise<FmpQuote | null> {
  const data = await fmpFetch<FmpQuote[]>(FMP.ENDPOINTS.QUOTE, { symbol });
  return data?.[0] || null;
}

/**
 * Fetch income statements. Returns most recent periods first.
 * @param period "annual" or "quarter" (default: annual)
 * @param limit Number of periods to return (default: 4)
 */
export async function fetchIncomeStatement(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4
): Promise<FmpFinancialPeriod[]> {
  const data = await fmpFetch<FmpFinancialPeriod[]>(
    FMP.ENDPOINTS.INCOME_STATEMENT,
    { symbol, period, limit: limit.toString() }
  );
  return data || [];
}

/**
 * Fetch balance sheet statements. Returns most recent periods first.
 */
export async function fetchBalanceSheet(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4
): Promise<FmpFinancialPeriod[]> {
  const data = await fmpFetch<FmpFinancialPeriod[]>(
    FMP.ENDPOINTS.BALANCE_SHEET,
    { symbol, period, limit: limit.toString() }
  );
  return data || [];
}

/**
 * Fetch cash flow statements. Returns most recent periods first.
 */
export async function fetchCashFlow(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4
): Promise<FmpFinancialPeriod[]> {
  const data = await fmpFetch<FmpFinancialPeriod[]>(
    FMP.ENDPOINTS.CASH_FLOW,
    { symbol, period, limit: limit.toString() }
  );
  return data || [];
}

/**
 * Fetch financial ratios. Returns most recent periods first.
 * This is the primary data source for Holdings Quality scoring.
 */
export async function fetchRatios(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4
): Promise<FmpRatios[]> {
  const data = await fmpFetch<FmpRatios[]>(
    FMP.ENDPOINTS.RATIOS,
    { symbol, period, limit: limit.toString() }
  );
  return data || [];
}

/**
 * Fetch key metrics. Supplements ratios with per-share and
 * enterprise value metrics.
 */
export async function fetchKeyMetrics(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4
): Promise<FmpKeyMetrics[]> {
  const data = await fmpFetch<FmpKeyMetrics[]>(
    FMP.ENDPOINTS.KEY_METRICS,
    { symbol, period, limit: limit.toString() }
  );
  return data || [];
}

/**
 * Fetch historical daily prices (EOD) for a symbol.
 * Used for Momentum factor calculation (3–12 month returns).
 *
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 */
export async function fetchHistoricalPrices(
  symbol: string,
  from: string,
  to: string
): Promise<FmpDailyPrice[]> {
  const data = await fmpFetch<FmpHistoricalPrices>(
    `${FMP.ENDPOINTS.HISTORICAL_PRICE}?symbol=${encodeURIComponent(symbol)}`,
    { from, to }
  );
  return data?.historical || [];
}

/**
 * Fetch fundamentals bundle for a single holding.
 * Returns ratios + key metrics in one call sequence (sequential, with delay).
 * This is what Holdings Quality scoring needs per holding.
 */
export async function fetchFundamentalsBundle(
  symbol: string
): Promise<{ ratios: FmpRatios | null; keyMetrics: FmpKeyMetrics | null }> {
  const ratios = await fetchRatios(symbol, 'annual', 1);
  await delay(PIPELINE.API_CALL_DELAY_MS);
  const keyMetrics = await fetchKeyMetrics(symbol, 'annual', 1);

  return {
    ratios: ratios[0] || null,
    keyMetrics: keyMetrics[0] || null,
  };
}

/**
 * Fetch the FULL raw profile for a mutual fund ticker.
 *
 * The typed FmpProfile interface only captures equity-relevant fields.
 * Mutual fund profiles from FMP may include additional fields like
 * `expenseRatio`, `netExpenseRatio`, `category`, etc. that aren't
 * in our TypeScript type.
 *
 * This function returns the raw JSON object so callers can extract
 * whatever fields FMP provides for a given ticker.
 *
 * @param symbol Fund ticker (e.g. "FXAIX")
 * @returns Raw profile object, or null if unavailable
 */
export async function fetchRawProfile(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const data = await fmpFetch<Record<string, unknown>[]>(FMP.ENDPOINTS.PROFILE, { symbol });
  return data?.[0] || null;
}

/**
 * Fetch ETF/fund info from FMP's dedicated endpoint.
 *
 * FMP's /etf-info endpoint works for both ETFs and mutual funds and
 * typically includes expense ratio data. This is our primary source
 * for automated expense ratio population.
 *
 * @param symbol Fund ticker (e.g. "FXAIX")
 * @returns Raw info object, or null if unavailable
 */
export async function fetchFundInfo(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const data = await fmpFetch<Record<string, unknown>[]>('/etf-info', { symbol });
  return data?.[0] || null;
}

/**
 * Extract expense ratio from raw FMP data.
 *
 * Tries multiple field name conventions that FMP uses across its
 * different endpoints for mutual funds and ETFs.
 *
 * @param data Raw JSON from fetchRawProfile or fetchFundInfo
 * @returns Expense ratio as decimal (e.g. 0.0015 for 0.15%), or null
 */
export function extractExpenseRatio(data: Record<string, unknown>): number | null {
  const candidates = [
    'expenseRatio', 'netExpenseRatio', 'expense_ratio',
    'annualHoldingsTurnover', 'totalExpenseRatio',
    'netExpRatio', 'grossExpenseRatio',
  ];

  for (const key of candidates) {
    const val = data[key];
    if (typeof val === 'number' && !isNaN(val) && val > 0 && val < 1) {
      return val;
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Search FMP by name. Useful for resolving sub-fund tickers
 * (the fund-of-funds look-through from Session 2).
 */
export async function searchByName(
  query: string,
  limit = 5
): Promise<Array<{ symbol: string; name: string; exchangeShortName: string }>> {
  const data = await fmpFetch<Array<{ symbol: string; name: string; exchangeShortName: string }>>(
    FMP.ENDPOINTS.SEARCH,
    { query, limit: limit.toString() }
  );
  return data || [];
}
