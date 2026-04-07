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
 * Session 4 deliverable. References: Master Reference §8.
 */

import { PIPELINE, CLAUDE } from './constants.js';
import { delay, ResolvedHolding, FundRow } from './types.js';
import { runHoldingsPipeline } from './holdings.js';
import { fetchFundamentalsBundle, fetchHistoricalPrices, fetchProfile } from './fmp.js';
import { FmpRatios, FmpKeyMetrics } from './fmp.js';
import { fetchTiingoPrices, fetchFundFees, convertTiingoPricesToFmpFormat, normalizeFeeData } from './tiingo.js';
import { NormalizedFeeData } from './tiingo.js';
import { scoreCostEfficiency, CostEfficiencyResult } from './cost-efficiency.js';
import { scoreQualityFactor, QualityFactorResult } from './quality.js';
import { calculateFundMomentum, scoreMomentumCrossSectional, MomentumScore, FundMomentum } from './momentum.js';
import { scoreAndRankFunds, FundRawScores, FundCompositeScore, ScoringResult } from './scoring.js';
import { getHeadlines } from './rss.js';
import { fetchMacroSnapshot } from './fred.js';
import { generateMacroThesis, MacroThesis } from './thesis.js';
import { scorePositioning, PositioningResult } from './positioning.js';
import { classifyHoldingSectors } from './classify.js';

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

  // ── Steps 2–3: Fetch holdings from EDGAR + resolve CUSIPs ──
  // CUSIP resolution uses built-in Supabase cache + OpenFIGI + FMP search fallback.
  // The cache functions default inside resolveCusips() — no need to pass them here.
  progress(2, 'Fetching holdings from EDGAR + resolving CUSIPs');

  const openFigiKey = process.env.OPENFIGI_API_KEY || '';
  const fundHoldings = new Map<string, ResolvedHolding[]>();

  for (const fund of funds) {
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

  progress(3, `Holdings fetched for ${fundHoldings.size}/${funds.length} funds`);

  // ── Step 4: Fetch company fundamentals from FMP ──
  progress(4, 'Fetching company fundamentals from FMP');

  // Collect unique tickers across all funds
  const allTickers = new Set<string>();
  for (const holdings of fundHoldings.values()) {
    for (const h of holdings) {
      if (h.ticker) allTickers.add(h.ticker);
    }
  }

  // Fetch fundamentals for each unique ticker (sequential with delays)
  const fundamentals = new Map<string, { ratios: FmpRatios | null; keyMetrics: FmpKeyMetrics | null }>();
  let fetchedCount = 0;

  for (const ticker of allTickers) {
    try {
      const bundle = await fetchFundamentalsBundle(ticker);
      fundamentals.set(ticker, bundle);
    } catch (err) {
      fundamentals.set(ticker, { ratios: null, keyMetrics: null });
    }
    fetchedCount++;
    if (fetchedCount % 25 === 0) {
      progress(4, `Fundamentals: ${fetchedCount}/${allTickers.size} tickers`);
    }
    await delay(PIPELINE.API_CALL_DELAY_MS);
  }

  // ── Step 5: Classify holdings into sectors via Claude Haiku ──
  progress(5, 'Classifying holdings into sectors');

  for (const [fundTicker, holdings] of fundHoldings) {
    try {
      await classifyHoldingSectors(holdings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ fund: fundTicker, step: 'classification', error: msg });
    }
  }

  // ── Step 6: Score Holdings Quality factor ──
  progress(6, 'Scoring Holdings Quality');

  const qualityResults = new Map<string, QualityFactorResult>();

  for (const [fundTicker, holdings] of fundHoldings) {
    const holdingsWithFundamentals = holdings.map(h => ({
      ticker: h.ticker,
      name: h.name,
      weight: h.pctOfNav,
      ratios: h.ticker ? fundamentals.get(h.ticker)?.ratios || null : null,
      keyMetrics: h.ticker ? fundamentals.get(h.ticker)?.keyMetrics || null : null,
    }));

    const result = scoreQualityFactor(holdingsWithFundamentals);
    qualityResults.set(fundTicker, result);
  }

  // ── Step 7: Fetch Tiingo fee data + Score Cost Efficiency (§4.6: Tiingo primary) ──
  progress(7, 'Fetching fee data from Tiingo + Scoring Cost Efficiency');

  const costResults = new Map<string, CostEfficiencyResult>();
  const feeDataMap = new Map<string, NormalizedFeeData>();

  for (const fund of funds) {
    // Try Tiingo fee data first (primary per §4.6)
    let feeData: NormalizedFeeData | null = null;
    try {
      const tiingoFees = await fetchFundFees(fund.ticker);
      if (tiingoFees?.hasData) {
        feeData = normalizeFeeData(tiingoFees);
        feeDataMap.set(fund.ticker, feeData);
        console.log(`[pipeline] Tiingo fee data for ${fund.ticker}: ER=${tiingoFees.netExpenseRatio}, 12b-1=${tiingoFees.twelveb1Fee}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pipeline] Tiingo fee fetch failed for ${fund.ticker}: ${msg}`);
    }
    await delay(PIPELINE.API_CALL_DELAY_MS);

    // Score cost efficiency with Tiingo fee data (if available) + fund table ER as fallback
    const result = scoreCostEfficiency(fund.expense_ratio, fund.name, feeData);
    costResults.set(fund.ticker, result);
  }

  // ── Steps 8–9: Fetch momentum data + cross-sectional scoring ──
  // §4.6: Tiingo is PRIMARY for fund NAV/prices. FMP is FALLBACK.
  progress(8, 'Fetching price data (Tiingo primary, FMP fallback)');

  // Calculate date range: 13 months back (12 months + buffer)
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const fundMomentums: FundMomentum[] = [];

  for (const fund of funds) {
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
        hasData: false,
      });
    }
    await delay(PIPELINE.API_CALL_DELAY_MS);
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
      generatedAt: new Date().toISOString(),
      model: CLAUDE.THESIS_MODEL,
    };
    errors.push({ fund: 'ALL', step: 'thesis', error: msg });
  }

  // ── Step 12: Score Positioning factor ──
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

  for (const fund of funds) {
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

    fundScoreInputs.push({
      ticker: fund.ticker,
      name: fund.name,
      raw,
      factorDetails: {
        costEfficiency: cost,
        holdingsQuality: quality,
        positioning: { score: positioning.score, reasoning: positioning.reasoning },
        momentum,
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

  const scoring = scoreAndRankFunds(fundScoreInputs);

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
