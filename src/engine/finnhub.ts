/**
 * FundLens v6 — Finnhub API Client
 *
 * Fetches mutual fund expense ratios from Finnhub's mutual fund profile
 * endpoint. This is the PRIMARY source for expense ratio data, ported
 * from v5.1's expenses.js which used this endpoint successfully.
 *
 * Endpoint: GET https://finnhub.io/api/v1/mutual-fund/profile?symbol={ticker}
 * Returns: { name, category, expenseRatio, ... }
 *   - expenseRatio is a PERCENTAGE (e.g. 0.75 means 0.75%)
 *   - We convert to decimal (0.0075) for internal consistency
 *
 * Finnhub free tier: 60 calls/min. With Supabase caching (90-day TTL),
 * a 22-fund portfolio hits Finnhub at most once per fund per quarter.
 *
 * Lookup chain (matches v5.1):
 *   1. Finnhub mutual fund profile API (primary)
 *   2. FMP etf-info / profile (secondary)
 *   3. Static fallback map for known 401(k) funds (last resort)
 *
 * Session 4 deliverable. Ported from v5.1 src/engine/expenses.js.
 */

import { delay } from './types.js';
import { PIPELINE } from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Finnhub mutual fund profile response */
export interface FinnhubFundProfile {
  /** Fund name */
  name: string;
  /** Fund category (e.g. "Large Blend", "Intermediate Bond") */
  category: string;
  /** Expense ratio as PERCENTAGE (e.g. 0.75 = 0.75%). Convert to decimal! */
  expenseRatio: number;
  /** Benchmark index */
  benchmark: string;
  /** Net assets */
  navTotal: number;
  /** Fund inception date */
  inceptionDate: string;
}

/** Normalized expense data returned by fetchExpenseRatio() */
export interface ExpenseRatioResult {
  /** Net expense ratio as DECIMAL (e.g. 0.0075 = 0.75%) */
  expenseRatio: number;
  /** Source of the data */
  source: 'finnhub' | 'fmp' | 'static' | 'none';
  /** Finnhub category if available */
  category: string | null;
}

// ─── Finnhub API ────────────────────────────────────────────────────────────

/**
 * Fetch mutual fund expense ratio from Finnhub.
 *
 * @param ticker Fund ticker (e.g. "FXAIX")
 * @returns Expense ratio as decimal, or null if unavailable
 */
