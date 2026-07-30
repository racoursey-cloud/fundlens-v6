/**
 * FundLens — Example Mix composite math (B-series B5 c2)
 *
 * Informational composite math only — this module never recommends,
 * compares against any target, or scores a mix. Pure functions: no API
 * calls, no localStorage, and nothing imported from allocation.ts.
 *
 * Inputs:
 *   - the funds list as returned by GET /api/funds (full fund rows). This
 *     is the only client-side source of fund_id — the reference payload
 *     carries ticker but no id — so this engine joins id to ticker here.
 *   - the reference fund views (the tier-shaped payload from
 *     src/engine/reference-shape.ts): expense_ratio, sector_exposure,
 *     top_holdings with name/ticker/sector/weight.
 *   - the mix, either as a { fund_id: pct } map or as the same
 *     [{ fund_id, pct }] array shape the server stores.
 *
 * UNIT FINDINGS (verified against the existing reference grid/detail code
 * and the pipeline that writes the payload — July 30, 2026):
 *   - expense_ratio is a FRACTION (0.0023 means 0.23%). The reference grid
 *     renders it as (er × 100) percent, and its tooltip renders dollars as
 *     er × 10,000 per year per $10,000 invested. This module returns both
 *     registers in that same convention.
 *   - sector_exposure values are on the 0–100 PERCENT scale per fund: the
 *     pipeline sums holdings' pct_of_nav (whole-percent units) per sector,
 *     money markets carry { "Cash & Equivalents": 100 }, and the reference
 *     detail passes the map straight into DonutChart, whose contract is
 *     0–100 (FSPGX wave c4 ruling: pass through, never multiply). The map
 *     covers only sector-classified holdings, so a fund's values can sum
 *     to less than 100 — each fund is normalized within itself below.
 *   - top_holdings[].weight is on the same 0–100 percent-of-fund scale
 *     (the pipeline maps pct_of_nav rounded to one decimal).
 *   - mix pcts are on the 0–100 scale (the server requires them to sum to
 *     100 ± 0.05).
 */

import { computeHHI } from '../utils/hhi';
import { MONEY_MARKET_TICKERS } from '../pages/reference/constants';
import type { Fund, ReferenceFund } from '../api';

// ─── Input and output shapes ───────────────────────────────────────────────

/** One line of the mix, as the server stores it */
export interface ExampleMixEntry {
  fund_id: string;
  pct: number;
}

/** The mix: either the stored array shape or a { fund_id: pct } map */
export type ExampleMixInput = ExampleMixEntry[] | Record<string, number>;

/** One holding aggregated across the chosen funds */
export interface ExampleMixHolding {
  /** Grouping key: the holding's ticker, or its exact name when ticker is null */
  key: string;
  name: string | null;
  ticker: string | null;
  /** Percent of the whole mix (0–100 scale): sum over the funds that hold
   *  it of (fund's mix pct ÷ 100) × the holding's weight in that fund */
  combined_weight_pct: number;
  /** Every appearance across the chosen funds' top_holdings lists */
  appears_in: Array<{
    fund_ticker: string;
    /** The holding's weight inside that fund (0–100 percent-of-fund) */
    weight_in_fund_pct: number;
    /** That appearance's share of the whole mix (0–100 scale) */
    contribution_pct: number;
  }>;
}

export interface ExampleMixResult {
  /** Pct-weighted average expense ratio over funds with a known ratio,
   *  as a percent (0.23 means 0.23%); null when no chosen fund has one */
  blended_expense_ratio_pct: number | null;
  /** The same blend as dollars per year per $10,000 invested — the
   *  reference grid tooltip convention (fraction × 10,000, unrounded) */
  blended_expense_dollars_per_10k: number | null;
  /** Share of the mix (in pct, 0–100) whose expense ratio is known, so
   *  the UI can state plainly when part of the mix has no ratio on file */
  expense_ratio_known_mix_pct: number;
  /** Weighted look-through sector exposure on the 0–100 mix scale. Each
   *  fund's sector map is normalized within that fund, then weighted by
   *  its mix pct. Funds with no sector data appear whole under the
   *  "Money market" or "No sector data" bucket — never dropped. */
  sector_exposure_pct: Record<string, number>;
  /** All aggregated holdings, sorted by combined weight descending */
  holdings: ExampleMixHolding[];
  /** Holdings appearing in two or more chosen funds, same order */
  overlaps: ExampleMixHolding[];
  /** Herfindahl-Hirschman Index (0–1 scale, from utils/hhi.ts) over
   *  exactly the sector_exposure_pct map above, buckets included — the
   *  donut and the HHI describe the same picture */
  hhi: number | null;
}

// ─── The bucket names for funds with no sector data ────────────────────────

export const MONEY_MARKET_BUCKET = 'Money market';
export const NO_SECTOR_DATA_BUCKET = 'No sector data';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Normalize either accepted mix shape into the stored array shape.
 *  Lines with a non-finite or non-positive pct contribute nothing to any
 *  output, so they are dropped here once. */
function toEntries(mix: ExampleMixInput): ExampleMixEntry[] {
  const entries = Array.isArray(mix)
    ? mix
    : Object.entries(mix).map(([fund_id, pct]) => ({ fund_id, pct }));
  return entries.filter(e => Number.isFinite(e.pct) && e.pct > 0);
}

