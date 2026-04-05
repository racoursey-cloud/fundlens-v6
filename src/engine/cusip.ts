/**
 * FundLens v6 — OpenFIGI CUSIP-to-Ticker Resolver
 *
 * Takes CUSIPs from EDGAR holdings and resolves them to stock tickers
 * via the OpenFIGI API. Tickers are what FMP needs to fetch company
 * fundamentals (income statements, balance sheets, ratios, etc.).
 *
 * OpenFIGI v3 API:
 * - POST https://api.openfigi.com/v3/mapping
 * - Max 100 jobs per request (with API key)
 * - Auth via X-OPENFIGI-APIKEY header
 * - Response array is index-matched to request array
 * - Failed lookups return { warning: "No identifier found" }
 *
 * This module also maintains a persistent cache in Supabase (cusip_cache
 * table) so we only call OpenFIGI once per CUSIP across all pipeline runs.
 *
 * Session 2 deliverable. References: Master Reference §5 (OpenFIGI),
 * §8 step 3.
 */

import { OPENFIGI, PIPELINE } from './constants.js';
import {
  CusipResolution,
  FigiMappingJob,
  FigiResult,
  PipelineStepResult,
  delay,
} from './types.js';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve an array of CUSIPs to tickers via OpenFIGI.
 *
 * Checks the Supabase cache first (if a cache lookup function is provided),
 * then batches uncached CUSIPs to OpenFIGI in groups of 100.
 *
 * @param cusips - Array of 9-character CUSIP strings
 * @param apiKey - OpenFIGI API key (from OPENFIGI_API_KEY env var)
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

    // Resolve uncached CUSIPs via OpenFIGI in batches
    const newResolutions: CusipResolution[] = [];

    if (uncached.length > 0) {
      const batches = chunkArray(uncached, OPENFIGI.BATCH_SIZE);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(
          `[cusip] Resolving batch ${i + 1}/${batches.length} (${batch.length} CUSIPs)`
        );

        const batchResults = await callOpenFigi(batch, apiKey);
        newResolutions.push(...batchResults);

        // Delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await delay(PIPELINE.API_CALL_DELAY_MS);
        }
      }

      // Persist new resolutions to cache
      if (cacheSave && newResolutions.length > 0) {
        await cacheSave(newResolutions);
      }
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

// ─── OpenFIGI API Call ──────────────────────────────────────────────────────

/**
 * Call the OpenFIGI v3 mapping API for a batch of CUSIPs (max 100).
 *
 * Request: POST array of { idType: "ID_CUSIP", idValue: "..." }
 * Response: array of { data: [...] } or { warning: "No identifier found" }
 * Response array is index-matched to request array.
 */
async function callOpenFigi(
  cusips: string[],
  apiKey: string
): Promise<CusipResolution[]> {
  const jobs: FigiMappingJob[] = cusips.map(cusip => ({
    idType: 'ID_CUSIP',
    idValue: cusip,
  }));

  const response = await fetch(OPENFIGI.BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OPENFIGI-APIKEY': apiKey,
    },
    body: JSON.stringify(jobs),
  });

  if (!response.ok) {
    // Handle rate limiting specifically
    if (response.status === 429) {
      console.warn('[cusip] OpenFIGI rate limit hit, waiting 10s before retry...');
      await delay(10_000);
      // Retry once
      const retryResponse = await fetch(OPENFIGI.BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OPENFIGI-APIKEY': apiKey,
        },
        body: JSON.stringify(jobs),
      });
      if (!retryResponse.ok) {
        throw new Error(`OpenFIGI API returned HTTP ${retryResponse.status} on retry`);
      }
      return parseOpenFigiResponse(cusips, await retryResponse.json());
    }
    throw new Error(`OpenFIGI API returned HTTP ${response.status}`);
  }

  const responseData = await response.json();
  return parseOpenFigiResponse(cusips, responseData);
}

/**
 * Parse the OpenFIGI response array. Each element at index i corresponds
 * to the CUSIP at index i in the request.
 *
 * Successful: { data: [{ figi, ticker, name, securityType, ... }] }
 * Failed:     { warning: "No identifier found" }
 */
function parseOpenFigiResponse(
  cusips: string[],
  responseData: Record<string, unknown>[]
): CusipResolution[] {
  const resolutions: CusipResolution[] = [];

  for (let i = 0; i < cusips.length; i++) {
    const cusip = cusips[i];
    const entry = responseData[i] as Record<string, unknown> | undefined;

    if (!entry) {
      resolutions.push({
        cusip,
        ticker: null,
        name: null,
        securityType: null,
        resolved: false,
        warning: 'No response entry from OpenFIGI',
      });
      continue;
    }

    // Check for warning (v3 uses "warning", not "error")
    if (entry.warning) {
      resolutions.push({
        cusip,
        ticker: null,
        name: null,
        securityType: null,
        resolved: false,
        warning: entry.warning as string,
      });
      continue;
    }

    // Extract the best match from data array
    const data = entry.data as FigiResult[] | undefined;
    if (!data || data.length === 0) {
      resolutions.push({
        cusip,
        ticker: null,
        name: null,
        securityType: null,
        resolved: false,
        warning: 'Empty data array from OpenFIGI',
      });
      continue;
    }

    // Prefer US-listed equities; fall back to first result
    const bestMatch =
      data.find(d => d.exchCode === 'US' && d.marketSector === 'Equity') ||
      data.find(d => d.exchCode === 'US') ||
      data[0];

    resolutions.push({
      cusip,
      ticker: bestMatch.ticker || null,
      name: bestMatch.name || null,
      securityType: bestMatch.securityType || null,
      resolved: true,
      warning: null,
    });
  }

  return resolutions;
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Split an array into chunks of a given size. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
