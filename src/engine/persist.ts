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

import { supaFetch, supaInsert, supaUpdate, supaDelete } from './supabase.js';
import { computeCompositeFromZScores } from './scoring.js';
import { DEFAULT_FACTOR_WEIGHTS } from './constants.js';
import type { FundRow, FundScoresRow } from './types.js';
import type { PipelineResult } from './pipeline.js';
import type { FundSummaryMap } from './fund-summaries.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of the persistence operation */
export interface PersistResult {
  scoresWritten: number;
  holdingsWritten: number;
  thesisSaved: boolean;
  errors: string[];
}

// ─── Placeholder CUSIP handling (A2.3 Task 1) ───────────────────────────────

/**
 * NPORT-P filings put the literal "N/A" in the CUSIP field for many foreign
 * holdings (verified in production July 2, 2026: RNWGX carried 273 distinct
 * companies all with cusip "N/A"). A placeholder CUSIP does NOT identify a
 * security — merging rows by it collapses distinct companies into one blob.
 * The EDGAR parser already drops empty and '000000000' CUSIPs, but persist
 * must be safe standalone, so all-zeros strings are treated as placeholders
 * here as well.
 */
function isPlaceholderCusip(cusip: string): boolean {
  const c = cusip.trim().toUpperCase();
  return c === 'N/A' || /^0+$/.test(c);
}

/**
 * Deterministic FNV-1a 32-bit hash, hex-encoded (8 characters).
 * No dependencies; same input → same output on every run, which keeps the
 * synthetic keys stable across the delete-then-insert persist flow.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Synthetic stored cusip for a placeholder-CUSIP row: "NA:" + name hash.
 * The unique index (fund_id, accession_number, cusip) needs distinct values
 * for distinct companies. The "NA:" prefix is visually obvious in Supabase
 * and, at 11 characters, cannot collide with a real 9-character CUSIP.
 * The cusip column is TEXT (no length limit — verified against the original
 * v6_full_schema.sql DDL), so no migration is required.
 */
function syntheticCusipForName(name: string): string {
  return `NA:${fnv1aHex(name.trim().toUpperCase())}`;
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
  funds: FundRow[],
  fundSummaries?: FundSummaryMap
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
      factor_details: {
        ...fundScore.factorDetails,
        fallbackCount: fundScore.fallbackCount,
        summary: fundSummaries?.[fundScore.ticker] ?? null,
      },
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

  // ── 3. Upsert holdings to holdings_cache (batched) ────────────────────
  // Write all resolved holdings for each fund so the UI can show
  // company-level drill-in (inline fund detail, sector donut drill).
  // Uses upsert on (fund_id, cusip) to avoid duplicates.
  // Batched per-fund: one Supabase call per fund instead of per holding.

  for (const [ticker, detail] of result.fundDetails) {
    const fund = funds.find(f => f.ticker === ticker);
    if (!fund) continue;

    const mappedRows = detail.holdings.map(holding => ({
      fund_id: fund.id,
      name: holding.name,
      cusip: holding.cusip,
      ticker: holding.ticker,
      pct_of_nav: holding.pctOfNav,
      value_usd: holding.valueUsd,
      asset_category: holding.assetCategory,
      country: holding.countryOfIssuer,
      sector: holding.sector,
      is_look_through: holding.isLookThrough,
      parent_fund_name: holding.parentFundName,
      accession_number: '',
      report_date: new Date().toISOString().slice(0, 10),
    }));

    // ── A2 Task 7 + A2.3 Task 1: merge duplicate lots within the batch ────
    // NPORT-P filings can list the same security more than once (multiple
    // lots). Two rows sharing (fund_id, accession_number, cusip) in one
    // insert violate idx_holdings_unique and abort the WHOLE batch — the
    // July 1 run's 9 persist errors, which also left those funds with no
    // holdings after the preceding delete (Principle 1: silent data gap).
    // Merge rule mirrors holdings.ts deduplicateHoldings: sum weights and
    // values, keep the first row's metadata (fill gaps from later rows).
    //
    // A2.3: rows with a PLACEHOLDER cusip ("N/A" — common for foreign
    // holdings) merge by holding NAME instead, so genuine multi-lot
    // duplicates still combine but distinct companies never do. They are
    // stored under a deterministic synthetic key ("NA:" + name hash) so
    // the post-merge distinct rows satisfy the unique index.
    const byKey = new Map<string, typeof mappedRows[number]>();
    for (const row of mappedRows) {
      const placeholder = isPlaceholderCusip(row.cusip);
      const key = placeholder ? `name:${row.name.trim().toUpperCase()}` : row.cusip;
      const existing = byKey.get(key);
      if (existing) {
        existing.pct_of_nav += row.pct_of_nav;
        existing.value_usd += row.value_usd;
        existing.name = existing.name || row.name;
        existing.ticker = existing.ticker || row.ticker;
        existing.sector = existing.sector || row.sector;
        existing.asset_category = existing.asset_category || row.asset_category;
        existing.country = existing.country || row.country;
      } else {
        byKey.set(key, {
          ...row,
          cusip: placeholder ? syntheticCusipForName(row.name) : row.cusip,
        });
      }
    }
    const rows = Array.from(byKey.values());
    if (rows.length < mappedRows.length) {
      console.log(
        `[persist] Holdings ${ticker}: merged ${mappedRows.length - rows.length} duplicate-CUSIP lots before insert`
      );
    }

    if (rows.length === 0) continue;

    // ── Holdings persist fix: Delete stale rows before inserting fresh ones ──
    // The unique index on holdings_cache is (fund_id, accession_number, cusip).
    // Old pipeline runs wrote rows with real accession numbers from EDGAR,
    // but the current pipeline always sets accession_number = ''. This means
    // upsert can't match old rows (different accession_number), creating
    // duplicates — and the API returns mixed stale (NULL sector) + fresh rows.
    // Fix: wipe all holdings for this fund first, then insert the fresh set.
    const { error: deleteError } = await supaDelete('holdings_cache', {
      fund_id: `eq.${fund.id}`,
    });
    if (deleteError) {
      console.warn(`[persist] Holdings ${ticker}: failed to delete stale rows — ${deleteError}`);
    }

    const { error } = await supaInsert('holdings_cache', rows, { upsert: true });

    if (!error) {
      holdingsWritten += rows.length;
    } else {
      errors.push(`Holdings ${ticker}: batch upsert failed — ${error}`);
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
