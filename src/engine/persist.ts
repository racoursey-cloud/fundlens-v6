/**
 * FundLens v6 — Pipeline Persistence Layer
 *
 * This is the bridge between the in-memory pipeline (pipeline.ts) and the
 * Supabase database. It takes the pipeline results and writes them to the
 * fund_scores, pipeline_runs, thesis_cache, and holdings_cache tables.
 *
 * This is Step 14 from Master Reference §8 — "Persist all scores and
 * metadata to Supabase."
 *
 * The pipeline itself is pure computation — it takes fund data, crunches
 * numbers, and returns results in memory. This module is what saves those
 * results so the React client can read them.
 *
 * Session 5 deliverable. Destination: src/engine/persist.ts
 * References: Master Reference §8 Step 14.
 */

import { supaFetch, supaInsert, supaUpdate } from './supabase.js';
import { computeCompositeFromZScores } from './scoring.js';
import { DEFAULT_FACTOR_WEIGHTS } from './constants.js';
import type { FundRow, FundScoresRow } from './types.js';
import type { PipelineResult } from './pipeline.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of the persistence operation */
export interface PersistResult {
  scoresWritten: number;
  holdingsWritten: number;
  thesisSaved: boolean;
  errors: string[];
}

// ─── Main Persistence Function ──────────────────────────────────────────────

/**
 * Persist pipeline results to Supabase.
 *
 * Called by the route handler (POST /api/pipeline/run) after the pipeline
 * finishes. Updates the pipeline_runs record, writes fund scores, saves
 * the macro thesis, and updates holdings sectors.
 *
 * @param runId The pipeline_runs UUID created before the run started
 * @param result The complete pipeline result from runFullPipeline()
 * @param funds The fund list used for this run
 */
export async function persistPipelineResults(
  runId: string,
  result: PipelineResult,
  funds: FundRow[]
): Promise<PersistResult> {
  const errors: string[] = [];
  let scoresWritten = 0;
  let holdingsWritten = 0;
  let thesisSaved = false;

  // ── 1. Write fund scores ──────────────────────────────────────────────
  // One row per fund, with all four factor scores + default composite.

  for (const fundScore of result.scoring.funds) {
    // Find the fund's UUID
    const fund = funds.find(f => f.ticker === fundScore.ticker);
    if (!fund) {
      errors.push(`Fund ${fundScore.ticker}: no matching fund row`);
      continue;
    }

    // Compute composite with default weights using z-scores + CDF (§2.1)
    const compositeDefault = computeCompositeFromZScores(fundScore.zScores, DEFAULT_FACTOR_WEIGHTS);

    const scoreRow = {
      fund_id: fund.id,
      pipeline_run_id: runId,
      cost_efficiency: fundScore.raw.costEfficiency,
      holdings_quality: fundScore.raw.holdingsQuality,
      positioning: fundScore.raw.positioning,
      momentum: fundScore.raw.momentum,
      // Z-scores for client-side rescore (Session 4, §2.1)
      z_cost_efficiency: fundScore.zScores.costEfficiency,
      z_holdings_quality: fundScore.zScores.holdingsQuality,
      z_positioning: fundScore.zScores.positioning,
      z_momentum: fundScore.zScores.momentum,
      composite_default: compositeDefault,
      tier: fundScore.tier,
      tier_color: fundScore.tierColor,
      factor_details: fundScore.factorDetails,
      scored_at: new Date().toISOString(),
    };

    const { error } = await supaInsert<FundScoresRow>('fund_scores', scoreRow);

    if (error) {
      errors.push(`Fund ${fundScore.ticker}: failed to write score — ${error}`);
    } else {
      scoresWritten++;
    }
  }

  // ── 2. Save macro thesis ──────────────────────────────────────────────
  // One row per pipeline run in thesis_cache for historical reference.

  const { error: thesisError } = await supaInsert('thesis_cache', {
    pipeline_run_id: runId,
    narrative: result.thesis.narrative,
    sector_preferences: result.thesis.sectorPreferences,
    key_themes: result.thesis.keyThemes,
    dominant_theme: result.thesis.dominantTheme || '',
    macro_stance: result.thesis.macroStance || 'mixed',
    risk_factors: result.thesis.riskFactors || [],
    model_used: result.thesis.model,
    generated_at: result.thesis.generatedAt,
  });

  if (thesisError) {
    errors.push(`Thesis: failed to save — ${thesisError}`);
  } else {
    thesisSaved = true;
  }

  // ── 3. Update holdings sectors ────────────────────────────────────────
  // The pipeline classified holdings into sectors (via Claude Haiku).
  // Update the holdings_cache rows with sector data so the UI can
  // show sector breakdowns without re-classifying.

  for (const [ticker, detail] of result.fundDetails) {
    const fund = funds.find(f => f.ticker === ticker);
    if (!fund) continue;

    for (const holding of detail.holdings) {
      if (!holding.sector) continue;

      // Update the holdings_cache row's sector field
      const { error } = await supaUpdate('holdings_cache', {
        sector: holding.sector,
      }, {
        fund_id: `eq.${fund.id}`,
        cusip: `eq.${holding.cusip}`,
      });

      if (!error) holdingsWritten++;
    }
  }

  // ── 4. Update pipeline_runs record ────────────────────────────────────
  // Mark the run as completed with stats.

  await supaUpdate('pipeline_runs', {
    status: 'completed',
    completed_at: new Date().toISOString(),
    funds_processed: result.stats.fundsProcessed,
    funds_succeeded: result.stats.fundsSucceeded,
    funds_failed: result.stats.fundsFailed,
    total_holdings: result.stats.totalHoldingsScored,
    duration_ms: result.stats.durationMs,
    errors: result.stats.errors,
  }, { id: `eq.${runId}` });

  console.log(
    `[persist] Saved: ${scoresWritten} scores, ` +
    `${holdingsWritten} holding sectors, ` +
    `thesis ${thesisSaved ? 'saved' : 'FAILED'}` +
    (errors.length > 0 ? `, ${errors.length} errors` : '')
  );

  return { scoresWritten, holdingsWritten, thesisSaved, errors };
}
