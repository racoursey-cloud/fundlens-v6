/**
 * FundLens v6 — Full Pipeline Orchestrator
 *
 * Wires together all engine modules into the complete scoring pipeline.
 * This is the master control — it runs steps 1–14 from Master Reference §8
 * in sequence, with proper error handling and logging.
 *
 * Pipeline steps (spec §5.4):
 *   1.  Fetch fund list from Supabase (user's 401k menu)
 *   2.  Fetch NPORT-P holdings from EDGAR for each fund
 *   3.  Resolve CUSIPs to tickers via OpenFIGI
 *   4.  Fetch company fundamentals from FMP (sequential, with delays)
 *   5.  Classify holdings into sectors via Claude Haiku (sequential, 1.2s delays)
 *   6.  Score Holdings Quality factor
 *   7.  Fetch Tiingo fee data; Score Cost Efficiency factor (§4.6: Tiingo primary)
 *   8.  Fetch Tiingo prices; FMP fallback (§4.6: Tiingo primary for NAV)
 *   9.  Score Momentum factor (cross-sectional ranking)
 *   10. Fetch cached RSS headlines + FRED macro data
 *   11. Generate macro thesis via Claude Sonnet
 *   12. Score Positioning factor (sector alignment)
 *   13. Compute composite scores
 *   14. Persist all scores and metadata to Supabase
 *
 * MANDATORY RULES:
 *   - All Claude API calls are sequential with 1.2s delays
 *   - NEVER Promise.all() for Claude calls
 *   - All Supabase calls route through supaFetch()
 *   - All Claude calls route through /api/claude proxy
 *
 * Session 3 updated, Session 10 cache layer added. References: Spec §4.6, §5.4.
 */

import { PIPELINE, CLAUDE, DEFAULT_FACTOR_WEIGHTS, MONEY_MARKET_TICKERS, MM_SCORING, MM_FUND_DATA } from './constants.js';
import { delay, ResolvedHolding, FundRow, NmfpFundData } from './types.js';
import { runHoldingsPipeline } from './holdings.js';
import { fetchFundamentalsBundle, fetchHistoricalPrices, fetchProfile, fetchRatios, fetchKeyMetrics } from './fmp.js';
import { FmpRatios, FmpKeyMetrics } from './fmp.js';
import { supaUpdate } from './supabase.js';
import { fetchExpenseRatio, fetchFinnhubExpenseRatio, KNOWN_EXPENSE_RATIOS } from './finnhub.js';
import { fetchTiingoPrices, convertTiingoPricesToFmpFormat, TiingoDailyPrice } from './tiingo.js';
import { NormalizedFeeData } from './tiingo.js';
import { scoreCostEfficiency, CostEfficiencyResult } from './cost-efficiency.js';
import { scoreQualityFactor, QualityFactorResult } from './quality.js';
import { calculateFundMomentum, scoreMomentumCrossSectional, MomentumScore, FundMomentum } from './momentum.js';
import { scoreAndRankFunds, FundRawScores, FundCompositeScore, ScoringResult, FactorWeights } from './scoring.js';
import { getHeadlines } from './rss.js';
import { fetchMacroSnapshot } from './fred.js';
import { generateMacroThesis, MacroThesis } from './thesis.js';
import { scorePositioning, PositioningResult } from './positioning.js';
import { classifyHoldingSectors } from './classify.js';
import { fetchMoneyMarketData } from './edgar.js';
import {
  getFmpCache, saveFmpCache,
  getTiingoPriceCache, saveTiingoPriceCache,
  getFinnhubFeeCache, saveFinnhubFeeCache,
  getSectorClassifications, saveSectorClassifications,
} from './cache.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Progress callback for pipeline status updates */
export type PipelineProgressCallback = (step: number, total: number, message: string) => void;

/** Complete pipeline result for a single run */
export interface PipelineResult {
  /** Scored and ranked funds */
  scoring: ScoringResult;
  /** Macro thesis used for positioning */
  thesis: MacroThesis;
  /** Per-fund detail data */
  fundDetails: Map<string, FundPipelineDetail>;
  /** Pipeline execution stats */
  stats: PipelineStats;
}

/** Detailed pipeline data for a single fund */
export interface FundPipelineDetail {
  ticker: string;
  holdings: ResolvedHolding[];
  costEfficiency: CostEfficiencyResult;
  quality: QualityFactorResult;
  momentum: MomentumScore;
  positioning: PositioningResult;
}

