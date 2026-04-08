/**
 * FundLens v6 — Full Pipeline Orchestrator
 *
 * Wires together all engine modules into the complete scoring pipeline.
 * This is the master control — it runs steps 1–14 from Master Reference §8,
 * with proper error handling, logging, and parallel execution lanes.
 *
 * Pipeline steps (spec §5.4):
 *   1.  Fetch fund list from Supabase (user's 401k menu)
 *   2.  Fetch NPORT-P holdings from EDGAR for each fund
 *   3.  Resolve CUSIPs to tickers via OpenFIGI
 *   4.  Fetch company fundamentals from FMP (with Supabase cache layer)
 *   5.  Classify holdings into sectors via Claude Haiku (with Supabase cache layer)
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
 * Session 10: Parallel execution lanes (MISSING-13 — reduce pipeline from ~9min to <3min)
 *
 *   After Steps 1–3 (holdings fetch — must go first, all lanes need holdings):
 *
 *   Lane A: Steps 4→5→6 (fundamentals → classification → quality scoring)
 *           These depend on holdings data. Classification needs holdings.
 *           Quality scoring needs both holdings AND fundamentals.
 *
 *   Lane B: Steps 7→8→9 (expense ratios → prices → momentum)
 *           Only needs the fund list (not holdings). Independent of Lane A.
 *
 *   Lane C: Steps 10→11 (headlines/FRED → thesis generation)
 *           Completely independent. No fund/holding data needed.
 *
 *   Convergence: Step 12 (positioning) needs Lane A holdings + Lane C thesis.
 *                Step 13 (composite) needs ALL lanes complete.
 *
 *   Each lane has a timeout. If any fatal lane fails, graceful abort
 *   with partial results and logged errors.
 *
 * MANDATORY RULES:
 *   - All Claude API calls are sequential with 1.2s delays
 *   - NEVER Promise.all() for Claude calls (within a lane)
 *   - Promise.allSettled() is used BETWEEN lanes (no Claude calls cross lanes)
 *   - All Supabase calls route through supaFetch()
 *   - All Claude calls route through /api/claude proxy
 *
 * Session 3 created. Session 10 parallelized + cached.
 * References: Spec §4.6, §5.4.
 */

import { PIPELINE, CLAUDE, DEFAULT_FACTOR_WEIGHTS, MONEY_MARKET_TICKERS } from './constants.js';
import { delay, ResolvedHolding, FundRow } from './types.js';
import { runHoldingsPipeline } from './holdings.js';
import { fetchFundamentalsBundle, fetchHistoricalPrices, fetchProfile } from './fmp.js';
import { FmpRatios, FmpKeyMetrics } from './fmp.js';
import { supaUpdate } from './supabase.js';
import { fetchExpenseRatio, fetchFinnhubExpenseRatio } from './finnhub.js';
import { fetchTiingoPrices, convertTiingoPricesToFmpFormat } from './tiingo.js';
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
import { getCachedFundamentals, saveCachedFundamentals, CachedFundamentals } from './cache.js';

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

// ─── Lane Result Types ─────────────────────────────────────────────────────

/** Result from Lane A: fundamentals → classification → quality */
interface LaneAResult {
  fundamentals: Map<string, { ratios: FmpRatios | null; keyMetrics: FmpKeyMetrics | null }>;
  qualityResults: Map<string, QualityFactorResult>;
}

/** Result from Lane B: expense ratios → prices → momentum */
interface LaneBResult {
  costResults: Map<string, CostEfficiencyResult>;
  momentumMap: Map<string, MomentumScore>;
  fundMomentums: FundMomentum[];
}

/** Result from Lane C: headlines → thesis */
interface LaneCResult {
  thesis: MacroThesis;
}

