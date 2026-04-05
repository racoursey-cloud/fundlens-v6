/**
 * FundLens v6 — FMP CUSIP-to-Ticker Resolver
 *
 * Takes CUSIPs from EDGAR holdings and resolves them to stock tickers
 * via the FMP CUSIP API. Tickers are what FMP needs to fetch company
 * fundamentals (income statements, balance sheets, ratios, etc.).
 *
 * FMP CUSIP API:
 * - GET https://financialmodelingprep.com/api/v3/cusip/{CUSIP}?apikey=KEY
 * - Returns array with { symbol, name, price, ... } or empty array
 * - One CUSIP per request — we batch sequentially with delays
 *
 * This module also maintains a persistent cache in Supabase (cusip_cache
 * table) so we only call FMP once per CUSIP across all pipeline runs.
 *
 * Session 2 deliverable (updated Session 8 to use FMP instead of OpenFIGI).
 * References: Master Reference §5, §8 step 3.
 * Destination: src/engine/cusip.ts
 */

import { FMP, PIPELINE } from './constants.js';
import {
  CusipResolution,
  PipelineStepResult,
  delay,
} from './types.js';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve an array of CUSIPs to tickers via FMP.
 *
 * Checks the Supabase cache first (if a cache lookup function is provided),
 * then resolves uncached CUSIPs one at a time through FMP's CUSIP endpoint.
 *
 * @param cusips - Array of 9-character CUSIP strings
 * @param apiKey - FMP API key (from FMP_API_KEY env var)
 * @param cacheLookup - Optional function to check Supabase cache
 * @param cacheSave - Optional function to persist new resolutions to Supabase
 */
export async function resolveCusips(
  cusips: string[],
  apiKey: string,
  cacheLookup?: (cusips: string[]) => Promise<Map<string, CusipResolution>>,
  cacheSave?: (resolutions: CusipResolution[]) => Promise<void>
): Promise<PipelineStepResult<Map<string, CusipResolution>>> {
  const start = Date.now();

  try {
    // Deduplicate CUSIPs
    const uniqueCusips = [...new Set(cusips.filter(c => c && c.trim() !== ''))];

    if (uniqueCusips.length === 0) {
      return {
        success: true,
        data: new Map(),
        error: null,
        durationMs: Date.now() - start,
      };
    }

    // Check cache first
    let cached = new Map<string, CusipResolution>();
    if (cacheLookup) {
      cached = await cacheLookup(uniqueCusips);
    }

    // Filter out already-cached CUSIPs
    const uncached = uniqueCusips.filter(c => !cached.has(c));

    console.log(
      `[cusip] ${uniqueCusips.length} unique CUSIPs: ${cached.size} cached, ${uncached.length} to resolve`
    );

    // Resolve uncached CUSIPs via FMP one at a time (sequential with delays)
    const newResolutions: CusipResolution[] = [];

    for (let i = 0; i < uncached.length; i++) {
      const cusip = uncached[i];
      if (i > 0 && i % 25 === 0) {
        console.log(`[cusip] Resolving ${i}/${uncached.length} CUSIPs...`);
      }

      const resolution = await callFmpCusip(cusip, apiKey);
      newResolutions.push(resolution);

      // Delay between calls to respect FMP rate limits
      if (i < uncached.length - 1) {
        await delay(PIPELINE.API_CALL_DELAY_MS);
      }
    }

    // Persist new resolutions to cache
    if (cacheSave && newResolutions.length > 0) {
      await cacheSave(newResolutions);
    }

    // Merge cached + new into final result map
    const allResolutions = new Map<string, CusipResolution>(cached);
    for (const resolution of newResolutions) {
      allResolutions.set(resolution.cusip, resolution);
    }

    // Log stats
    const resolved = [...allResolutions.values()].filter(r => r.resolved).length;
    const unresolved = allResolutions.size - resolved;
    console.log(
      `[cusip] Complete: ${resolved} resolved, ${unresolved} unresolved out of ${allResolutions.size} total`
    );

    return {
      success: true,
      data: allResolutions,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: null,
      error: `CUSIP resolution failed: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── FMP CUSIP API Call ───────────────────────────────────────────────────

/**
 * Call the FMP CUSIP endpoint for a single CUSIP.
 *
 * GET /api/v3/cusip/{CUSIP}?apikey=KEY
 * Returns: [{ symbol, name, price, changesPercentage, change,
 *            dayLow, dayHigh, yearHigh, yearLow, ... }]
 * Empty array if no match.
 */
async function callFmpCusip(
  cusip: string,
  apiKey: string
): Promise<CusipResolution> {
  try {
    const url = `${FMP.BASE_URL}/cusip/${encodeURIComponent(cusip)}?apikey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        console.warn('[cusip] FMP rate limit hit, waiting 10s before retry...');
        await delay(10_000);
        const retryResponse = await fetch(url);
        if (!retryResponse.ok) {
          return {
            cusip,
            ticker: null,
            name: null,
            securityType: null,
            resolved: false,
            warning: `FMP returned HTTP ${retryResponse.status} on retry`,
          };
        }
        return parseFmpResponse(cusip, await retryResponse.json());
      }
      return {
        cusip,
        ticker: null,
        name: null,
        securityType: null,
        resolved: false,
        warning: `FMP returned HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return parseFmpResponse(cusip, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      cusip,
      ticker: null,
      name: null,
      securityType: null,
      resolved: false,
      warning: `FMP call failed: ${message}`,
    };
  }
}

/**
 * Parse the FMP CUSIP response.
 * FMP returns an array — empty means no match, otherwise first entry has the symbol.
 */
function parseFmpResponse(
  cusip: string,
  data: Record<string, unknown>[]
): CusipResolution {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      cusip,
      ticker: null,
      name: null,
      securityType: null,
      resolved: false,
      warning: 'No match found in FMP',
    };
  }

  const entry = data[0];
  const symbol = entry.symbol as string | undefined;
  const name = entry.name as string | undefined;

  if (!symbol) {
    return {
      cusip,
      ticker: null,
      name: name || null,
      securityType: null,
      resolved: false,
      warning: 'FMP returned entry without symbol',
    };
  }

  return {
    cusip,
    ticker: symbol,
    name: name || null,
    securityType: null,
    resolved: true,
    warning: null,
  };
}
