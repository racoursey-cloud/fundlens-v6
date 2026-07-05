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
 *
 * A3 Task 3: pctOfNav is in WHOLE-PERCENT units (1 = 1% of NAV), so this
 * threshold is 1, not 0.01. The old value 0.01 assumed decimal fractions
 * and behaved as "0.01%", looking through essentially every sub-fund.
 */
const MIN_SUBFUND_WEIGHT = 1;

// ─── Placeholder CUSIP handling (A3 Task 2) ────────────────────────────────
// Mirrors persist.ts (A2.3 fix): NPORT-P puts the literal "N/A" in the CUSIP
// field for many foreign holdings. A placeholder identifies nothing — every
// map in the resolution flow must key by a real per-holding identity.

function isPlaceholderCusip(cusip: string | null | undefined): boolean {
  if (!cusip) return true;
  const c = cusip.trim().toUpperCase();
  return c === '' || c === 'N/A' || /^0+$/.test(c);
}

/**
 * Per-holding resolution identity: the real CUSIP, or (when the CUSIP is a
 * placeholder) the ISIN — a genuine identifier NPORT-P provides for most
 * foreign holdings — or a name key as last resort. cusip.ts routes each
 * class to the right lookup (ID_CUSIP / ID_ISIN / FMP name search).
 */
function resolutionIdFor(h: EdgarHolding): string {
  if (!isPlaceholderCusip(h.cusip)) return h.cusip;
  if (h.isin) return `ISIN:${h.isin}`;
  // A4 QFVRX fix: SEDOL-only filers (no CUSIP, no ISIN anywhere in the
  // filing) — routed to OpenFIGI ID_SEDOL in cusip.ts
  if (h.sedol) return `SEDOL:${h.sedol}`;
  return `NAME:${(h.name || '').trim().toUpperCase()}`;
}

// ─── Structurally unresolvable holdings (A4 Task 6) ────────────────────────
// The pinned test (Robert, July 5, 2026, from the DRRYX/PRPFX filing
// evidence): derivative asset category OR no identifier at all. Asset
// category alone CANNOT define it — PRPFX's bullion files as EC and STIV.
// These rows are kept and displayed (Principle 1) but never sent through
// resolution — no FMP name-search on "GOLD BULLION" — and the Dossier
// excludes them from the resolvable-NAV denominator.
// 'DCR' (credit derivative) observed in DRRYX's actual filing July 5 —
// the older sets elsewhere use 'DC'; both are included here.

const DERIVATIVE_ASSET_CATS = new Set(['DIR', 'DFE', 'DE', 'DC', 'DCR', 'DO']);

/** Mirrors classify.ts/pipeline.ts debt signals — used only for the
 *  FMP-ISIN skip below, where a bond can never yield a company profile. */