// ─── The composite ─────────────────────────────────────────────────────────

/**
 * Compute the factual composite view of an example mix.
 *
 * A fund_id that cannot be resolved to a ticker, or a ticker with no
 * reference view, is treated as having no known expense ratio and no
 * sector data — its full mix weight lands in a bucket rather than being
 * silently renormalized away.
 */
export function computeExampleMix(
  funds: Fund[],
  referenceFunds: ReferenceFund[],
  mix: ExampleMixInput,
): ExampleMixResult {
  const entries = toEntries(mix);

  const tickerById = new Map<string, string>(funds.map(f => [f.id, f.ticker]));
  const viewByTicker = new Map<string, ReferenceFund>(
    referenceFunds.map(v => [v.ticker, v]),
  );

  // ── 1. Blended expense ratio ─────────────────────────────────────────────
  // Pct-weighted average over the funds whose ratio is known, plus the
  // share of the mix that average actually covers.
  let knownPct = 0;
  let weightedRatioSum = 0; // Σ pct × expense_ratio (ratio as a fraction)

  // ── 2. Weighted look-through sector exposure ─────────────────────────────
  const sectorExposurePct: Record<string, number> = {};

  // ── 3. Aggregated top holdings ───────────────────────────────────────────
  const holdingsByKey = new Map<string, ExampleMixHolding>();

  for (const { fund_id, pct } of entries) {
    const ticker = tickerById.get(fund_id);
    const view = ticker !== undefined ? viewByTicker.get(ticker) : undefined;

    // 1. Expense ratio (fraction; see unit findings)
    const er = view?.expense_ratio ?? null;
    if (er !== null) {
      knownPct += pct;
      weightedRatioSum += pct * er;
    }

    // 2. Sectors: normalize the fund's map within itself, weight by mix pct
    const sectorPairs = Object.entries(view?.sector_exposure ?? {}).filter(
      ([, v]) => Number.isFinite(v) && v > 0,
    );
    const fundSectorTotal = sectorPairs.reduce((acc, [, v]) => acc + v, 0);
    if (fundSectorTotal > 0) {
      for (const [sector, value] of sectorPairs) {
        sectorExposurePct[sector] =
          (sectorExposurePct[sector] ?? 0) + pct * (value / fundSectorTotal);
      }
    } else {
      // No sector data: the fund's entire mix weight goes to an explicit
      // bucket — a 50% money-market line shows as 50%, never renormalized
      // away. An unresolvable fund_id cannot be identified as a money
      // market, so it lands in the no-data bucket.
      const bucket =
        ticker !== undefined && MONEY_MARKET_TICKERS.has(ticker)
          ? MONEY_MARKET_BUCKET
          : NO_SECTOR_DATA_BUCKET;
      sectorExposurePct[bucket] = (sectorExposurePct[bucket] ?? 0) + pct;
    }

    // 3. Holdings: combined weight = (mix pct ÷ 100) × weight-in-fund.
    //    Group by ticker, falling back to the exact name when ticker is
    //    null. A row with neither identity, or with a null weight, carries
    //    nothing that can be grouped or combined and is skipped.
    if (view) {
      for (const h of view.top_holdings) {
        const key = h.ticker ?? h.name;
        if (key === null || h.weight === null) continue;
        const contribution = (pct / 100) * h.weight;

        let agg = holdingsByKey.get(key);
        if (!agg) {
          agg = {
            key,
            name: h.name,
            ticker: h.ticker,
            combined_weight_pct: 0,
            appears_in: [],
          };
          holdingsByKey.set(key, agg);
        }
        if (agg.name === null && h.name !== null) agg.name = h.name;
        agg.combined_weight_pct += contribution;
        agg.appears_in.push({
          fund_ticker: view.ticker,
          weight_in_fund_pct: h.weight,
          contribution_pct: contribution,
        });
      }
    }
  }

  const holdings = Array.from(holdingsByKey.values()).sort(
    (a, b) =>
      b.combined_weight_pct - a.combined_weight_pct ||
      a.key.localeCompare(b.key),
  );

  // Overlap: the same holding held through two or more DISTINCT chosen
  // funds (a duplicate row inside one fund's own list is not an overlap).
  const overlaps = holdings.filter(
    h => new Set(h.appears_in.map(a => a.fund_ticker)).size >= 2,
  );

  // ── 4. HHI over exactly the sector map above, buckets included ───────────
  // computeHHI normalizes its input internally, so the 0–100 mix scale
  // feeds it directly.
  const hhi = computeHHI(
    Object.keys(sectorExposurePct).length > 0 ? sectorExposurePct : undefined,
  );

  const blendedFraction = knownPct > 0 ? weightedRatioSum / knownPct : null;

  return {
    blended_expense_ratio_pct: blendedFraction !== null ? blendedFraction * 100 : null,
    blended_expense_dollars_per_10k:
      blendedFraction !== null ? blendedFraction * 10_000 : null,
    expense_ratio_known_mix_pct: knownPct,
    sector_exposure_pct: sectorExposurePct,
    holdings,
    overlaps,
    hhi,
  };
}