export async function fetchFinnhubExpenseRatio(
  ticker: string
): Promise<{ expenseRatio: number; category: string | null } | null> {
  const apiKey = process.env.FINNHUB_KEY;
  if (!apiKey) {
    console.warn('[finnhub] FINNHUB_KEY not set — expense ratio fetch will skip');
    return null;
  }

  const url = `https://finnhub.io/api/v1/mutual-fund/profile?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 429) {
      console.warn(`[finnhub] Rate limited (429) on ${ticker} — skipping`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[finnhub] HTTP ${response.status} for ${ticker}`);
      return null;
    }

    const data = await response.json();

    // Finnhub returns {} or { name: null } for unknown tickers
    if (!data || typeof data.expenseRatio !== 'number') {
      console.log(`[finnhub] No expense data for ${ticker}`);
      return null;
    }

    // Finnhub expenseRatio is a PERCENTAGE (e.g. 0.75 = 0.75%)
    // Convert to decimal (0.0075) for internal consistency
    const ratioDecimal = data.expenseRatio / 100;

    console.log(
      `[finnhub] ${ticker}: expenseRatio=${data.expenseRatio}% (${ratioDecimal}), ` +
      `category=${data.category || 'unknown'}`
    );

    return {
      expenseRatio: ratioDecimal,
      category: data.category || null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[finnhub] Fetch failed for ${ticker}: ${msg}`);
    return null;
  }
}

// ─── Static Fallback Map ────────────────────────────────────────────────────
// Known expense ratios for TerrAscend 401(k) funds.
// Source: fund prospectuses (public data). Values are NET expense ratio
// as decimal (e.g. 0.0015 = 0.15%). Used only when Finnhub and FMP miss.
// Ported from v5.1 expenses.js KNOWN_RATIOS map + TerrAscend additions.

export const KNOWN_EXPENSE_RATIOS: ReadonlyMap<string, number> = new Map([
  // Fidelity index
  ['FXAIX', 0.0002],   // Fidelity 500 Index Fund (0.015%)
  ['FSPGX', 0.0004],   // Fidelity Large Cap Growth Index Fund

  // Vanguard
  ['VFWAX', 0.0008],   // Vanguard FTSE All-World ex-US Index Admiral
  ['VWIGX', 0.0037],   // Vanguard International Growth Fund

  // Bond / Fixed Income
  ['MWTSX', 0.0037],   // MetWest Total Return Bond Plan Class
  ['CFSTX', 0.0068],   // Commerce Short Term Government Fund
  ['BGHIX', 0.0065],   // BlackRock High Yield Bond Fund I
  ['BPLBX', 0.0104],   // BlackRock Inflation Protected Bond K
  ['OIBIX', 0.0066],   // Invesco International Bond R6
  ['WFPRX', 0.0070],   // Western Asset Core Plus Bond R6

  // Domestic Equity (Active)
  ['VADFX', 0.0018],   // Victory Adaptive Allocation Fund
  ['HRAUX', 0.0066],   // Harbor Small Cap Growth Fund
  ['WEGRX', 0.0080],   // Westwood SmidCap Earnings Growth R6
  ['RTRIX', 0.0102],   // Neuberger Berman Real Estate Fund
  ['TGEPX', 0.0077],   // Thornburg Growth Equity Fund

  // International Equity
  ['RNWGX', 0.0057],   // American Funds New World Fund R-6
  ['QFVRX', 0.0094],   // Pear Tree Polaris Foreign Value R6
  ['DRRYX', 0.0087],   // Dodge & Cox International Stock Fund
  ['MADFX', 0.0090],   // Matrix Advisors Dividend Fund

  // Multi-Asset / Specialty
  ['PRPFX', 0.0081],   // Permanent Portfolio Fund

  // Money Market
  ['FDRXX', 0.0037],   // Fidelity Government Money Market
  ['ADAXX', 0.0052],   // Invesco Government Money Market A
]);

/**
 * Fetch expense ratio using the full v5.1-style lookup chain:
 *   1. Finnhub mutual fund profile (primary)
 *   2. FMP etf-info / raw profile (secondary)
 *   3. Static fallback map (last resort)
 *
 * @param ticker Fund ticker
 * @returns Expense ratio result with source attribution
 */
export async function fetchExpenseRatio(
  ticker: string
): Promise<ExpenseRatioResult> {
  // 1. Try Finnhub (primary — proven in v5.1)
  const finnhub = await fetchFinnhubExpenseRatio(ticker);
  if (finnhub) {
    return {
      expenseRatio: finnhub.expenseRatio,
      source: 'finnhub',
      category: finnhub.category,
    };
  }

  await delay(PIPELINE.API_CALL_DELAY_MS);

  // 2. Try FMP etf-info and profile (secondary)
  try {
    const { fetchFundInfo, fetchRawProfile, extractExpenseRatio } = await import('./fmp.js');

    const fundInfo = await fetchFundInfo(ticker);
    if (fundInfo) {
      const er = extractExpenseRatio(fundInfo);
      if (er) {
        return { expenseRatio: er, source: 'fmp', category: null };
      }
    }

    await delay(PIPELINE.API_CALL_DELAY_MS);

    const rawProfile = await fetchRawProfile(ticker);
    if (rawProfile) {
      const er = extractExpenseRatio(rawProfile);
      if (er) {
        return { expenseRatio: er, source: 'fmp', category: null };
      }
    }
  } catch (err) {
    // FMP not available — continue to static fallback
  }

  // 3. Static fallback map (last resort)
  const known = KNOWN_EXPENSE_RATIOS.get(ticker);
  if (known) {
    console.log(`[finnhub] ${ticker}: using static fallback (${known})`);
    return { expenseRatio: known, source: 'static', category: null };
  }

  // No data — cost scoring will use neutral (50)
  console.warn(`[finnhub] ${ticker}: no expense data from any source`);
  return { expenseRatio: 0, source: 'none', category: null };
}
