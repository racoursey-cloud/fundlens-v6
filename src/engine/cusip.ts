/**
 * FundLens v6 — OpenFIGI CUSIP-to-Ticker Resolver
 *
 * Takes CUSIPs from EDGAR holdings and resolves them to stock tickers
 * via the OpenFIGI API. Tickers are what FMP needs to fetch company
 * fundamentals (income statements, balance sheets, ratios, etc.).
 *
 * Fallback chain (spec §4.6):
 *   1. Supabase cusip_cache (persistent, avoids redundant API calls)
 *   2. OpenFIGI v3 API (batch, 100 per request)
 *   3. FMP search-by-name (for CUSIPs that OpenFIGI can't resolve)
 *   4. Supabase manual entry (manual overrides always win)
 *
 * OpenFIGI v3 API:
 * - POST https://api.openfigi.com/v3/mapping
 * - Max 100 jobs per request (with API key)
 * - Auth via X-OPENFIGI-APIKEY header
 * - Response array is index-matched to request array
 * - Failed lookups return { warning: "No identifier found" }
 *
 * Session 2 deliverable. References: Master Spec §4.3, §4.6.
 */

import { OPENFIGI, PIPELINE } from './constants.js';
import {
  CusipResolution,
  CusipCacheRow,
  FigiMappingJob,
  FigiResult,
  PipelineStepResult,
  delay,
} from './types.js';
import { supaFetch } from './supabase.js';
import { searchByName } from './fmp.js';

// ─── Supabase Cache Functions ─────────────────────────────────────────────

/**
 * Look up CUSIPs in the Supabase cusip_cache table.
 * Returns a Map of CUSIP → CusipResolution for all found entries.
 *
 * Both resolved AND unresolved entries are cached (negative caching
 * prevents re-querying OpenFIGI for CUSIPs known to not resolve).
 */
export async function cusipCacheLookup(
  cusips: string[]
): Promise<Map<string, CusipResolution>> {
  const result = new Map<string, CusipResolution>();
  if (cusips.length === 0) return result;

  // PostgREST IN filter: cusip=in.(val1,val2,val3)
  const inFilter = `in.(${cusips.join(',')})`;
  const { data, error } = await supaFetch<CusipCacheRow[]>('cusip_cache', {
    params: { cusip: inFilter, select: '*' },
  });

  if (error || !data) {
    console.warn(`[cusip] Cache lookup failed: ${error || 'no data'}`);
    return result;
  }

  for (const row of data) {
    result.set(row.cusip, {
      cusip: row.cusip,
      ticker: row.ticker,
      name: row.name,
      securityType: row.security_type,
      resolved: row.resolved,
      warning: null,
    });
  }

  return result;
}

/**
 * Save CUSIP resolutions to the Supabase cusip_cache table.
 * Uses upsert (ON CONFLICT DO UPDATE) so re-runs update existing entries.
 *
 * Saves BOTH resolved and unresolved CUSIPs (negative caching).
 */
