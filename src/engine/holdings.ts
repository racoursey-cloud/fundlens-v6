/**
 * FundLens v6 — Holdings Pipeline Orchestrator
 *
 * Ties together EDGAR (fetch holdings) + FMP CUSIP resolution and
 * applies the dynamic coverage cutoff and fund-of-funds look-through.
 *
 * Coverage cutoff (from Master Reference §4):
 *   Walk down holdings by weight (largest first).
 *   Stop when cumulative weight reaches 65% OR 50 holdings, whichever first.
 *   - Concentrated active funds may hit 65% with ~20 holdings
 *   - Broad index funds will cap at 50 holdings (~55-60% coverage)
 *
 * Fund-of-funds look-through:
 *   If a holding is itself an investment company (another fund), we recursively
 *   fetch THAT fund's NPORT-P filing and include its underlying holdings —
 *   weighted by the parent fund's position size. This ensures we score the
 *   actual stocks, not a fund-of-funds wrapper.
 *
 * Session 2 deliverable. References: Master Reference §4, §8 steps 2-3.
 */

import { HOLDINGS_COVERAGE, PIPELINE } from './constants.js';
import { fetchEdgarHoldings } from './edgar.js';
import { resolveCusips } from './cusip.js';
import {
  EdgarHolding,
  EdgarFilingResult,
  CusipResolution,
  ResolvedHolding,
  HoldingsPipelineResult,
  PipelineStepResult,
  delay,
} from './types.js';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Max depth for fund-of-funds look-through (prevents infinite recursion) */
const MAX_LOOKTHROUGH_DEPTH = 2;

/**
 * Minimum weight for a sub-fund holding to trigger look-through.
 * If a fund-of-funds holds less than 1% in a sub-fund, skip the
 * recursive fetch — it's not material enough to justify the API calls.
 */
const MIN_SUBFUND_WEIGHT = 0.01;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the complete holdings pipeline for a single fund ticker.
 *
 * Steps:
 * 1. Fetch all holdings from EDGAR NPORT-P filing
 * 2. Detect fund-of-funds and recursively look through sub-funds
 * 3. Apply the 65%/50-holding coverage cutoff
 * 4. Resolve CUSIPs to tickers via FMP
 * 5. Return the ready-to-score holdings array
 *
 * @param fundTicker - Mutual fund ticker (e.g. "VFIAX")
 * @param fmpApiKey - API key for FMP CUSIP resolution
 * @param cacheLookup - Optional Supabase cache lookup for CUSIPs
 * @param cacheSave - Optional Supabase cache save for new CUSIP resolutions
 */
