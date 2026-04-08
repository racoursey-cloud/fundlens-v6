/**
 * FundLens v6 — Supabase Cache Layer
 *
 * Batch cache read/write helpers for pipeline data that changes infrequently.
 * Every function routes through supaFetch() — no direct Supabase calls.
 *
 * Cache tables and TTLs:
 *   fundamentals_cache       → 7 days  (fundamentals change quarterly)
 *   sector_classifications   → 15 days (sector classifications are stable)
 *
 * Session 10 deliverable (MISSING-13: pipeline performance).
 * Pattern ported from v5.1's src/services/cache.js.
 *
 * The first pipeline run after table creation will have 100% cache misses
 * (cold start). Subsequent runs within TTL hit Supabase instead of external
 * APIs, eliminating ~80-90% of FMP and Claude calls.
 */

import { supaFetch } from './supabase.js';
import { PIPELINE } from './constants.js';
import { FmpRatios, FmpKeyMetrics } from './fmp.js';

// ─── TTL Helpers ───────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function isStale(isoString: string | null, ttlDays: number): boolean {
  if (!isoString) return true;
  return new Date(isoString).getTime() < Date.now() - ttlDays * MS_PER_DAY;
}

/**
 * Build a PostgREST IN() filter value.
 * URL-encodes each key individually so special characters don't break the query.
 */
function inList(keys: string[]): string {
  return keys.map(k => `"${encodeURIComponent(k)}"`).join(',');
}

// ─── Fundamentals Cache ────────────────────────────────────────────────────
// Table: fundamentals_cache
// Columns: ticker (PK), ratios (JSONB), key_metrics (JSONB), cached_at (timestamptz)
// TTL: 7 days (PIPELINE.FUNDAMENTALS_CACHE_TTL_DAYS)

export interface CachedFundamentals {
  ratios: FmpRatios | null;
  keyMetrics: FmpKeyMetrics | null;
}

/**
 * Batch-read cached fundamentals for a list of tickers.
 * Returns a Map of ticker → { ratios, keyMetrics } for all fresh entries.
 * Stale entries (older than TTL) are excluded.
 *
 * Batches in groups of 100 to avoid PostgREST URL length limits.
 */
export async function getCachedFundamentals(
  tickers: string[]
): Promise<Map<string, CachedFundamentals>> {
  const result = new Map<string, CachedFundamentals>();
  if (!tickers || tickers.length === 0) return result;

  const ttl = PIPELINE.FUNDAMENTALS_CACHE_TTL_DAYS;

  for (let i = 0; i < tickers.length; i += 100) {
    const batch = tickers.slice(i, i + 100);

    try {
      const { data, error } = await supaFetch<Array<{
        ticker: string;
        ratios: FmpRatios | null;
        key_metrics: FmpKeyMetrics | null;
        cached_at: string;
      }>>('fundamentals_cache', {
        params: {
          ticker: `in.(${inList(batch)})`,
          select: 'ticker,ratios,key_metrics,cached_at',
        },
      });

      if (error) {
        console.warn(`[cache] fundamentals_cache read error: ${error}`);
        continue;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          if (!isStale(row.cached_at, ttl)) {
            result.set(row.ticker, {
              ratios: row.ratios,
              keyMetrics: row.key_metrics,
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cache] fundamentals_cache read failed: ${msg}`);
      // Non-fatal — we'll fetch from FMP instead
    }
  }

  return result;
}

/**
 * Batch-write fundamentals to the cache.
 * Uses upsert (ON CONFLICT ticker) so re-runs refresh the cached_at timestamp.
 *
 * @param entries Map of ticker → { ratios, keyMetrics }
 */
export async function saveCachedFundamentals(
  entries: Map<string, CachedFundamentals>
): Promise<void> {
  if (entries.size === 0) return;

  const now = new Date().toISOString();
  const rows = Array.from(entries.entries()).map(([ticker, data]) => ({
    ticker,
    ratios: data.ratios,
    key_metrics: data.keyMetrics,
    cached_at: now,
  }));

  // Batch upsert in groups of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    try {
      const { error } = await supaFetch('fundamentals_cache', {
        method: 'POST',
        body: batch,
        upsert: true,
      });

      if (error) {
        console.warn(`[cache] fundamentals_cache write error: ${error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cache] fundamentals_cache write failed: ${msg}`);
      // Non-fatal — data is still in memory for this run
    }
  }
}

// ─── Sector Classifications Cache ──────────────────────────────────────────
// Table: sector_classifications
// Columns: holding_name (PK), sector (text), confidence (text), cached_at (timestamptz)
// TTL: 15 days (PIPELINE.SECTOR_CACHE_TTL_DAYS)

/**
 * Batch-read cached sector classifications for a list of holding names.
 * Returns a Map of holdingName → sector for all fresh entries.
 *
 * Holding names are URL-encoded individually before being placed in the
 * PostgREST IN() filter. Names containing &, (, ), /, etc. would otherwise
 * break the query string. (Lesson learned from v5.1 A13.)
 *
 * Batches in groups of 50 to avoid URL length limits.
 */
export async function getCachedSectors(
  holdingNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!holdingNames || holdingNames.length === 0) return result;

  const ttl = PIPELINE.SECTOR_CACHE_TTL_DAYS;

  for (let i = 0; i < holdingNames.length; i += 50) {
    const batch = holdingNames.slice(i, i + 50);
    const filterList = inList(batch);

    try {
      const { data, error } = await supaFetch<Array<{
        holding_name: string;
        sector: string;
        cached_at: string;
      }>>('sector_classifications', {
        params: {
          holding_name: `in.(${filterList})`,
          select: 'holding_name,sector,cached_at',
        },
      });

      if (error) {
        console.warn(`[cache] sector_classifications read error: ${error}`);
        continue;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          if (!isStale(row.cached_at, ttl) && row.sector) {
            result.set(row.holding_name, row.sector);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cache] sector_classifications read failed: ${msg}`);
      // Non-fatal — we'll classify via Claude instead
    }
  }

  return result;
}

/**
 * Batch-write sector classifications to the cache.
 * Uses upsert (ON CONFLICT holding_name) so re-classifications refresh the timestamp.
 *
 * @param classifications Array of { holdingName, sector }
 */
export async function saveCachedSectors(
  classifications: Array<{ holdingName: string; sector: string }>
): Promise<void> {
  if (!classifications || classifications.length === 0) return;

  const now = new Date().toISOString();
  const rows = classifications.map(c => ({
    holding_name: c.holdingName,
    sector: c.sector,
    confidence: 'claude',
    cached_at: now,
  }));

  // Batch upsert in groups of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    try {
      const { error } = await supaFetch('sector_classifications', {
        method: 'POST',
        body: batch,
        upsert: true,
      });

      if (error) {
        console.warn(`[cache] sector_classifications write error: ${error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cache] sector_classifications write failed: ${msg}`);
    }
  }
}