export async function cusipCacheSave(
  resolutions: CusipResolution[]
): Promise<void> {
  if (resolutions.length === 0) return;

  const rows: Omit<CusipCacheRow, 'resolved_at'>[] = resolutions.map(r => ({
    cusip: r.cusip,
    ticker: r.ticker,
    name: r.name,
    security_type: r.securityType,
    resolved: r.resolved,
  }));

  const { error } = await supaFetch('cusip_cache', {
    method: 'POST',
    body: rows,
    upsert: true,
  });

  if (error) {
    console.warn(`[cusip] Cache save failed: ${error}`);
  } else {
    console.log(`[cusip] Cached ${rows.length} CUSIP resolutions to Supabase`);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve an array of CUSIPs to tickers via the full fallback chain.
 *
 * Chain: Supabase cache → OpenFIGI (batch) → FMP search (individual) → cache save.
 *
 * @param cusips - Array of 9-character CUSIP strings
 * @param apiKey - OpenFIGI API key (from OPENFIGI_API_KEY env var)
 * @param cacheLookup - Function to check Supabase cache (default: cusipCacheLookup)
 * @param cacheSave - Function to persist new resolutions to Supabase (default: cusipCacheSave)
 * @param isinMap - Optional map of CUSIP → ISIN for international holdings (BUG-3 fix)
 * @param nameMap - Optional map of CUSIP → holding name from EDGAR for FMP fallback (BUG-3 fix)
 */
export async function resolveCusips(
  cusips: string[],
  apiKey: string,
  cacheLookup: (cusips: string[]) => Promise<Map<string, CusipResolution>> = cusipCacheLookup,
  cacheSave: (resolutions: CusipResolution[]) => Promise<void> = cusipCacheSave,
  isinMap?: Map<string, string>,
  nameMap?: Map<string, string>
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

    // ── Step 1: Check Supabase cache ──
    const cached = await cacheLookup(uniqueCusips);

    // Filter out already-cached CUSIPs (both resolved and unresolved negatives)
    const uncached = uniqueCusips.filter(c => !cached.has(c));

    console.log(
      `[cusip] ${uniqueCusips.length} unique CUSIPs: ${cached.size} cached, ${uncached.length} to resolve`
    );

    // ── Step 2: Resolve uncached CUSIPs via OpenFIGI in batches ──
    const newResolutions: CusipResolution[] = [];

    if (uncached.length > 0) {
      const batches = chunkArray(uncached, OPENFIGI.BATCH_SIZE);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(
          `[cusip] OpenFIGI batch ${i + 1}/${batches.length} (${batch.length} CUSIPs)`
        );

        const batchResults = await callOpenFigi(batch, apiKey);
        newResolutions.push(...batchResults);

        // Delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await delay(PIPELINE.API_CALL_DELAY_MS);
        }
      }
    }

    // ── Step 2b: ISIN retry for unresolved international holdings (BUG-3) ──
    // International CUSIPs often fail OpenFIGI. If we have ISINs from EDGAR,
    // retry unresolved CUSIPs using idType: 'ID_ISIN' which has much better
    // coverage for non-US securities.
    if (isinMap && isinMap.size > 0) {
      const unresolvedWithIsin = newResolutions.filter(
        r => (!r.resolved || !r.ticker) && isinMap.has(r.cusip)
      );

      if (unresolvedWithIsin.length > 0) {
        console.log(
          `[cusip] ${unresolvedWithIsin.length} unresolved CUSIPs have ISINs — retrying via ID_ISIN`
        );

        const isinBatches = chunkArray(unresolvedWithIsin, OPENFIGI.BATCH_SIZE);
        for (let i = 0; i < isinBatches.length; i++) {
          const batch = isinBatches[i];
          console.log(
            `[cusip] ISIN batch ${i + 1}/${isinBatches.length} (${batch.length} ISINs)`
          );

          // Build ISIN lookup array, keeping CUSIP association for merging back
          const isinCusipPairs = batch.map(r => ({
            cusip: r.cusip,
            isin: isinMap.get(r.cusip)!,
          }));

          const isinResults = await callOpenFigiByIsin(
            isinCusipPairs.map(p => p.isin),
            apiKey
          );

          // Merge successful ISIN resolutions back into newResolutions by CUSIP
          let isinResolved = 0;
          for (let j = 0; j < isinCusipPairs.length; j++) {
            const isinResult = isinResults[j];
            if (isinResult && isinResult.resolved && isinResult.ticker) {
              const idx = newResolutions.findIndex(r => r.cusip === isinCusipPairs[j].cusip);
              if (idx >= 0) {
                newResolutions[idx] = {
                  ...newResolutions[idx],
                  ticker: isinResult.ticker,
                  name: isinResult.name || newResolutions[idx].name,
                  securityType: isinResult.securityType || newResolutions[idx].securityType,
                  resolved: true,
                  warning: 'Resolved via ISIN fallback',
                };
                isinResolved++;
              }
            }
          }

          if (isinResolved > 0) {
            console.log(`[cusip] ISIN retry resolved ${isinResolved} additional CUSIPs`);
          }

          if (i < isinBatches.length - 1) {
            await delay(PIPELINE.API_CALL_DELAY_MS);
          }
        }
      }
    }

    // ── Step 3: FMP search fallback for unresolved CUSIPs ──
    // For CUSIPs that OpenFIGI couldn't resolve, try FMP's name search
    // as a fallback (spec §4.6). This helps with newer securities or
    // CUSIPs not yet indexed by OpenFIGI.
    // BUG-3 fix: also use EDGAR holding names when OpenFIGI returned no name.
    const unresolvedFromFigi = newResolutions.filter(r => !r.resolved || !r.ticker);
    if (unresolvedFromFigi.length > 0) {
      console.log(
        `[cusip] ${unresolvedFromFigi.length} CUSIPs unresolved by OpenFIGI, trying FMP search fallback`
      );
      await tryFmpSearchFallback(unresolvedFromFigi, newResolutions, nameMap);
    }

    // ── Step 4: Persist ALL new resolutions to cache (including negatives) ──
    if (newResolutions.length > 0) {
      await cacheSave(newResolutions);
    }

    // Merge cached + new into final result map
    const allResolutions = new Map<string, CusipResolution>(cached);
    for (const resolution of newResolutions) {
      allResolutions.set(resolution.cusip, resolution);
    }

    // Log stats
    const resolved = [...allResolutions.values()].filter(r => r.resolved && r.ticker).length;
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

// ─── FMP Search Fallback ────────────────────────────────────────────────────

/**
 * For CUSIPs that OpenFIGI couldn't resolve, try FMP's search-by-name
 * endpoint as a fallback (spec §4.6 fallback chain).
 *
 * This mutates the resolutions in-place: if FMP finds a match, the
 * corresponding entry in newResolutions is updated with the ticker.
 *
 * We only attempt this for resolutions that have a name from OpenFIGI
 * (even failed lookups sometimes return a partial name). For resolutions
 * with no name at all, we fall back to EDGAR holding names via nameMap
 * (BUG-3 fix — international holdings often have no OpenFIGI name but
 * EDGAR always provides the holding name).
 */
async function tryFmpSearchFallback(
  unresolved: CusipResolution[],
  allResolutions: CusipResolution[],
  nameMap?: Map<string, string>
): Promise<void> {
  let fmpResolved = 0;

  for (const resolution of unresolved) {
    // Need a name to search — try OpenFIGI name first, then EDGAR name from nameMap
    const searchQuery = resolution.name || (nameMap ? nameMap.get(resolution.cusip) : null);
    if (!searchQuery) continue;

    try {
      await delay(PIPELINE.API_CALL_DELAY_MS);
      const results = await searchByName(searchQuery, 3);

      if (results.length > 0) {
        // Prefer US-listed result
        const usResult = results.find(r =>
          r.exchangeShortName === 'NYSE' ||
          r.exchangeShortName === 'NASDAQ' ||
          r.exchangeShortName === 'AMEX'
        );
        const bestResult = usResult || results[0];

        // Update the resolution in-place (it's the same object in allResolutions)
        const idx = allResolutions.findIndex(r => r.cusip === resolution.cusip);
        if (idx >= 0) {
          allResolutions[idx] = {
            ...allResolutions[idx],
            ticker: bestResult.symbol,
            name: bestResult.name || allResolutions[idx].name,
            resolved: true,
            warning: 'Resolved via FMP search fallback',
          };
          fmpResolved++;
        }
      }
    } catch {
      // FMP search is best-effort — don't fail the whole pipeline
      console.warn(`[cusip] FMP search fallback failed for "${searchQuery}"`);
    }
  }

  if (fmpResolved > 0) {
    console.log(`[cusip] FMP search fallback resolved ${fmpResolved} additional CUSIPs`);
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Send API key if available (higher rate limits with key)
  if (apiKey) {
    headers['X-OPENFIGI-APIKEY'] = apiKey;
  }

  const response = await fetch(OPENFIGI.BASE_URL, {
    method: 'POST',
    headers,
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
        headers,
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
 * Call the OpenFIGI v3 mapping API using ISINs instead of CUSIPs (BUG-3).
 * International securities often have ISINs that resolve when CUSIPs fail.
 * Same API, different idType.
 */
async function callOpenFigiByIsin(
  isins: string[],
  apiKey: string
): Promise<CusipResolution[]> {
  const jobs: FigiMappingJob[] = isins.map(isin => ({
    idType: 'ID_ISIN',
    idValue: isin,
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-OPENFIGI-APIKEY'] = apiKey;
  }

  const response = await fetch(OPENFIGI.BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(jobs),
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('[cusip] OpenFIGI rate limit hit on ISIN batch, waiting 10s...');
      await delay(10_000);
      const retryResponse = await fetch(OPENFIGI.BASE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(jobs),
      });
      if (!retryResponse.ok) {
        console.warn(`[cusip] OpenFIGI ISIN retry failed with HTTP ${retryResponse.status}`);
        return isins.map(isin => ({
          cusip: isin, // placeholder — caller maps back via CUSIP
          ticker: null,
          name: null,
          securityType: null,
          resolved: false,
          warning: `OpenFIGI ISIN retry failed: HTTP ${retryResponse.status}`,
        }));
      }
      return parseOpenFigiResponse(isins, await retryResponse.json());
    }
    console.warn(`[cusip] OpenFIGI ISIN batch failed with HTTP ${response.status}`);
    return isins.map(isin => ({
      cusip: isin,
      ticker: null,
      name: null,
      securityType: null,
      resolved: false,
      warning: `OpenFIGI ISIN failed: HTTP ${response.status}`,
    }));
  }

  const responseData = await response.json();
  return parseOpenFigiResponse(isins, responseData);
}

/**
 * Parse the OpenFIGI response array. Each element at index i corresponds
 * to the CUSIP at index i in the request.
 *
 * Successful: { data: [{ figi, ticker, name, securityType, ... }] }
 * Failed:     { warning: "No identifier found" }
 *
 * Note: A match is only considered "resolved" if we get a non-empty ticker.
 * OpenFIGI sometimes returns metadata without a usable ticker — those are
 * treated as unresolved so the FMP fallback can attempt resolution.
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

    const ticker = bestMatch.ticker || null;

    resolutions.push({
      cusip,
      ticker,
      name: bestMatch.name || null,
      securityType: bestMatch.securityType || null,
      // Only mark as resolved if we actually got a usable ticker
      resolved: ticker !== null,
      warning: ticker ? null : 'OpenFIGI matched but no ticker returned',
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