/** Pipeline execution statistics */
export interface PipelineStats {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  fundsProcessed: number;
  fundsSucceeded: number;
  fundsFailed: number;
  totalHoldingsScored: number;
  errors: Array<{ fund: string; step: string; error: string }>;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the complete scoring pipeline for all active funds.
 *
 * @param funds List of active funds from Supabase
 * @param onProgress Optional callback for UI progress updates
 */
export async function runFullPipeline(
  funds: FundRow[],
  onProgress?: PipelineProgressCallback
): Promise<PipelineResult> {
  const TOTAL_STEPS = 16;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const errors: PipelineStats['errors'] = [];
  const fundDetails = new Map<string, FundPipelineDetail>();

  const progress = (step: number, msg: string) => {
    console.log(`[pipeline] Step ${step}/${TOTAL_STEPS}: ${msg}`);
    onProgress?.(step, TOTAL_STEPS, msg);
  };

  // ── Step 1: Fund list already provided as argument ──
  progress(1, `Processing ${funds.length} funds`);

  // ── Money Market Detection (§2.7, updated Session 22) ────────────────────
  // MM funds skip EDGAR/CUSIP/FMP/classification (Steps 2-5) but are scored
  // on adapted factors: cost normally, quality→credit quality, momentum→yield,
  // positioning→neutral 50. Allocation comes from de minimis cash sweep (§3.5).
  const moneyMarketFunds = funds.filter(f => MONEY_MARKET_TICKERS.has(f.ticker));
  const scorableFunds = funds.filter(f => !MONEY_MARKET_TICKERS.has(f.ticker));

  if (moneyMarketFunds.length > 0) {
    console.log(
      `[pipeline] Money market funds (MM-adapted scoring): ${moneyMarketFunds.map(f => f.ticker).join(', ')}`
    );
  }

  // ── Steps 2–3: Fetch holdings from EDGAR + resolve CUSIPs ──
  // CUSIP resolution uses built-in Supabase cache + OpenFIGI + FMP search fallback.
  // The cache functions default inside resolveCusips() — no need to pass them here.
  progress(2, 'Fetching holdings from EDGAR + resolving CUSIPs');

  const openFigiKey = process.env.OPENFIGI_API_KEY || '';
  const fundHoldings = new Map<string, ResolvedHolding[]>();

  for (const fund of scorableFunds) {
    try {
      const result = await runHoldingsPipeline(fund.ticker, openFigiKey);
      if (result.success && result.data) {
        fundHoldings.set(fund.ticker, result.data.holdings);
      } else {
        errors.push({ fund: fund.ticker, step: 'holdings', error: result.error || 'Unknown' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ fund: fund.ticker, step: 'holdings', error: msg });
    }
    await delay(PIPELINE.API_CALL_DELAY_MS);
  }

  progress(3, `Holdings fetched for ${fundHoldings.size}/${scorableFunds.length} funds`);

  // ── Step 4: Fetch company fundamentals from FMP (with cache) ──
  // Session 10: Pre-fetch all unique tickers from Supabase cache in ONE query.
  // Only hit FMP for cache misses. Save misses to cache for next run.
  progress(4, 'Fetching company fundamentals from FMP');

  // Collect unique tickers across all funds
  const allTickers = new Set<string>();
  for (const holdings of fundHoldings.values()) {
    for (const h of holdings) {
      if (h.ticker) allTickers.add(h.ticker);
    }
  }

  const allTickerArray = Array.from(allTickers);
  const fundamentals = new Map<string, { ratios: FmpRatios | null; keyMetrics: FmpKeyMetrics | null }>();

  // Step 4a: Batch-check FMP cache (single Supabase query for all tickers)
  let fmpCacheHits = 0;
  try {
    const cached = await getFmpCache(allTickerArray);
    for (const [ticker, entry] of cached) {
      fundamentals.set(ticker, { ratios: entry.ratios, keyMetrics: entry.keyMetrics });
      fmpCacheHits++;
    }
    console.log(`[pipeline] FMP cache: ${fmpCacheHits}/${allTickerArray.length} tickers from cache`);
  } catch (err) {
    console.warn('[pipeline] FMP cache lookup failed, fetching all from API');
  }

  // Step 4b: Fetch cache misses from FMP API (sequential with delays)
  const fmpMisses = allTickerArray.filter(t => !fundamentals.has(t));
  let fetchedCount = 0;

  if (fmpMisses.length > 0) {
    progress(4, `Fetching ${fmpMisses.length} tickers from FMP API (${fmpCacheHits} cached)`);
  }

  for (const ticker of fmpMisses) {
    try {
      const bundle = await fetchFundamentalsBundle(ticker);
      fundamentals.set(ticker, bundle);

      // Save to cache for next run (fire-and-forget — don't block pipeline)
      saveFmpCache(ticker, bundle.ratios, bundle.keyMetrics).catch(cacheErr => {
        console.warn(`[pipeline] FMP cache save failed for ${ticker}: ${cacheErr}`);
      });
    } catch (err) {
      fundamentals.set(ticker, { ratios: null, keyMetrics: null });
    }
    fetchedCount++;
    if (fetchedCount % 25 === 0) {
      progress(4, `Fundamentals: ${fetchedCount}/${fmpMisses.length} API calls`);
    }
    await delay(PIPELINE.API_CALL_DELAY_MS);
  }

  // ── Step 5: Classify holdings into sectors via Claude Haiku (with cache) ──
  // Session 10: Collect ALL unique holding names across ALL funds, batch-check
  // sector_classifications cache, then only classify uncached holdings.
  // Saves ~4 Claude Haiku calls per run after the first.
  progress(5, 'Classifying holdings into sectors');

  // 5a: Collect all unique unclassified holding names across all funds
  const allHoldingsNeedingClassification: ResolvedHolding[] = [];
  const holdingNameToSector = new Map<string, string>();

  for (const [, holdings] of fundHoldings) {
    for (const h of holdings) {
      if (!h.sector && h.name) {
        allHoldingsNeedingClassification.push(h);
      }
    }
  }

  // Deduplicate by holding name
  const uniqueNames = [...new Set(allHoldingsNeedingClassification.map(h => h.name))];

  // 5b: Batch-check sector_classifications cache
  let sectorCacheHits = 0;
  if (uniqueNames.length > 0) {
    try {
      const cachedSectors = await getSectorClassifications(uniqueNames);
      for (const [name, sector] of cachedSectors) {
        holdingNameToSector.set(name, sector);
        sectorCacheHits++;
      }
      console.log(`[pipeline] Sector cache: ${sectorCacheHits}/${uniqueNames.length} holdings from cache`);
    } catch (err) {
      console.warn('[pipeline] Sector cache lookup failed, classifying all via Claude');
    }

    // Apply cached sectors to holdings
    for (const h of allHoldingsNeedingClassification) {
      const cachedSector = holdingNameToSector.get(h.name);
      if (cachedSector) {
        h.sector = cachedSector;
      }
    }
  }

  // 5c: Classify remaining uncached holdings via Claude Haiku
  // Collect holdings that still don't have a sector after cache check
  const stillNeedClassification: ResolvedHolding[] = [];
  for (const [, holdings] of fundHoldings) {
    for (const h of holdings) {
      if (!h.sector && h.name) {
        // Deduplicate — only add if we haven't already queued this name
        if (!stillNeedClassification.some(existing => existing.name === h.name)) {
          stillNeedClassification.push(h);
        }
      }
    }
  }

  if (stillNeedClassification.length > 0) {
    progress(5, `Classifying ${stillNeedClassification.length} holdings via Claude (${sectorCacheHits} cached)`);
    try {
      await classifyHoldingSectors(stillNeedClassification);

      // Save new classifications to cache for next run
      const newClassifications: Array<{ holdingName: string; sector: string }> = [];
      for (const h of stillNeedClassification) {
        if (h.sector) {
          newClassifications.push({ holdingName: h.name, sector: h.sector });
          holdingNameToSector.set(h.name, h.sector);
        }
      }
      if (newClassifications.length > 0) {
        saveSectorClassifications(newClassifications).catch(cacheErr => {
          console.warn(`[pipeline] Sector cache save failed: ${cacheErr}`);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ fund: 'ALL', step: 'classification', error: msg });
    }

    // Apply newly classified sectors to ALL holdings across ALL funds
    for (const [, holdings] of fundHoldings) {
      for (const h of holdings) {
        if (!h.sector && h.name) {
          const sector = holdingNameToSector.get(h.name);
          if (sector) h.sector = sector;
        }
      }
    }
  } else {
    console.log('[pipeline] All holdings classified from cache — no Claude calls needed');
  }

  // ── Step 5d: Final-pass classification sweep ──────────────────────────────
  // After cache + Haiku classification, some holdings may still have no sector.
  // These are almost always bonds/fixed-income that slipped through all gates:
  //   - No EDGAR debt metadata (isDebt, issuerCategory, assetCategory)
  //   - No name-based keyword match
  //   - No ticker (so Haiku couldn't classify)
  //   - No matching name in sector cache
  //
  // Deterministic rules for the remaining unclassified:
  //   1. No ticker + has CUSIP + not an investment company → "Fixed Income"
  //      (equities almost always resolve to tickers; unresolved CUSIPs are bonds)
  //   2. Has isDebt or issuerCategory that somehow missed pre-classification → "Fixed Income"
  //   3. Everything else → "Other" (last resort, prevents Unclassified gravity)
  let finalPassClassified = 0;
  let finalPassOther = 0;
  const FINAL_DEBT_ASSET_CATS = new Set(['DBT', 'STIV', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO']);
  const FINAL_DERIV_ASSET_CATS = new Set(['DIR', 'DFE', 'DE', 'DC', 'DO']);
  for (const [, holdings] of fundHoldings) {
    for (const h of holdings) {
      if (h.sector) continue; // Already classified

      // Rule 0: Derivatives → "Other" (hedging overlays, not sector exposure)
      if (h.assetCategory && FINAL_DERIV_ASSET_CATS.has(h.assetCategory.toUpperCase())) {
        h.sector = 'Other';
        finalPassOther++;
        continue;
      }

      // Rule 1: No ticker after CUSIP resolution → almost certainly a bond
      if (!h.ticker && h.cusip && !h.isInvestmentCompany) {
        h.sector = 'Fixed Income';
        finalPassClassified++;
        continue;
      }

      // Rule 2: Has debt indicators that somehow missed pre-classification (safety net)
      // Note: CORP issuerCategory alone does NOT mean debt — it means "corporate issuer"
      // and applies to both stocks and bonds. Only treat as FI if also flagged as debt.
      if (h.isDebt) {
        h.sector = 'Fixed Income';
        finalPassClassified++;
        continue;
      }
      if (h.issuerCategory && ['UST', 'USGA', 'MUN', 'SOV', 'ABS', 'AGEN', 'AGNCY'].includes(h.issuerCategory.toUpperCase())) {
        h.sector = 'Fixed Income';
        finalPassClassified++;
        continue;
      }
      if (h.assetCategory && FINAL_DEBT_ASSET_CATS.has(h.assetCategory.toUpperCase())) {
        h.sector = 'Fixed Income';
        finalPassClassified++;
        continue;
      }

      // Rule 3: Investment company (internal funds) not yet classified
      if (h.isInvestmentCompany) {
        const nameLower = (h.name || '').toLowerCase();
        if (nameLower.includes('cash') || nameLower.includes('money market') ||
            nameLower.includes('liquidity') || nameLower.includes('state street')) {
          h.sector = 'Cash & Equivalents';
          finalPassClassified++;
          continue;
        }
      }

      // Rule 4: Last resort — assign "Other" to prevent Unclassified gravity toward 50
      h.sector = 'Other';
      finalPassOther++;
    }
  }
  if (finalPassClassified > 0 || finalPassOther > 0) {
    console.log(
      `[pipeline] Final-pass classification: ${finalPassClassified} → Fixed Income, ${finalPassOther} → Other ` +
      `(0 remaining Unclassified)`
    );
  }

  // ── Step 6: Score Holdings Quality factor ──
  progress(6, 'Scoring Holdings Quality');

  const qualityResults = new Map<string, QualityFactorResult>();

  // Score all scorable funds, not just those with EDGAR holdings.
  // Funds that failed EDGAR get neutral quality (50) so they still receive composite scores.
  for (const fund of scorableFunds) {
    const holdings = fundHoldings.get(fund.ticker);
    if (!holdings) {
      // BUG-4 fix: provide neutral fallback instead of silently skipping
      qualityResults.set(fund.ticker, {
        score: 50,
        holdingScores: [],
        unscoredHoldings: [],
        coveragePct: 0,
        equityRatio: 0,
        bondRatio: 0,
        reasoning: 'Holdings data unavailable — using neutral quality score',
        isFallback: true,
      });
      console.log(`[pipeline] ${fund.ticker}: no EDGAR holdings — quality defaults to 50`);
      continue;
    }

    const fundTicker = fund.ticker;
    const holdingsWithFundamentals = holdings.map(h => ({
      ticker: h.ticker,
      name: h.name,
      weight: h.pctOfNav,
      ratios: h.ticker ? fundamentals.get(h.ticker)?.ratios || null : null,
      keyMetrics: h.ticker ? fundamentals.get(h.ticker)?.keyMetrics || null : null,
      // Pass bond fields as a minimal EdgarHolding for quality scoring (§2.4.2)
      edgarHolding: {
        name: h.name,
        cusip: h.cusip,
        isin: null,
        lei: null,
        title: h.name,
        valueUsd: h.valueUsd,
        pctOfNav: h.pctOfNav,
        assetCategory: h.assetCategory,
        issuerCategory: h.issuerCategory,
        balance: null,
        balanceUnits: null,
        countryOfIssuer: h.countryOfIssuer,
        isInvestmentCompany: h.isInvestmentCompany,
        fairValLevel: h.fairValLevel,
        isDebt: h.isDebt,
        debtIsDefault: h.debtIsDefault,
        debtInArrears: h.debtInArrears,
      },
    }));

    const result = scoreQualityFactor(holdingsWithFundamentals);
    qualityResults.set(fundTicker, result);
  }

  // ── Step 7a: Sync fund expense ratios (Finnhub → FMP → static fallback) ──
  // Ported from v5.1's expenses.js. If a fund's expense_ratio is NULL in the
  // database, fetch it from Finnhub's mutual fund profile endpoint (primary),
  // then FMP (secondary), then a static map (last resort). Persist to the
  // funds table so future runs skip the fetch (90-day effective TTL).
  // This makes the pipeline self-healing — no manual SQL needed.

  // ── Step 7a: Sync fund expense ratios + fee data (with cache) ──
  // Session 10: Check finnhub_fee_cache first, only hit API for misses.
  const finnhubFeeMap = new Map<string, { fee12b1: number | null; frontLoad: number | null }>();

  // 7a-i: Batch-check Finnhub fee cache for ALL scorable funds
  const scorableTickers = scorableFunds.map(f => f.ticker);
  let feeCacheHits = 0;
  try {
    const cachedFees = await getFinnhubFeeCache(scorableTickers);
    for (const [ticker, entry] of cachedFees) {
      finnhubFeeMap.set(ticker, { fee12b1: entry.fee12b1, frontLoad: entry.frontLoad });

      // Also populate expense_ratio if the fund is missing it
      const fund = scorableFunds.find(f => f.ticker === ticker);
      if (fund && fund.expense_ratio == null && entry.expenseRatio != null && entry.expenseRatio > 0) {
        fund.expense_ratio = entry.expenseRatio;
        // Persist to funds table
        supaUpdate('funds', { expense_ratio: entry.expenseRatio }, { id: `eq.${fund.id}` }).catch(err => {
          console.warn(`[pipeline] Fee cache: failed to persist expense ratio for ${ticker}: ${err}`);
        });
      }
      feeCacheHits++;
    }
    console.log(`[pipeline] Finnhub fee cache: ${feeCacheHits}/${scorableTickers.length} funds from cache`);
  } catch (err) {
    console.warn('[pipeline] Finnhub fee cache lookup failed, fetching from API');
  }

  // 7a-ii: Fetch expense ratios for funds still missing them.
  // Check: expense_ratio is null AND either not in fee cache OR fee cache didn't provide one.
  // This closes the gap where fee cache has fee data but no expense ratio.
  const fundsNeedingExpenseRatio = scorableFunds.filter(
    f => f.expense_ratio == null
  );
  if (fundsNeedingExpenseRatio.length > 0) {
    progress(7, `Fetching expense ratios for ${fundsNeedingExpenseRatio.length} funds (${feeCacheHits} cached)`);

    for (const fund of fundsNeedingExpenseRatio) {
      const result = await fetchExpenseRatio(fund.ticker);
      await delay(PIPELINE.API_CALL_DELAY_MS);

      if (result.fee12b1 != null || result.frontLoad != null) {
        finnhubFeeMap.set(fund.ticker, { fee12b1: result.fee12b1, frontLoad: result.frontLoad });
      }

      // Save to fee cache for next run
      saveFinnhubFeeCache(fund.ticker, {
        expenseRatio: result.expenseRatio,
        fee12b1: result.fee12b1,
        frontLoad: result.frontLoad,
        source: result.source,
      }).catch(cacheErr => {
        console.warn(`[pipeline] Fee cache save failed for ${fund.ticker}: ${cacheErr}`);
      });

      if (result.source !== 'none' && result.expenseRatio > 0) {
        const { error } = await supaUpdate('funds', {
          expense_ratio: result.expenseRatio,
        }, { id: `eq.${fund.id}` });

        if (error) {
          console.warn(`[pipeline] Failed to persist expense ratio for ${fund.ticker}: ${error}`);
        } else {
          fund.expense_ratio = result.expenseRatio;
          console.log(`[pipeline] Saved ${fund.ticker} expense ratio: ${result.expenseRatio} (source: ${result.source})`);
        }
      } else {
        console.warn(`[pipeline] No expense ratio for ${fund.ticker} — Cost will score neutral (50)`);
      }
    }
  }

  // 7a-ii-safety: Final safety net — use static map for any fund STILL missing expense ratio.
  // This catches cases where the fee cache had an entry but with null expense_ratio,
  // and the API chain also failed.
  for (const fund of scorableFunds) {
    if (fund.expense_ratio == null) {
      const staticER = KNOWN_EXPENSE_RATIOS.get(fund.ticker);
      if (staticER) {
        fund.expense_ratio = staticER;
        console.log(`[pipeline] Static fallback expense ratio for ${fund.ticker}: ${staticER}`);
      }
    }
  }
  const stillMissing = scorableFunds.filter(f => f.expense_ratio == null);
  if (stillMissing.length > 0) {
    console.warn(`[pipeline] WARNING: ${stillMissing.length} funds have no expense ratio from ANY source: ${stillMissing.map(f => f.ticker).join(', ')}`);
  }

  // 7a-iii: Fetch fee data (12b-1, frontLoad) for funds with expense_ratio but missing fee breakdown
  const fundsNeedingFeeData = scorableFunds.filter(f => f.expense_ratio != null && !finnhubFeeMap.has(f.ticker));
  if (fundsNeedingFeeData.length > 0) {
    progress(7, `Fetching fee data (12b-1, loads) for ${fundsNeedingFeeData.length} funds`);
    for (const fund of fundsNeedingFeeData) {
      const finnhubResult = await fetchFinnhubExpenseRatio(fund.ticker);
      if (finnhubResult && (finnhubResult.fee12b1 != null || finnhubResult.frontLoad != null)) {
        finnhubFeeMap.set(fund.ticker, { fee12b1: finnhubResult.fee12b1, frontLoad: finnhubResult.frontLoad });
      }

      // Save to cache
      saveFinnhubFeeCache(fund.ticker, {
        expenseRatio: fund.expense_ratio,
        fee12b1: finnhubResult?.fee12b1 ?? null,
        frontLoad: finnhubResult?.frontLoad ?? null,
        source: 'finnhub',
      }).catch(cacheErr => {
        console.warn(`[pipeline] Fee cache save failed for ${fund.ticker}: ${cacheErr}`);
      });

      await delay(PIPELINE.API_CALL_DELAY_MS);
    }
  }

  // ── Step 7b: Score Cost Efficiency ──
  progress(7, 'Scoring Cost Efficiency');

  const costResults = new Map<string, CostEfficiencyResult>();

  for (const fund of scorableFunds) {
    // Build NormalizedFeeData from Finnhub fee components (Session 5)
    // Replaces dead Tiingo fee path — Tiingo fee endpoint returns 404
    let feeData: NormalizedFeeData | null = null;
    const finnhubFees = finnhubFeeMap.get(fund.ticker);
    if (finnhubFees && (finnhubFees.fee12b1 != null || finnhubFees.frontLoad != null)) {
      feeData = {
        expenseRatio: fund.expense_ratio,
        twelveb1Fee: finnhubFees.fee12b1,
        frontLoad: finnhubFees.frontLoad,
        backLoad: null,
        source: 'finnhub' as const,
      };
      if (finnhubFees.fee12b1 != null) {
        console.log(`[pipeline] Finnhub fee data for ${fund.ticker}: 12b-1=${(finnhubFees.fee12b1 * 100).toFixed(2)}%`);
      }
    }

    // Score cost efficiency using fund table expense_ratio + Finnhub fee extras
    const result = scoreCostEfficiency(fund.expense_ratio, fund.name, feeData);
    costResults.set(fund.ticker, result);
  }

  // ── Steps 8–9: Fetch momentum data + cross-sectional scoring (with cache) ──
  // §4.6: Tiingo is PRIMARY for fund NAV/prices. FMP is FALLBACK.
  // Session 10: Check tiingo_price_cache first, only hit API for misses.
  progress(8, 'Fetching price data (Tiingo primary, FMP fallback)');

  // Calculate date range: 13 months back (12 months + buffer)
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const fundMomentums: FundMomentum[] = [];

  // 8a: Batch-check Tiingo price cache
  let priceCacheHits = 0;
  const cachedPrices = new Map<string, TiingoDailyPrice[]>();
  try {
    const priceCache = await getTiingoPriceCache(scorableTickers);
    for (const [ticker, entry] of priceCache) {
      if (entry.prices && entry.prices.length > 0) {
        cachedPrices.set(ticker, entry.prices);
        priceCacheHits++;
      }
    }
    console.log(`[pipeline] Tiingo price cache: ${priceCacheHits}/${scorableFunds.length} funds from cache`);
  } catch (err) {
    console.warn('[pipeline] Tiingo price cache lookup failed, fetching all from API');
  }

  // 8b: Fetch prices — use cache or API
  for (const fund of scorableFunds) {
    try {
      let prices = null;

      // Check cache first
      const cached = cachedPrices.get(fund.ticker);
      if (cached && cached.length > 0) {
        // Convert cached Tiingo prices to FMP format for momentum calculation
        prices = convertTiingoPricesToFmpFormat(cached);
      } else {
        // Cache miss — try Tiingo API (primary per §4.6)
        const tiingoPrices = await fetchTiingoPrices(fund.ticker, fromDate, toDate);
        if (tiingoPrices && tiingoPrices.length > 0) {
          prices = convertTiingoPricesToFmpFormat(tiingoPrices);
          console.log(`[pipeline] Tiingo API prices for ${fund.ticker}: ${tiingoPrices.length} days`);

          // Save to cache for next run (fire-and-forget)
          saveTiingoPriceCache(fund.ticker, tiingoPrices).catch(cacheErr => {
            console.warn(`[pipeline] Tiingo cache save failed for ${fund.ticker}: ${cacheErr}`);
          });
        } else {
          // Fallback to FMP (§4.6 fallback chain)
          console.log(`[pipeline] Tiingo prices unavailable for ${fund.ticker}, falling back to FMP`);
          await delay(PIPELINE.API_CALL_DELAY_MS);
          prices = await fetchHistoricalPrices(fund.ticker, fromDate, toDate);
          if (prices && prices.length > 0) {
            console.log(`[pipeline] FMP prices for ${fund.ticker}: ${prices.length} days`);
          }
        }
        await delay(PIPELINE.API_CALL_DELAY_MS);
      }

      const momentum = calculateFundMomentum(fund.ticker, prices || []);
      fundMomentums.push(momentum);
    } catch (err) {
      fundMomentums.push({
        ticker: fund.ticker,
        returns: { threeMonth: null, sixMonth: null, nineMonth: null, twelveMonth: null },
        blendedReturn: null,
        dailyReturns: [],
        hasData: false,
      });
    }
  }

  progress(9, 'Scoring Momentum (cross-sectional)');
  const momentumResult = scoreMomentumCrossSectional(fundMomentums);
  const momentumMap = new Map<string, MomentumScore>();
  for (const ms of momentumResult.scores) {
    momentumMap.set(ms.ticker, ms);
  }

  // ── Step 10: Fetch RSS headlines + FRED macro data ──
  progress(10, 'Fetching news headlines and macro data');

  const headlines = await getHeadlines();
  await delay(PIPELINE.API_CALL_DELAY_MS);
  const macroSnapshot = await fetchMacroSnapshot();

  // ── Step 11: Generate macro thesis via Claude Sonnet ──
  progress(11, 'Generating investment brief');

  let thesis: MacroThesis;
  try {
    thesis = await generateMacroThesis(headlines, macroSnapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Thesis generation failed: ${msg}`);
    // Fallback: neutral thesis (all sectors score 50)
    thesis = {
      narrative: 'Macro thesis unavailable — using neutral positioning.',
      sectorPreferences: [],
      keyThemes: [],
      dominantTheme: '',
      macroStance: 'mixed' as const,
      riskFactors: [],
      generatedAt: new Date().toISOString(),
      model: CLAUDE.THESIS_MODEL,
    };
    errors.push({ fund: 'ALL', step: 'thesis', error: msg });
  }

  // ── Step 12: Score Positioning factor ──
  progress(12, 'Scoring Positioning');

  const positioningResults = new Map<string, PositioningResult>();

  // Score all scorable funds, not just those with EDGAR holdings.
  // Funds that failed EDGAR get neutral positioning (50) so they still receive composite scores.
  for (const fund of scorableFunds) {
    const holdings = fundHoldings.get(fund.ticker);
    if (!holdings) {
      // BUG-4 fix: provide neutral fallback instead of silently skipping
      positioningResults.set(fund.ticker, {
        score: 50,
        sectorBreakdown: [],
        reasoning: 'Holdings data unavailable — using neutral positioning score',
        isFallback: true,
      });
      console.log(`[pipeline] ${fund.ticker}: no EDGAR holdings — positioning defaults to 50`);
      continue;
    }
    const result = scorePositioning(holdings, thesis);
    positioningResults.set(fund.ticker, result);
  }

  // ── Step 13: Compute composite scores ──
  progress(13, 'Computing composite scores');

  const fundScoreInputs: Array<{
    ticker: string;
    name: string;
    raw: FundRawScores;
    fallbackCount: number;
    factorDetails: FundCompositeScore['factorDetails'];
  }> = [];

  // ── Score money market funds on adapted factors (§2.7, Session 22+23) ────
  // MM funds skip EDGAR/CUSIP/FMP/classification but get real factor scores:
  //   Cost Efficiency: scored normally (expense ratio differences are real)
  //   Quality → Credit Quality: government vs prime classification
  //   Momentum → 7-Day SEC Yield: yield comparison as return proxy
  //   Positioning: neutral 50 (macro positioning N/A for cash)
  //
  // Session 23: fetch live data from SEC EDGAR N-MFP3 filings (monthly).
  // Falls back to static MM_FUND_DATA if EDGAR fetch fails.

  // ── Fetch live N-MFP3 data for all MM funds (sequential, with delays) ──
  const nmfpDataMap = new Map<string, NmfpFundData>();
  for (const fund of moneyMarketFunds) {
    try {
      const result = await fetchMoneyMarketData(fund.ticker);
      if (result.success && result.data) {
        nmfpDataMap.set(fund.ticker, result.data);
      } else {
        console.warn(`[pipeline] ${fund.ticker}: N-MFP3 fetch failed — using static fallback. ${result.error || ''}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pipeline] ${fund.ticker}: N-MFP3 fetch error — using static fallback. ${msg}`);
    }
  }

  for (const fund of moneyMarketFunds) {
    // Cost Efficiency: score normally using existing MM category benchmarks
    const mmCost = scoreCostEfficiency(fund.expense_ratio, fund.name);
    costResults.set(fund.ticker, mmCost);

    // ── Resolve fund type + yield: prefer live N-MFP3, fall back to static ──
    const nmfpData = nmfpDataMap.get(fund.ticker);
    const staticData = MM_FUND_DATA.get(fund.ticker);
    const dataSource = nmfpData ? 'N-MFP3' : (staticData ? 'static' : 'name-heuristic');

    // Quality → Credit Quality proxy
    const isGovernment = nmfpData
      ? nmfpData.fundType === 'government'
      : (staticData?.type === 'government'
          || fund.name.toLowerCase().includes('government')
          || fund.name.toLowerCase().includes('treasury'));
    const creditQualityScore = isGovernment
      ? MM_SCORING.GOVERNMENT_QUALITY
      : MM_SCORING.PRIME_QUALITY;

    // Momentum → 7-Day SEC Yield proxy
    // Linear interpolation between yield floor/ceiling
    const secYield = nmfpData?.secYield7Day ?? staticData?.secYield7Day ?? 0.04;
    const yieldClamped = Math.max(MM_SCORING.YIELD_FLOOR, Math.min(MM_SCORING.YIELD_CEILING, secYield));
    const yieldFraction = (yieldClamped - MM_SCORING.YIELD_FLOOR)
      / (MM_SCORING.YIELD_CEILING - MM_SCORING.YIELD_FLOOR);
    const yieldScore = Math.round(
      MM_SCORING.YIELD_SCORE_MIN + yieldFraction * (MM_SCORING.YIELD_SCORE_MAX - MM_SCORING.YIELD_SCORE_MIN)
    );

    // Positioning: neutral
    const positioningScore = MM_SCORING.NEUTRAL_POSITIONING;

    // Quality reasoning includes data source + WAM/WAL when available from N-MFP3
    const qualityReasoning = nmfpData
      ? `Money market credit quality: ${isGovernment ? 'government-only' : 'prime'} ` +
        `(N-MFP3 ${nmfpData.reportDate}, WAM=${nmfpData.wam}d, WAL=${nmfpData.wal}d)`
      : `Money market credit quality: ${isGovernment ? 'government-only (UST/USG paper)' : 'prime (commercial paper)'} [${dataSource}]`;

    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw: {
        ticker: fund.ticker,
        name: fund.name,
        costEfficiency: mmCost.score,
        holdingsQuality: creditQualityScore,
        positioning: positioningScore,
        momentum: yieldScore,
      },
      fallbackCount: 0, // MM funds have real data from N-MFP3/SEC
      factorDetails: {
        costEfficiency: mmCost,
        holdingsQuality: {
          score: creditQualityScore,
          reasoning: qualityReasoning,
          holdingScores: [],
          unscoredHoldings: [],
          coveragePct: 1.0,
          equityRatio: 0,
          bondRatio: 0,
        },
        positioning: {
          score: positioningScore,
          reasoning: 'Money market fund — macro positioning neutralized at 50',
        },
        momentum: {
          ticker: fund.ticker,
          score: yieldScore,
          volAdjustedReturn: secYield,
          blendedReturn: secYield,
          returns: { threeMonth: null, sixMonth: null, nineMonth: null, twelveMonth: null },
          rank: 0,
        } as MomentumScore,
        sectorExposure: { 'Cash & Equivalents': 100 },
      },
    });
    console.log(
      `[pipeline] ${fund.ticker}: MM scoring [${dataSource}] — cost=${mmCost.score}, ` +
      `quality=${creditQualityScore} (${isGovernment ? 'govt' : 'prime'}), ` +
      `yield=${yieldScore} (${(secYield * 100).toFixed(2)}%), positioning=${positioningScore}`
    );
  }

  for (const fund of scorableFunds) {
    const cost = costResults.get(fund.ticker);
    const quality = qualityResults.get(fund.ticker);
    const momentum = momentumMap.get(fund.ticker);
    const positioning = positioningResults.get(fund.ticker);

    if (!cost || !quality || !momentum || !positioning) {
      errors.push({
        fund: fund.ticker,
        step: 'composite',
        error: 'Missing one or more factor scores',
      });
      continue;
    }

    const raw: FundRawScores = {
      ticker: fund.ticker,
      name: fund.name,
      costEfficiency: cost.score,
      holdingsQuality: quality.score,
      positioning: positioning.score,
      momentum: momentum.score,
    };

    // Build sector exposure map from classified holdings for the UI donut chart
    const holdings = fundHoldings.get(fund.ticker) || [];
    const sectorExposure: Record<string, number> = {};
    for (const h of holdings) {
      if (h.sector && h.pctOfNav > 0) {
        sectorExposure[h.sector] = (sectorExposure[h.sector] || 0) + h.pctOfNav;
      }
    }

    // F-2 fix: Build top holdings list from ALL holdings (equity + bonds)
    // for the Your Brief page. holdingsQuality.holdingScores only contains
    // equity holdings, so bond-heavy funds show "No holdings data".
    // Session 25: Removed .slice(0,10) cap — persist ALL holdings so the
    // FundLens UI can show a scrollable full list.
    const topHoldings = [...holdings]
      .filter(h => h.pctOfNav > 0)
      .sort((a, b) => b.pctOfNav - a.pctOfNav)
      .map(h => ({
        name: h.name,
        ticker: h.ticker,
        sector: h.sector || null,
        weight: Math.round(h.pctOfNav * 10) / 10,
      }));

    // Count how many factors are using synthetic fallback data
    const fallbackCount = [
      cost.isFallback,
      quality.isFallback,
      positioning.isFallback,
      momentum.isFallback,
    ].filter(Boolean).length;

    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw,
      fallbackCount,
      factorDetails: {
        costEfficiency: cost,
        holdingsQuality: quality,
        positioning: { score: positioning.score, reasoning: positioning.reasoning },
        momentum,
        sectorExposure,
        topHoldings,
      },
    });

    // Store detail data
    fundDetails.set(fund.ticker, {
      ticker: fund.ticker,
      holdings: fundHoldings.get(fund.ticker) || [],
      costEfficiency: cost,
      quality,
      momentum,
      positioning,
    });
  }

  // ── Coverage-based confidence scaling (§2.4.1, Grinold 1989) ──
  // When coverage_pct < 0.40, reduce quality weight and redistribute to momentum.
  // Ported from v5.1 scoring.js lines 391-415.
  const perFundWeights = new Map<string, FactorWeights>();

  for (const input of fundScoreInputs) {
    const quality = qualityResults.get(input.ticker);
    if (!quality) continue;

    const coveragePct = quality.coveragePct;

    if (coveragePct < 0.40) {
      // quality_weight_adj = base × max(coverage / 0.40, 0.10) — spec §2.4.1
      const scaleFactor = Math.max(coveragePct / 0.40, 0.10);
      const baseQuality = DEFAULT_FACTOR_WEIGHTS.holdingsQuality;
      const qualityAdj = baseQuality * scaleFactor;
      const freedWeight = baseQuality - qualityAdj;

      // Freed weight goes to momentum (most reliable — price data always available)
      const momentumAdj = DEFAULT_FACTOR_WEIGHTS.momentum + freedWeight;

      // Renormalize to sum to 1.0 (cost + quality_adj + momentum_adj + positioning)
      const rawSum =
        DEFAULT_FACTOR_WEIGHTS.costEfficiency +
        qualityAdj +
        momentumAdj +
        DEFAULT_FACTOR_WEIGHTS.positioning;

      perFundWeights.set(input.ticker, {
        costEfficiency: DEFAULT_FACTOR_WEIGHTS.costEfficiency / rawSum,
        holdingsQuality: qualityAdj / rawSum,
        positioning: DEFAULT_FACTOR_WEIGHTS.positioning / rawSum,
        momentum: momentumAdj / rawSum,
      });

      console.log(
        `[pipeline] Coverage scaling for ${input.ticker}: coverage=${(coveragePct * 100).toFixed(0)}% → ` +
        `quality weight ${(baseQuality * 100).toFixed(0)}%→${(qualityAdj / rawSum * 100).toFixed(0)}%, ` +
        `momentum ${(DEFAULT_FACTOR_WEIGHTS.momentum * 100).toFixed(0)}%→${(momentumAdj / rawSum * 100).toFixed(0)}%`
      );
    }
  }

  console.log(`[pipeline] Scoring ${fundScoreInputs.length} funds (${perFundWeights.size} with coverage scaling)`);

  const scoring = scoreAndRankFunds(
    fundScoreInputs,
    DEFAULT_FACTOR_WEIGHTS,
    perFundWeights.size > 0 ? perFundWeights : undefined
  );

  console.log(`[pipeline] Scoring complete: ${scoring.funds.length} funds ranked`);

  // ── Step 14: Scores computed — pipeline returns to routes.ts ──
  // Steps 15-16 (fund summaries + DB persist) happen in routes.ts
  progress(14, 'Scores computed');

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  let totalHoldingsScored = 0;
  for (const holdings of fundHoldings.values()) {
    totalHoldingsScored += holdings.length;
  }

  const stats: PipelineStats = {
    startedAt,
    completedAt,
    durationMs,
    fundsProcessed: funds.length,
    fundsSucceeded: fundScoreInputs.length,
    fundsFailed: funds.length - fundScoreInputs.length,
    totalHoldingsScored,
    errors,
  };

  console.log(
    `[pipeline] Complete in ${(durationMs / 1000).toFixed(1)}s: ` +
    `${stats.fundsSucceeded}/${stats.fundsProcessed} funds scored, ` +
    `${totalHoldingsScored} holdings, ${errors.length} errors`
  );

  return { scoring, thesis, fundDetails, stats };
}