export async function runHoldingsPipeline(
  fundTicker: string,
  fmpApiKey: string,
  cacheLookup?: (cusips: string[]) => Promise<Map<string, CusipResolution>>,
  cacheSave?: (resolutions: CusipResolution[]) => Promise<void>
): Promise<PipelineStepResult<HoldingsPipelineResult>> {
  const start = Date.now();
  console.log(`[holdings] Starting pipeline for ${fundTicker}`);

  try {
    // ── Step 1: Fetch holdings from EDGAR ──
    console.log(`[holdings] Fetching EDGAR NPORT-P for ${fundTicker}...`);
    const edgarResult = await fetchEdgarHoldings(fundTicker);

    if (!edgarResult.success || !edgarResult.data) {
      return {
        success: false,
        data: null,
        error: edgarResult.error || `No EDGAR data for ${fundTicker}`,
        durationMs: Date.now() - start,
      };
    }

    const filing = edgarResult.data;
    console.log(
      `[holdings] EDGAR returned ${filing.totalHoldingsCount} holdings for ${fundTicker}`
    );

    // ── Step 2: Fund-of-funds look-through ──
    const { holdings: expandedHoldings, subFundNames, lookThroughCount } =
      await expandFundOfFunds(filing.holdings, 0);

    if (subFundNames.length > 0) {
      console.log(
        `[holdings] Fund-of-funds detected. Looked through ${subFundNames.length} sub-funds, ` +
        `added ${lookThroughCount} look-through holdings`
      );
    }

    // ── Step 3: Apply coverage cutoff ──
    const { included, coverage } = applyCoverageCutoff(expandedHoldings);
    console.log(
      `[holdings] Cutoff applied: ${coverage.holdingsIncluded}/${coverage.holdingsTotal} holdings, ` +
        `${(coverage.weightCovered * 100).toFixed(1)}% coverage (${coverage.cutoffReason})`
    );

    // ── Step 4: Resolve CUSIPs to tickers ──
    const cusips = included.map(h => h.cusip).filter(Boolean);
    console.log(`[holdings] Resolving ${cusips.length} CUSIPs via FMP...`);

    const cusipResult = await resolveCusips(
      cusips,
      fmpApiKey,
      cacheLookup,
      cacheSave
    );

    if (!cusipResult.success || !cusipResult.data) {
      return {
        success: false,
        data: null,
        error: cusipResult.error || 'CUSIP resolution failed',
        durationMs: Date.now() - start,
      };
    }

    const cusipMap = cusipResult.data;

    // ── Step 5: Build resolved holdings array ──
    const resolvedHoldings: ResolvedHolding[] = [];
    const unresolvedCusips: string[] = [];

    for (const holding of included) {
      const resolution = cusipMap.get(holding.cusip);
      const ticker = resolution?.resolved ? resolution.ticker : null;

      if (!ticker) {
        unresolvedCusips.push(holding.cusip);
      }

      resolvedHoldings.push({
        name: holding.name,
        cusip: holding.cusip,
        ticker,
        pctOfNav: holding.pctOfNav,
        valueUsd: holding.valueUsd,
        assetCategory: holding.assetCategory,
        countryOfIssuer: holding.countryOfIssuer,
        sector: null, // Populated later by Claude Haiku (Session 3-4)
        isLookThrough: holding.isInvestmentCompany,
        parentFundName: (holding as LookThroughHolding).parentFundName || null,
      });
    }

    if (unresolvedCusips.length > 0) {
      console.log(
        `[holdings] ${unresolvedCusips.length} CUSIPs could not be resolved to tickers`
      );
    }

    const result: HoldingsPipelineResult = {
      fundTicker,
      filingMeta: filing.meta,
      holdings: resolvedHoldings,
      coverage,
      fundOfFunds: {
        detected: subFundNames.length > 0,
        subFundNames,
        lookThroughCount,
      },
      unresolvedCusips,
      processedAt: new Date().toISOString(),
    };

    console.log(
      `[holdings] Pipeline complete for ${fundTicker}: ` +
        `${resolvedHoldings.length} holdings ready for scoring`
    );

    return {
      success: true,
      data: result,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: null,
      error: `Holdings pipeline failed for ${fundTicker}: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Coverage Cutoff ────────────────────────────────────────────────────────

/**
 * Apply the dynamic coverage cutoff from Master Reference §4:
 *   Walk down holdings by weight (largest first).
 *   Stop when cumulative weight reaches 65% OR 50 holdings, whichever first.
 *
 * Returns the included holdings and coverage statistics.
 */
function applyCoverageCutoff(holdings: EdgarHolding[]): {
  included: EdgarHolding[];
  coverage: HoldingsPipelineResult['coverage'];
} {
  // Sort by percentage of NAV descending (largest positions first)
  const sorted = [...holdings].sort((a, b) => b.pctOfNav - a.pctOfNav);

  const included: EdgarHolding[] = [];
  let cumulativeWeight = 0;
  let cutoffReason: 'weight' | 'count' = 'count';

  for (const holding of sorted) {
    // Check count cutoff
    if (included.length >= HOLDINGS_COVERAGE.MAX_HOLDINGS) {
      cutoffReason = 'count';
      break;
    }

    included.push(holding);
    cumulativeWeight += holding.pctOfNav;

    // Check weight cutoff
    if (cumulativeWeight >= HOLDINGS_COVERAGE.TARGET_WEIGHT_PCT) {
      cutoffReason = 'weight';
      break;
    }
  }

  return {
    included,
    coverage: {
      holdingsIncluded: included.length,
      holdingsTotal: holdings.length,
      weightCovered: cumulativeWeight,
      cutoffReason,
    },
  };
}

// ─── Fund-of-Funds Look-Through ─────────────────────────────────────────────

/**
 * Internal type that extends EdgarHolding with look-through metadata.
 * Used during the expansion phase before building ResolvedHolding.
 */
interface LookThroughHolding extends EdgarHolding {
  parentFundName: string | null;
}

/**
 * Detect fund-of-funds holdings and recursively fetch their underlying
 * holdings. The look-through process:
 *
 * 1. Identify holdings flagged as investment companies
 * 2. For each sub-fund above the minimum weight threshold:
 *    a. Try to find its ticker (from CUSIP or name matching)
 *    b. Fetch its NPORT-P filing from EDGAR
 *    c. Scale its holdings by the parent's position weight
 *    d. Add the scaled holdings to the parent's holdings list
 * 3. Remove the original fund-of-funds wrapper holding
 *
 * Depth is limited to prevent infinite recursion (some funds-of-funds
 * hold other funds-of-funds).
 */
async function expandFundOfFunds(
  holdings: EdgarHolding[],
  depth: number
): Promise<{
  holdings: EdgarHolding[];
  subFundNames: string[];
  lookThroughCount: number;
}> {
  if (depth >= MAX_LOOKTHROUGH_DEPTH) {
    return { holdings, subFundNames: [], lookThroughCount: 0 };
  }

  const regularHoldings: EdgarHolding[] = [];
  const fundHoldings: EdgarHolding[] = [];

  // Separate regular holdings from fund-of-funds holdings
  for (const holding of holdings) {
    if (holding.isInvestmentCompany && holding.pctOfNav >= MIN_SUBFUND_WEIGHT) {
      fundHoldings.push(holding);
    } else {
      regularHoldings.push(holding);
    }
  }

  if (fundHoldings.length === 0) {
    return { holdings, subFundNames: [], lookThroughCount: 0 };
  }

  const subFundNames: string[] = [];
  const lookThroughHoldings: EdgarHolding[] = [];

  for (const fundHolding of fundHoldings) {
    console.log(
      `[holdings] Looking through sub-fund: "${fundHolding.name}" ` +
        `(${(fundHolding.pctOfNav * 100).toFixed(2)}% of parent)`
    );

    // Try to find the sub-fund's ticker from its name or CUSIP
    // This is a heuristic — CUSIP lookup for funds sometimes works via
    // the SEC mutual fund ticker file
    const subFundTicker = await resolveSubFundTicker(fundHolding);

    if (!subFundTicker) {
      console.log(
        `[holdings] Could not resolve sub-fund ticker for "${fundHolding.name}" — keeping as-is`
      );
      // Can't look through — keep the wrapper holding
      regularHoldings.push(fundHolding);
      continue;
    }

    await delay(PIPELINE.API_CALL_DELAY_MS);

    // Fetch the sub-fund's holdings from EDGAR
    const subResult = await fetchEdgarHoldings(subFundTicker);

    if (!subResult.success || !subResult.data) {
      console.log(
        `[holdings] Could not fetch EDGAR data for sub-fund "${subFundTicker}" — keeping wrapper`
      );
      regularHoldings.push(fundHolding);
      continue;
    }

    subFundNames.push(fundHolding.name);

    // Scale the sub-fund's holdings by the parent's position weight
    // If the parent holds 10% in a sub-fund, and the sub-fund holds 5% in AAPL,
    // then the effective weight of AAPL in the parent is 10% × 5% = 0.5%
    const parentWeight = fundHolding.pctOfNav;
    const scaledHoldings: EdgarHolding[] = subResult.data.holdings.map(h => ({
      ...h,
      pctOfNav: h.pctOfNav * parentWeight,
      valueUsd: h.valueUsd * parentWeight,
      isInvestmentCompany: h.isInvestmentCompany, // Preserve for deeper recursion
    }));

    // Recursively expand if sub-fund itself holds funds (depth-limited)
    const { holdings: expanded } = await expandFundOfFunds(
      scaledHoldings,
      depth + 1
    );

    lookThroughHoldings.push(...expanded);
  }

  // Merge regular + look-through holdings
  // If the same company appears in both (e.g. parent holds AAPL directly AND
  // through a sub-fund), we merge by summing weights. This happens in the
  // deduplication step below.
  const merged = deduplicateHoldings([...regularHoldings, ...lookThroughHoldings]);

  return {
    holdings: merged,
    subFundNames,
    lookThroughCount: lookThroughHoldings.length,
  };
}

/**
 * Try to resolve a sub-fund holding to a ticker.
 *
 * Approach: use the CUSIP to look up the sub-fund in the SEC's mutual
 * fund ticker file. If the CUSIP doesn't match (common for institutional
 * share classes), this returns null and we keep the wrapper holding.
 */
async function resolveSubFundTicker(
  holding: EdgarHolding
): Promise<string | null> {
  // Strategy 1: Try fetching the SEC mutual fund ticker file and matching CUSIP
  // The company_tickers_mf.json doesn't index by CUSIP, but we can check if
  // the holding name contains a recognizable fund family + fund name pattern
  // For now, this is a placeholder — full implementation would use FMP's profile
  // endpoint to search by CUSIP and find the associated ticker.

  // Strategy 2: If FMP is available, search by name
  // This will be wired up in Session 3 when the FMP client is built.
  // For the Session 2 deliverable, we log and return null.

  console.log(
    `[holdings] Sub-fund ticker resolution for CUSIP ${holding.cusip} ` +
      `("${holding.name}") — will use FMP search in Session 3`
  );

  return null;
}

/**
 * Deduplicate holdings with the same CUSIP by summing their weights and values.
 * This happens when a holding appears both directly and via look-through.
 */
function deduplicateHoldings(holdings: EdgarHolding[]): EdgarHolding[] {
  const map = new Map<string, EdgarHolding>();

  for (const holding of holdings) {
    const existing = map.get(holding.cusip);
    if (existing) {
      // Merge: sum weights and values, keep the more complete metadata
      map.set(holding.cusip, {
        ...existing,
        pctOfNav: existing.pctOfNav + holding.pctOfNav,
        valueUsd: existing.valueUsd + holding.valueUsd,
        // Keep whichever has more metadata
        name: existing.name || holding.name,
        assetCategory: existing.assetCategory || holding.assetCategory,
        countryOfIssuer: existing.countryOfIssuer || holding.countryOfIssuer,
        // If either is a look-through, mark it
        isInvestmentCompany:
          existing.isInvestmentCompany || holding.isInvestmentCompany,
      });
    } else {
      map.set(holding.cusip, { ...holding });
    }
  }

  return Array.from(map.values());
}
