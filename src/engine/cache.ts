/**
 * FundLens v6 — Cache Service
 *
 * Ported from v5.1's cache.js. This is the single biggest performance lever
 * in the pipeline. By caching API responses in Supabase with TTLs, subsequent
 * pipeline runs skip redundant external API calls.
 *
 * TTL summary:
 *   fmp_cache              → 7 days   (fundamentals change quarterly at most)
 *   tiingo_price_cache     → 1 day    (prices stale after market close)
 *   finnhub_fee_cache      → 90 days  (fee structures rarely change)
 *   sector_classifications → 15 days  (sector labels stable)
 *
 * Key design pattern (from v5.1):
 *   Before each API loop in pipeline.ts, batch-query the cache for ALL tickers
 *   in a single Supabase call. Only hit external APIs for cache misses.
 *   This collapses N sequential API calls to 1 Supabase query + M cache misses.
 *
 * All functions route through the existing supaFetch() from supabase.ts.
 *
 * Session 10 deliverable. References: Spec §9.3 MISSING-13.
 */

import { supaFetch } from './supabase.js';
import { FmpRatios, FmpKeyMetrics } from './fmp.js';
import { TiingoDailyPrice } from './tiingo.js';

// ─── TTL Constants ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Check if an ISO timestamp is older than the given number of days */
function isStale(isoString: string | null | undefined, days: number): boolean {
  if (!isoString) return true;
  return new Date(isoString).getTime() < (Date.now() - days * MS_PER_DAY);
}

/** Build PostgREST IN filter: ticker=in.("FXAIX","VFIAX") */
function inList(items: string[]): string {
  return items.map(t => `"${t}"`).join(',');
}

// ─── FMP Fundamentals Cache (7-day TTL) ────────────────────────────────────

export interface FmpCacheEntry {
  ratios: FmpRatios | null;
  keyMetrics: FmpKeyMetrics | null;
}

/**
 * Batch-fetch cached FMP fundamentals for multiple tickers.
 * Returns a map of ticker → { ratios, keyMetrics } for cache hits only.
 * Stale entries (>7 days) are excluded.
 */
export async function getFmpCache(
  tickers: string[]
): Promise<Map<string, FmpCacheEntry>> {
  const result = new Map<string, FmpCacheEntry>();
  if (!tickers || tickers.length === 0) return result;

  // Batch in groups of 200 to keep PostgREST URL lengths reasonable
  for (let i = 0; i < tickers.length; i += 200) {
    const batch = tickers.slice(i, i + 200);
    const { data, error } = await supaFetch<Array<{
      ticker: string;
      ratios: FmpRatios | null;
      key_metrics: FmpKeyMetrics | null;
      cached_at: string;
    }>>('fmp_cache', {
      params: {
        ticker: `in.(${inList(batch)})`,
        select: '*',
      },
    });

    if (error || !data) continue;

    for (const row of data) {
      if (isStale(row.cached_at, 7)) continue;
      result.set(row.ticker.toUpperCase(), {
        ratios: row.ratios,
        keyMetrics: row.key_metrics,
      });
    }
  }

  return result;
}

/**
 * Upsert a single ticker's FMP fundamentals into the cache.
 */
export async function saveFmpCache(
  ticker: string,
  ratios: FmpRatios | null,
  keyMetrics: FmpKeyMetrics | null
): Promise<void> {
  await supaFetch('fmp_cache', {
    method: 'POST',
    body: {
      ticker: ticker.toUpperCase(),
      ratios: ratios,
      key_metrics: keyMetrics,
      cached_at: new Date().toISOString(),
    },
    upsert: true,
  });
}

// ─── Tiingo Price Cache (1-day TTL) ────────────────────────────────────────

export interface TiingoPriceCacheEntry {
  prices: TiingoDailyPrice[];
}

/**
 * Batch-fetch cached Tiingo prices for multiple fund tickers.
 * Returns a map of ticker → prices array for cache hits only.
 * Stale entries (>1 day) are excluded.
 */
export async function getTiingoPriceCache(
  tickers: string[]
): Promise<Map<string, TiingoPriceCacheEntry>> {
  const result = new Map<string, TiingoPriceCacheEntry>();
  if (!tickers || tickers.length === 0) return result;

  for (let i = 0; i < tickers.length; i += 200) {
    const batch = tickers.slice(i, i + 200);
    const { data, error } = await supaFetch<Array<{
      ticker: string;
      prices: TiingoDailyPrice[];
      cached_at: string;
    }>>('tiingo_price_cache', {
      params: {
        ticker: `in.(${inList(batch)})`,
        select: '*',
      },
    });

    if (error || !data) continue;

    for (const row of data) {
      if (isStale(row.cached_at, 1)) continue;
      result.set(row.ticker.toUpperCase(), {
        prices: row.prices || [],
      });
    }
  }

  return result;
}