const DEBT_ASSET_CATS = new Set(['DBT', 'STIV', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO']);

function isStructurallyUnresolvable(h: EdgarHolding): boolean {
  const ac = (h.assetCategory || '').toUpperCase();
  if (DERIVATIVE_ASSET_CATS.has(ac)) return true;
  // A4 QFVRX fix: SEDOL joins the resolvable-identifier set — QFVRX's
  // equities carry SEDOLs only and showed 88.6% "unresolvable" on the
  // July 5 run against a 66.3% July 2 resolution baseline.
  return isPlaceholderCusip(h.cusip) && !h.isin && !h.sedol;
}

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
    // A2 Task 4: NPORT-P pctVal is already in whole-percent units (95.03 = 95.03%),
    // so weightCovered must not be multiplied by 100 for display.
    console.log(
      `[holdings] Cutoff applied: ${coverage.holdingsIncluded}/${coverage.holdingsTotal} holdings, ` +
        `${coverage.weightCovered.toFixed(1)}% coverage (${coverage.cutoffReason})`
    );

    // ── Step 4: Resolve holdings to tickers ──
    // A3 Task 2: each holding resolves under a per-holding identity (real
    // CUSIP, else ISIN, else name key). Previously every "N/A"-CUSIP holding
    // in a fund shared ONE resolution slot and ONE cusip_cache row — the
    // main reason international funds resolved so few holdings (VFWAX was
    // 68/400 on July 2).
    // A4 Task 6: structurally unresolvable rows (derivatives, no-identifier
    // bullion/sweeps) skip resolution entirely — kept for display and the
    // Dossier, never sent to OpenFIGI or FMP.
    const resolvable = included.filter(h => !isStructurallyUnresolvable(h));
    const unresolvableCount = included.length - resolvable.length;
    if (unresolvableCount > 0) {
      console.log(
        `[holdings] A4 Task 6: ${unresolvableCount} structurally unresolvable holdings kept but skipping resolution`
      );
    }

    const resolveIds = resolvable.map(h => resolutionIdFor(h));
    const placeholderCount = resolvable.filter(h => isPlaceholderCusip(h.cusip)).length;
    console.log(
      `[holdings] Resolving ${resolveIds.length} holdings via OpenFIGI` +
      (placeholderCount > 0 ? ` (${placeholderCount} placeholder-CUSIP → ISIN/name identity)` : '')
    );

    // BUG-3 fix: ISIN retry map — now only for REAL CUSIPs that fail the
    // ID_CUSIP lookup (placeholder-CUSIP holdings resolve via ISIN directly
    // in cusip.ts). The name map feeds the FMP search fallback for all ids.
    // A4 Task 6 (Robert-approved): debt-flagged ISIN holdings skip the PAID
    // FMP-ISIN step — a bond never yields a company profile; EDGAR metadata
    // already identifies it. The free batched OpenFIGI path still runs.
    const isinMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    const fmpIsinSkipIds = new Set<string>();
    for (const h of resolvable) {
      const id = resolutionIdFor(h);
      if (!isPlaceholderCusip(h.cusip) && h.isin) {
        isinMap.set(id, h.isin);
      }
      if (h.name) {
        nameMap.set(id, h.name);
      }
      const ac = (h.assetCategory || '').toUpperCase();
      if (h.isDebt || DEBT_ASSET_CATS.has(ac)) {
        fmpIsinSkipIds.add(id);
      }
    }
    if (isinMap.size > 0) {
      console.log(`[holdings] ${isinMap.size} real-CUSIP holdings have ISINs for fallback resolution`);
    }

    const cusipResult = await resolveCusips(
      resolveIds,
      openFigiKey,
      cacheLookup,
      cacheSave,
      isinMap,
      nameMap,
      fmpIsinSkipIds
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
      // A3 Task 2: look up by the same per-holding identity used to resolve
      const resolution = cusipMap.get(resolutionIdFor(holding));
      const ticker = resolution?.resolved ? resolution.ticker : null;
      const structUnresolvable = isStructurallyUnresolvable(holding);

      // A4 Task 6: structurally unresolvable rows were never attempted —
      // they are not resolution FAILURES and don't belong in that list.
      if (!ticker && !structUnresolvable) {
        unresolvedCusips.push(resolutionIdFor(holding));
      }

      resolvedHoldings.push({
        name: holding.name,
        cusip: holding.cusip,
        isin: holding.isin ?? null,
        sedol: holding.sedol ?? null,
        identifierTicker: holding.identifierTicker ?? null,
        ticker,
        // A4 Task 1: symbol class travels with the holding so enrichment
        // steps can skip 'home' listings (identity only, not FMP-servable)
        listingTier: resolution?.listingTier ?? null,
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
        // A4 Task 6: kept + displayed, excluded from the resolvable
        // denominator in the Dossier
        structurallyUnresolvable: structUnresolvable,
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
        `(${fundHolding.pctOfNav.toFixed(2)}% of parent)`
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

    // Scale the sub-fund's holdings by the parent's position weight.
    // If the parent holds 10% in a sub-fund, and the sub-fund holds 5% in AAPL,
    // then the effective weight of AAPL in the parent is 10% × 5% = 0.5%.
    //
    // A3 Task 3: both weights are in WHOLE-PERCENT units (10 and 5, not 0.10
    // and 0.05), so the scale factor is parentWeight / 100. The old bare
    // multiplication produced weights 100× too large (10 × 5 = 50 instead
    // of 0.5), letting look-through holdings monopolize the coverage cutoff.
    const parentWeight = fundHolding.pctOfNav;
    const scaledHoldings: EdgarHolding[] = subResult.data.holdings.map(h => ({
      ...h,
      pctOfNav: h.pctOfNav * parentWeight / 100,
      valueUsd: h.valueUsd * parentWeight / 100,
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
    // A3 Task 2: a placeholder CUSIP ("N/A") identifies nothing — merge those
    // rows by a real identity so distinct securities never collapse.
    // A4 first-run fix: ISIN before name. Same-issuer sovereign bonds
    // (multiple Brazil/Mexico maturities sharing one <name>) are DISTINCT
    // securities with distinct ISINs — name-only keying collapsed them
    // (verified in DRRYX's July 5 run). Genuine multi-lot duplicates share
    // an ISIN and still merge.
    const key = isPlaceholderCusip(holding.cusip)
      ? (holding.isin
          ? `isin:${holding.isin}`
          : holding.sedol
            ? `sedol:${holding.sedol}`
            : `name:${(holding.name || '').trim().toUpperCase()}`)
      : holding.cusip;
    const existing = map.get(key);
    if (existing) {
      // Merge: sum weights and values, keep the more complete metadata
      map.set(key, {
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
      map.set(key, { ...holding });
    }
  }

  return Array.from(map.values());
}