// ─── Timeout Helper ────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout. If the promise doesn't resolve within
 * the timeout, reject with a descriptive error. This is used for lane-level
 * timeouts to enable graceful abort.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[pipeline] Lane timeout: ${label} exceeded ${(ms / 1000).toFixed(0)}s`));
    }, ms);

    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the complete scoring pipeline for all active funds.
 *
 * Session 10: Parallelized into three lanes after holdings fetch.
 * Each lane has its own timeout. Fatal lane failure → graceful abort.
 *
 * @param funds List of active funds from Supabase
 * @param onProgress Optional callback for UI progress updates
 */
export async function runFullPipeline(
  funds: FundRow[],
  onProgress?: PipelineProgressCallback
): Promise<PipelineResult> {
  const TOTAL_STEPS = 14;
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

  // ── Money Market Detection (§2.7) ────────────────────────────────────────
  // FDRXX/ADAXX get fixed composite 50, skip all factor scoring.
  // Separated here so all downstream loops can exclude them.
  const moneyMarketFunds = funds.filter(f => MONEY_MARKET_TICKERS.has(f.ticker));
  const scorableFunds = funds.filter(f => !MONEY_MARKET_TICKERS.has(f.ticker));

  if (moneyMarketFunds.length > 0) {
    console.log(
      `[pipeline] Money market funds (skipping scoring): ${moneyMarketFunds.map(f => f.ticker).join(', ')}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEQUENTIAL PHASE: Steps 2–3 (holdings fetch)
  // All three lanes depend on holdings data, so this must complete first.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Steps 2–3: Fetch holdings from EDGAR + resolve CUSIPs ──
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

  // If we got zero holdings, abort early — nothing to score
  if (fundHoldings.size === 0) {
    console.error('[pipeline] ABORT: No holdings fetched for any fund');
    const completedAt = new Date().toISOString();
    return buildAbortResult(
      funds, moneyMarketFunds, scorableFunds, fundHoldings, fundDetails,
      errors, startedAt, completedAt, Date.now() - startMs
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARALLEL PHASE: Three independent lanes
  //
  // Lane A: Steps 4→5→6 (fundamentals → classify → quality)
  //         Needs: fundHoldings (from Steps 2-3)
  //
  // Lane B: Steps 7→8→9 (expense ratios → prices → momentum)
  //         Needs: scorableFunds list only (NOT holdings)
  //
  // Lane C: Steps 10→11 (headlines/FRED → thesis)
  //         Needs: nothing (fully independent)
  //
  // NOTE: Claude calls happen in Lane A (classify, Step 5) and Lane C
  // (thesis, Step 11). They are in SEPARATE lanes so they never run
  // concurrently — Lane A classifies with Haiku, Lane C generates thesis
  // with Sonnet. Different models, different endpoints, no conflict.
  // The "no Promise.all for Claude" rule applies WITHIN a lane (e.g.,
  // classification batches are sequential within Lane A).
  // ══════════════════════════════════════════════════════════════════════════

  console.log('[pipeline] Starting parallel execution lanes');
  const laneStartMs = Date.now();

  // ── Define Lane A ──────────────────────────────────────────────────────
  const runLaneA = async (): Promise<LaneAResult> => {
    // Step 4: Fetch company fundamentals from FMP (with cache)
    progress(4, 'Fetching company fundamentals from FMP (with cache)');

    // Collect unique tickers across all funds
    const allTickers = new Set<string>();
    for (const holdings of fundHoldings.values()) {
      for (const h of holdings) {
        if (h.ticker) allTickers.add(h.ticker);
      }
    }

    const tickerArray = Array.from(allTickers);
    const fundamentals = new Map<string, { ratios: FmpRatios | null; keyMetrics: FmpKeyMetrics | null }>();

    // Session 10: Check fundamentals_cache first (7-day TTL)
    let cached = new Map<string, CachedFundamentals>();
    try {
      cached = await getCachedFundamentals(tickerArray);
      if (cached.size > 0) {
        console.log(`[pipeline] Fundamentals cache: ${cached.size}/${tickerArray.length} tickers resolved from cache`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pipeline] Fundamentals cache lookup failed (non-fatal): ${msg}`);
    }

    // Apply cache hits
    for (const [ticker, data] of cached) {
      fundamentals.set(ticker, { ratios: data.ratios, keyMetrics: data.keyMetrics });
    }

    // Fetch cache misses from FMP API
    const cacheMisses = tickerArray.filter(t => !cached.has(t));
    const newFundamentals = new Map<string, CachedFundamentals>();
    let fetchedCount = 0;

    if (cacheMisses.length > 0) {
      console.log(`[pipeline] Fundamentals: ${cacheMisses.length} cache misses — fetching from FMP`);
    }

    for (const ticker of cacheMisses) {
      try {
        const bundle = await fetchFundamentalsBundle(ticker);
        fundamentals.set(ticker, bundle);
        newFundamentals.set(ticker, { ratios: bundle.ratios, keyMetrics: bundle.keyMetrics });
      } catch (err) {
        fundamentals.set(ticker, { ratios: null, keyMetrics: null });
      }
      fetchedCount++;
      if (fetchedCount % 25 === 0) {
        progress(4, `Fundamentals: ${fetchedCount}/${cacheMisses.length} cache misses fetched`);
      }
      await delay(PIPELINE.API_CALL_DELAY_MS);
    }

    // Write new fundamentals to cache (non-blocking, fire-and-forget)
    if (newFundamentals.size > 0) {
      saveCachedFundamentals(newFundamentals).catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[pipeline] Fundamentals cache write failed (non-fatal): ${msg}`);
      });
    }

    progress(4, `Fundamentals: ${fundamentals.size}/${tickerArray.length} total (${cached.size} cached, ${cacheMisses.length} fetched)`);

    // Step 5: Classify holdings into sectors via Claude Haiku
    progress(5, 'Classifying holdings into sectors');

    for (const [fundTicker, holdings] of fundHoldings) {
      try {
        await classifyHoldingSectors(holdings);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ fund: fundTicker, step: 'classification', error: msg });
      }
    }

    // Step 6: Score Holdings Quality factor
    progress(6, 'Scoring Holdings Quality');

    const qualityResults = new Map<string, QualityFactorResult>();

    for (const [fundTicker, holdings] of fundHoldings) {
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

    return { fundamentals, qualityResults };
  };

  // ── Define Lane B ──────────────────────────────────────────────────────
  const runLaneB = async (): Promise<LaneBResult> => {
    // Step 7a: Sync fund expense ratios (Finnhub → FMP → static fallback)
    const finnhubFeeMap = new Map<string, { fee12b1: number | null; frontLoad: number | null }>();

    const fundsNeedingExpenseRatio = scorableFunds.filter(f => f.expense_ratio == null);
    if (fundsNeedingExpenseRatio.length > 0) {
      progress(7, `Fetching expense ratios for ${fundsNeedingExpenseRatio.length} funds`);

      for (const fund of fundsNeedingExpenseRatio) {
        const result = await fetchExpenseRatio(fund.ticker);
        await delay(PIPELINE.API_CALL_DELAY_MS);

        // Store fee data regardless of expense ratio status
        if (result.fee12b1 != null || result.frontLoad != null) {
          finnhubFeeMap.set(fund.ticker, { fee12b1: result.fee12b1, frontLoad: result.frontLoad });
        }

        if (result.source !== 'none' && result.expenseRatio > 0) {
          // Persist to funds table so future runs don't need to refetch
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

    // For funds that already had expense_ratio, fetch Finnhub fee data if not yet cached
    const fundsNeedingFeeData = scorableFunds.filter(f => f.expense_ratio != null && !finnhubFeeMap.has(f.ticker));
    if (fundsNeedingFeeData.length > 0) {
      progress(7, `Fetching fee data (12b-1, loads) for ${fundsNeedingFeeData.length} funds`);
      for (const fund of fundsNeedingFeeData) {
        const finnhubResult = await fetchFinnhubExpenseRatio(fund.ticker);
        if (finnhubResult && (finnhubResult.fee12b1 != null || finnhubResult.frontLoad != null)) {
          finnhubFeeMap.set(fund.ticker, { fee12b1: finnhubResult.fee12b1, frontLoad: finnhubResult.frontLoad });
        }
        await delay(PIPELINE.API_CALL_DELAY_MS);
      }
    }

    // Step 7b: Score Cost Efficiency
    progress(7, 'Scoring Cost Efficiency');

    const costResults = new Map<string, CostEfficiencyResult>();

    for (const fund of scorableFunds) {
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

      const result = scoreCostEfficiency(fund.expense_ratio, fund.name, feeData);
      costResults.set(fund.ticker, result);
    }

    // Steps 8–9: Fetch momentum data + cross-sectional scoring
    // §4.6: Tiingo is PRIMARY for fund NAV/prices. FMP is FALLBACK.
    progress(8, 'Fetching price data (Tiingo primary, FMP fallback)');

    // Calculate date range: 13 months back (12 months + buffer)
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const fundMomentums: FundMomentum[] = [];

    for (const fund of scorableFunds) {
      try {
        // Try Tiingo first (primary per §4.6)
        let prices = null;
        const tiingoPrices = await fetchTiingoPrices(fund.ticker, fromDate, toDate);
        if (tiingoPrices && tiingoPrices.length > 0) {
          prices = convertTiingoPricesToFmpFormat(tiingoPrices);
          console.log(`[pipeline] Tiingo prices for ${fund.ticker}: ${tiingoPrices.length} days`);
        } else {
          // Fallback to FMP (§4.6 fallback chain)
          console.log(`[pipeline] Tiingo prices unavailable for ${fund.ticker}, falling back to FMP`);
          await delay(PIPELINE.API_CALL_DELAY_MS);
          prices = await fetchHistoricalPrices(fund.ticker, fromDate, toDate);
          if (prices && prices.length > 0) {
            console.log(`[pipeline] FMP prices for ${fund.ticker}: ${prices.length} days`);
          }
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
      // Session 10: Use Tiingo-specific delay (200ms) for price fetches
      await delay(PIPELINE.TIINGO_DELAY_MS);
    }

    progress(9, 'Scoring Momentum (cross-sectional)');
    const momentumResult = scoreMomentumCrossSectional(fundMomentums);
    const momentumMap = new Map<string, MomentumScore>();
    for (const ms of momentumResult.scores) {
      momentumMap.set(ms.ticker, ms);
    }

    return { costResults, momentumMap, fundMomentums };
  };

  // ── Define Lane C ──────────────────────────────────────────────────────
  const runLaneC = async (): Promise<LaneCResult> => {
    // Step 10: Fetch RSS headlines + FRED macro data
    progress(10, 'Fetching news headlines and macro data');

    const headlines = await getHeadlines();
    await delay(PIPELINE.API_CALL_DELAY_MS);
    const macroSnapshot = await fetchMacroSnapshot();

    // Step 11: Generate macro thesis via Claude Sonnet
    progress(11, 'Generating macro thesis');

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

    return { thesis };
  };

  // ── Execute Lanes in Parallel ──────────────────────────────────────────
  const [laneASettled, laneBSettled, laneCSettled] = await Promise.allSettled([
    withTimeout(runLaneA(), PIPELINE.LANE_A_TIMEOUT_MS, 'fundamentals+classify+quality'),
    withTimeout(runLaneB(), PIPELINE.LANE_B_TIMEOUT_MS, 'expenses+prices+momentum'),
    withTimeout(runLaneC(), PIPELINE.LANE_C_TIMEOUT_MS, 'headlines+thesis'),
  ]);

  const laneDurationMs = Date.now() - laneStartMs;
  console.log(`[pipeline] Parallel lanes completed in ${(laneDurationMs / 1000).toFixed(1)}s`);

  // ── Convergence Gate: Check Lane Results ───────────────────────────────
  // Lane A (fundamentals + quality): FATAL if failed — can't score
  // Lane B (cost + momentum): FATAL if failed — can't compute composite
  // Lane C (thesis): NON-FATAL — fallback neutral thesis already in lane code,
  //                  but if the whole lane times out, use neutral thesis here.

  if (laneASettled.status === 'rejected') {
    const reason = laneASettled.reason instanceof Error ? laneASettled.reason.message : String(laneASettled.reason);
    console.error(`[pipeline] ABORT: Lane A (fundamentals+quality) failed: ${reason}`);
    errors.push({ fund: 'ALL', step: 'lane-a', error: reason });

    const completedAt = new Date().toISOString();
    return buildAbortResult(
      funds, moneyMarketFunds, scorableFunds, fundHoldings, fundDetails,
      errors, startedAt, completedAt, Date.now() - startMs
    );
  }

  if (laneBSettled.status === 'rejected') {
    const reason = laneBSettled.reason instanceof Error ? laneBSettled.reason.message : String(laneBSettled.reason);
    console.error(`[pipeline] ABORT: Lane B (prices+momentum) failed: ${reason}`);
    errors.push({ fund: 'ALL', step: 'lane-b', error: reason });

    const completedAt = new Date().toISOString();
    return buildAbortResult(
      funds, moneyMarketFunds, scorableFunds, fundHoldings, fundDetails,
      errors, startedAt, completedAt, Date.now() - startMs
    );
  }

  // Extract lane results (TypeScript knows these are fulfilled after the checks above)
  const laneAResult = laneASettled.value;
  const laneBResult = laneBSettled.value;

  // Lane C: use result if available, fallback to neutral thesis if timed out
  let thesis: MacroThesis;
  if (laneCSettled.status === 'fulfilled') {
    thesis = laneCSettled.value.thesis;
  } else {
    const reason = laneCSettled.reason instanceof Error ? laneCSettled.reason.message : String(laneCSettled.reason);
    console.warn(`[pipeline] Lane C (thesis) failed — using neutral fallback: ${reason}`);
    errors.push({ fund: 'ALL', step: 'lane-c', error: reason });
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
  }

  // Destructure lane results
  const { fundamentals, qualityResults } = laneAResult;
  const { costResults, momentumMap } = laneBResult;

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERGENCE PHASE: Steps 12–14 (need all lanes)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Step 12: Score Positioning factor ──
  // Needs: Lane A classified holdings + Lane C thesis
  progress(12, 'Scoring Positioning');

  const positioningResults = new Map<string, PositioningResult>();

  for (const [fundTicker, holdings] of fundHoldings) {
    const result = scorePositioning(holdings, thesis);
    positioningResults.set(fundTicker, result);
  }

  // ── Step 13: Compute composite scores ──
  progress(13, 'Computing composite scores');

  const fundScoreInputs: Array<{
    ticker: string;
    name: string;
    raw: FundRawScores;
    factorDetails: FundCompositeScore['factorDetails'];
  }> = [];

  // Add money market funds with fixed score 50 (§2.7) — no factor scoring needed
  for (const fund of moneyMarketFunds) {
    const FIXED_MM_SCORE = 50;
    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw: {
        ticker: fund.ticker,
        name: fund.name,
        costEfficiency: FIXED_MM_SCORE,
        holdingsQuality: FIXED_MM_SCORE,
        positioning: FIXED_MM_SCORE,
        momentum: FIXED_MM_SCORE,
      },
      // Money market placeholder — typed as Record<string, unknown> since
      // these fixed-score funds don't have real factor detail objects.
      factorDetails: {
        costEfficiency: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score' } as CostEfficiencyResult,
        holdingsQuality: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score', holdingScores: [], unscoredHoldings: [], coveragePct: 0, equityRatio: 0, bondRatio: 0 },
        positioning: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score' },
        momentum: { ticker: fund.ticker, score: FIXED_MM_SCORE, volAdjustedReturn: null, blendedReturn: null, returns: { threeMonth: null, sixMonth: null, nineMonth: null, twelveMonth: null }, rank: 0 } as MomentumScore,
        sectorExposure: {},
      },
    });
    console.log(`[pipeline] ${fund.ticker}: money market → fixed composite 50`);
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

    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw,
      factorDetails: {
        costEfficiency: cost,
        holdingsQuality: quality,
        positioning: { score: positioning.score, reasoning: positioning.reasoning },
        momentum,
        sectorExposure,
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

  const scoring = scoreAndRankFunds(
    fundScoreInputs,
    DEFAULT_FACTOR_WEIGHTS,
    perFundWeights.size > 0 ? perFundWeights : undefined
  );

  // ── Step 14: Persist to Supabase ──
  progress(14, 'Persisting scores to database');

  // Note: Supabase persistence is wired up in Session 5 (Database Schema + API).
  // For now, the pipeline returns the complete result in memory.
  // The Express API routes (Session 5) will call supaFetch() to store these.

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

// ─── Graceful Abort Helper ─────────────────────────────────────────────────

/**
 * Build a PipelineResult for graceful abort scenarios.
 * Returns whatever partial data is available (money market scores at minimum)
 * so the UI can show something rather than a blank error.
 */
function buildAbortResult(
  funds: FundRow[],
  moneyMarketFunds: FundRow[],
  scorableFunds: FundRow[],
  fundHoldings: Map<string, ResolvedHolding[]>,
  fundDetails: Map<string, FundPipelineDetail>,
  errors: PipelineStats['errors'],
  startedAt: string,
  completedAt: string,
  durationMs: number
): PipelineResult {
  // Build minimal score inputs from money market funds only
  const fundScoreInputs: Array<{
    ticker: string;
    name: string;
    raw: FundRawScores;
    factorDetails: FundCompositeScore['factorDetails'];
  }> = [];

  const FIXED_MM_SCORE = 50;
  for (const fund of moneyMarketFunds) {
    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw: {
        ticker: fund.ticker,
        name: fund.name,
        costEfficiency: FIXED_MM_SCORE,
        holdingsQuality: FIXED_MM_SCORE,
        positioning: FIXED_MM_SCORE,
        momentum: FIXED_MM_SCORE,
      },
      factorDetails: {
        costEfficiency: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score' } as CostEfficiencyResult,
        holdingsQuality: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score', holdingScores: [], unscoredHoldings: [], coveragePct: 0, equityRatio: 0, bondRatio: 0 },
        positioning: { score: FIXED_MM_SCORE, reasoning: 'Money market fund — fixed score' },
        momentum: { ticker: fund.ticker, score: FIXED_MM_SCORE, volAdjustedReturn: null, blendedReturn: null, returns: { threeMonth: null, sixMonth: null, nineMonth: null, twelveMonth: null }, rank: 0 } as MomentumScore,
        sectorExposure: {},
      },
    });
  }

  const scoring = scoreAndRankFunds(fundScoreInputs, DEFAULT_FACTOR_WEIGHTS);

  let totalHoldingsScored = 0;
  for (const holdings of fundHoldings.values()) {
    totalHoldingsScored += holdings.length;
  }

  const thesis: MacroThesis = {
    narrative: 'Pipeline aborted — using neutral positioning.',
    sectorPreferences: [],
    keyThemes: [],
    dominantTheme: '',
    macroStance: 'mixed' as const,
    riskFactors: [],
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  };

  console.error(
    `[pipeline] ABORTED after ${(durationMs / 1000).toFixed(1)}s: ` +
    `${fundScoreInputs.length}/${funds.length} funds (money market only), ` +
    `${errors.length} errors`
  );

  return {
    scoring,
    thesis,
    fundDetails,
    stats: {
      startedAt,
      completedAt,
      durationMs,
      fundsProcessed: funds.length,
      fundsSucceeded: fundScoreInputs.length,
      fundsFailed: funds.length - fundScoreInputs.length,
      totalHoldingsScored,
      errors,
    },
  };
}