/**
 * Upsert a single ticker's Tiingo prices into the cache.
 */
export async function saveTiingoPriceCache(
  ticker: string,
  prices: TiingoDailyPrice[]
): Promise<void> {
  await supaFetch('tiingo_price_cache', {
    method: 'POST',
    body: {
      ticker: ticker.toUpperCase(),
      prices: prices,
      cached_at: new Date().toISOString(),
    },
    upsert: true,
  });
}

// ─── Finnhub Fee Cache (90-day TTL) ────────────────────────────────────────

export interface FinnhubFeeCacheEntry {
  expenseRatio: number | null;
  fee12b1: number | null;
  frontLoad: number | null;
  source: string;
}

/**
 * Batch-fetch cached Finnhub fee data for multiple fund tickers.
 * Returns a map of ticker → fee data for cache hits only.
 * Stale entries (>90 days) are excluded.
 */
export async function getFinnhubFeeCache(
  tickers: string[]
): Promise<Map<string, FinnhubFeeCacheEntry>> {
  const result = new Map<string, FinnhubFeeCacheEntry>();
  if (!tickers || tickers.length === 0) return result;

  const { data, error } = await supaFetch<Array<{
    ticker: string;
    expense_ratio: number | null;
    fee_12b1: number | null;
    front_load: number | null;
    source: string;
    cached_at: string;
  }>>('finnhub_fee_cache', {
    params: {
      ticker: `in.(${inList(tickers)})`,
      select: '*',
    },
  });

  if (error || !data) return result;

  for (const row of data) {
    if (isStale(row.cached_at, 90)) continue;
    result.set(row.ticker.toUpperCase(), {
      expenseRatio: row.expense_ratio,
      fee12b1: row.fee_12b1,
      frontLoad: row.front_load,
      source: row.source,
    });
  }

  return result;
}

/**
 * Upsert a single ticker's Finnhub fee data into the cache.
 */
export async function saveFinnhubFeeCache(
  ticker: string,
  data: FinnhubFeeCacheEntry
): Promise<void> {
  await supaFetch('finnhub_fee_cache', {
    method: 'POST',
    body: {
      ticker: ticker.toUpperCase(),
      expense_ratio: data.expenseRatio,
      fee_12b1: data.fee12b1,
      front_load: data.frontLoad,
      source: data.source,
      cached_at: new Date().toISOString(),
    },
    upsert: true,
  });
}

// ─── Sector Classifications Cache (15-day TTL) ────────────────────────────

/**
 * Batch-fetch cached sector classifications for multiple holding names.
 * Returns a map of holdingName → sector for cache hits only.
 * Stale entries (>15 days) are excluded.
 *
 * Holding names are URL-encoded for the PostgREST query to handle
 * special characters (commas, parentheses, etc.) in EDGAR holding names.
 */
export async function getSectorClassifications(
  holdingNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!holdingNames || holdingNames.length === 0) return result;

  // Batch in groups of 50 to keep URL lengths manageable
  // (holding names can be long and contain special chars)
  for (let i = 0; i < holdingNames.length; i += 50) {
    const batch = holdingNames.slice(i, i + 50);
    const { data, error } = await supaFetch<Array<{
      holding_name: string;
      sector: string;
      cached_at: string;
    }>>('sector_classifications', {
      params: {
        holding_name: `in.(${inList(batch)})`,
        select: '*',
      },
    });

    if (error || !data) continue;

    for (const row of data) {
      if (isStale(row.cached_at, 15)) continue;
      result.set(row.holding_name, row.sector);
    }
  }

  return result;
}

/**
 * Upsert a batch of sector classifications into the cache.
 * Inserts in groups of 50 to avoid PostgREST payload limits.
 */
export async function saveSectorClassifications(
  classifications: Array<{ holdingName: string; sector: string }>
): Promise<void> {
  if (!classifications || classifications.length === 0) return;

  const now = new Date().toISOString();
  const rows = classifications.map(c => ({
    holding_name: c.holdingName,
    sector: c.sector,
    cached_at: now,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    await supaFetch('sector_classifications', {
      method: 'POST',
      body: batch,
      upsert: true,
    });
  }
}
