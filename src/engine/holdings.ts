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
import { searchByName } from './fmp.js';
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

/** Max depth for fund-of-funds look-through (spec §2.4.4: capped at depth 1) */
const MAX_LOOKTHROUGH_DEPTH = 1;

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
 * @param openFigiKey - OpenFIGI API key for CUSIP-to-ticker resolution
 * @param cacheLookup - Optional Supabase cache lookup for CUSIPs
 * @param cacheSave - Optional Supabase cache save for new CUSIP resolutions
 */
export async function runHoldingsPipeline(
  fundTicker: string,
  openFigiKey: string,
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
    console.log(`[holdings] Resolving ${cusips.length} CUSIPs via OpenFIGI...`);

    // BUG-3 fix: Build ISIN and name maps for international holding resolution.
    // EDGAR provides ISINs for most holdings — OpenFIGI's ID_ISIN lookup has
    // much better coverage for non-US securities than ID_CUSIP.
    const isinMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    for (const h of included) {
      if (h.cusip && h.isin) {
        isinMap.set(h.cusip, h.isin);
      }
      if (h.cusip && h.name) {
        nameMap.set(h.cusip, h.name);
      }
    }
    if (isinMap.size > 0) {
      console.log(`[holdings] ${isinMap.size} holdings have ISINs for fallback resolution`);
    }

    const cusipResult = await resolveCusips(
      cusips,
      openFigiKey,
      cacheLookup,
      cacheSave,
      isinMap,
      nameMap
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
        // Bond fields (Session 5, §2.4.2) — carried for quality scoring
        isDebt: holding.isDebt,
        issuerCategory: holding.issuerCategory,
        fairValLevel: holding.fairValLevel,
        debtIsDefault: holding.debtIsDefault,
        debtInArrears: holding.debtInArrears,
        isInvestmentCompany: holding.isInvestmentCompany,
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
 * Heuristic: does this holding name look like a fund?
 * Matches common fund family patterns: "Fund", "Trust", "Portfolio", "ETF",
 * institutional share classes ("Inst", "Inv", "Class A/I/R").
 */
const FUND_NAME_PATTERN =
  /\b(fund|trust|portfolio|etf|index|inst|inv|class\s[a-z])\b/i;

/** FMP exchange names that indicate mutual funds or ETFs */
const FUND_EXCHANGES = new Set([
  'MUTUAL_FUND', 'AMEX', 'NASDAQ', 'NYSE', 'BATS', 'Other OTC',
]);

/**
 * Try to resolve a sub-fund holding to a ticker using FMP search-by-name.
 *
 * Strategy:
 *   1. Skip if the holding name doesn't look fund-like (heuristic guard)
 *   2. Search FMP by holding name
 *   3. Filter results for fund-like securities (mutual fund exchanges)
 *   4. Return the best match or null
 *
 * Returns null gracefully on any error — the pipeline keeps the wrapper holding.
 */
async function resolveSubFundTicker(
  holding: EdgarHolding
): Promise<string | null> {
  const name = holding.name?.trim();
  if (!name) {
    console.log(`[holdings] Sub-fund resolution skipped — no name for CUSIP ${holding.cusip}`);
    return null;
  }

  // Heuristic guard: only search if the name looks like a fund
  if (!FUND_NAME_PATTERN.test(name)) {
    console.log(`[holdings] Sub-fund resolution skipped — name doesn't look fund-like: "${name}"`);
    return null;
  }

  try {
    const results = await searchByName(name, 5);

    if (results.length === 0) {
      console.log(`[holdings] FMP search returned no results for sub-fund "${name}"`);
      return null;
    }

    // Prefer mutual fund exchange matches, then any exchange match
    const fundMatch = results.find((r) => FUND_EXCHANGES.has(r.exchangeShortName));
    const ticker = fundMatch?.symbol ?? results[0]?.symbol ?? null;

    if (ticker) {
      console.log(`[holdings] Resolved sub-fund "${name}" → ${ticker} (via FMP search)`);
    } else {
      console.log(`[holdings] FMP search found results but no usable ticker for "${name}"`);
    }

    return ticker;
  } catch (err) {
    console.warn(
      `[holdings] Sub-fund ticker resolution failed for "${name}" (CUSIP ${holding.cusip}):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
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
