/**
 * FundLens — Reference Tier: the allowlist serializer (B-series B2)
 *
 * THIS FILE IS THE SINGLE REVIEWABLE ARTIFACT FOR HR/LEGAL (plan §2
 * "Allowlist principle", §4). Everything a reference-tier account can ever
 * receive from the scores API is enumerated here, field by field. Nothing
 * reaches the reference tier by omission: a field not explicitly shaped in
 * this file is not sent, period.
 *
 * What reference accounts receive — facts only:
 *   - fund identity (ticker, name) and its expense ratio
 *   - raw trailing return figures (3/6/9/12 months, as reported)
 *   - what the fund holds: top holdings and full holdings rows
 *     (name / ticker / percent of fund / sector)
 *   - sector exposure (the inputs a concentration measure is computed from)
 *   - how many holdings the fund reported, and how many factors relied on
 *     fallback data
 *   - data coverage from the fund's Dossier: % of assets identified,
 *     % sector-classified, and whether the data-quality gate passed
 *   - the dates the data speaks as of: the SEC EDGAR filing's report date,
 *     the priced-as-of date, and when scoring ran
 *
 * What reference accounts can NEVER receive (excluded forever, plan §B2):
 *   - composite_default — the overall score
 *   - tier / tier_color — the Top Pick / Strong / Solid / ... badges
 *   - z_* — statistical standings of one fund against the others
 *   - the four factor scores (cost efficiency, holdings quality, momentum,
 *     positioning) and any per-holding scores
 *   - every evaluative string: reasoning text, rankings, percentile
 *     estimates, and the editorial fund summaries
 *
 * A neutral, Robert-reviewed summary field (summary_reference) is planned in
 * B7. It is NOT emitted by this file today. B7 adds the emission behind the
 * REFERENCE_SUMMARIES_ENABLED constant, which ships false — until that flag
 * is deliberately turned on after HR sign-off, reference payloads contain
 * zero AI-generated text.
 *
 * Pure shaping — no API calls, no database access, no stored state.
 * routes.ts calls these functions only when the requesting account's
 * access tier is 'reference'; full-tier responses do not pass through
 * this file and are byte-identical to their pre-B2 form.
 */

// ─── The allowlist ──────────────────────────────────────────────────────────
// Every key path a reference payload may contain. This list and the shaping
// code below are maintained together — the list is the contract, the code
// is the enforcement. (Notation: "returns.threeMonth" is the field
// threeMonth inside the returns object; "holdings[].name" is the field name
// on each row of the holdings array.)

export const REFERENCE_ALLOWLIST = [
  // Identity + cost
  'ticker',
  'name',
  'expense_ratio',
  // Raw trailing returns (decimals as reported, e.g. 0.042 = 4.2%)
  'returns.threeMonth',
  'returns.sixMonth',
  'returns.nineMonth',
  'returns.twelveMonth',
  // Sector exposure map (sector name → weight) — also the HHI inputs
  'sector_exposure',
  // Top holdings (from the scoring run's factual snapshot)
  'top_holdings[].name',
  'top_holdings[].ticker',
  'top_holdings[].sector',
  'top_holdings[].weight',
  // Full holdings rows (detail view; shaped from holdings_cache)
  'holdings[].name',
  'holdings[].ticker',
  'holdings[].pct',
  'holdings[].sector',
  // Counts
  'holdings_count',
  'fallback_count',
  // Dossier data-quality coverage
  'coverage.resolved_pct',
  'coverage.classified_pct',
  'coverage.passes_gate',
  // As-of dates
  'as_of.report_date',
  'as_of.priced_as_of',
  'as_of.scored_at',
] as const;

// ─── Input shapes (only the fields this file reads) ─────────────────────────
// Type note: these interfaces live here rather than in types.ts on the
// established precedent for module-local types consumed only by routes.ts
// (see the monitoring-types note in types.ts) — and it keeps B2 out of the
// v8-shared types.ts entirely (v8 Protection Law, plan §2).

/** Fund identity fields — satisfied by a funds row or the embedded
 *  funds(ticker, name, expense_ratio) object on a score row */
export interface ReferenceFundIdentity {
  ticker: string;
  name: string;
  expense_ratio: number | null;
}

/** The score-row fields this file reads. factor_details is the raw JSON
 *  blob; ONLY the factual keys named below are ever extracted from it. */
export interface ReferenceScoreSource {
  factor_details: Record<string, unknown>;
  scored_at: string;
}

/** The Dossier-row fields this file reads (fund_dossiers table) */
export interface ReferenceDossierSource {
  fund_id?: string;
  report_date: string | null;
  holdings_total: number;
  fallback_count: number;
  resolved_of_resolvable_pct: number;
  classified_pct: number;
  passes_gate: boolean;
}

/** A holdings_cache row, as served by the fund-detail route */
export interface ReferenceHoldingSource {
  name: string;
  ticker: string | null;
  pct_of_nav: number;
  sector: string | null;
}

// ─── Output shapes ──────────────────────────────────────────────────────────

export interface ReferenceFundView {
  ticker: string;
  name: string;
  expense_ratio: number | null;
  returns: {
    threeMonth: number | null;
    sixMonth: number | null;
    nineMonth: number | null;
    twelveMonth: number | null;
  };
  sector_exposure: Record<string, number>;
  top_holdings: Array<{
    name: string | null;
    ticker: string | null;
    sector: string | null;
    weight: number | null;
  }>;
  holdings_count: number | null;
  fallback_count: number | null;
  coverage: {
    resolved_pct: number;
    classified_pct: number;
    passes_gate: boolean;
  } | null;
  as_of: {
    /** SEC EDGAR N-PORT filing report date (null for money markets) */
    report_date: string | null;
    /** Prices as of the scoring run — no separate NAV date is stored, so
     *  this is scored_at, stated plainly (Robert's B2 Evidence Gate ruling,
     *  July 27, 2026: momentum pulls NAV prices up through the run date) */
    priced_as_of: string;
    scored_at: string;
  };
}

export interface ReferenceHoldingView {
  name: string;
  ticker: string | null;
  pct: number;
  sector: string | null;
}

// ─── Safe extraction from factor_details ────────────────────────────────────
// factor_details also contains scores, reasoning strings, rankings, and the
// editorial summary. These helpers reach ONLY for the factual keys and
// never copy anything else out of the blob.

function asObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Raw trailing returns from factor_details.momentum.returns — figures only */
function extractReturns(details: Record<string, unknown>): ReferenceFundView['returns'] {
  const momentum = asObject(details.momentum);
  const returns = momentum ? asObject(momentum.returns) : null;
  return {
    threeMonth: returns ? asNumberOrNull(returns.threeMonth) : null,
    sixMonth: returns ? asNumberOrNull(returns.sixMonth) : null,
    nineMonth: returns ? asNumberOrNull(returns.nineMonth) : null,
    twelveMonth: returns ? asNumberOrNull(returns.twelveMonth) : null,
  };
}

/** Sector → weight map from factor_details.sectorExposure — numbers only */
function extractSectorExposure(details: Record<string, unknown>): Record<string, number> {
  const raw = asObject(details.sectorExposure);
  const out: Record<string, number> = {};
  if (raw) {
    for (const [sector, weight] of Object.entries(raw)) {
      const n = asNumberOrNull(weight);
      if (n !== null) out[sector] = n;
    }
  }
  return out;
}

/** Top holdings from factor_details.topHoldings — the four factual fields */
function extractTopHoldings(details: Record<string, unknown>): ReferenceFundView['top_holdings'] {
  const raw = details.topHoldings;
  if (!Array.isArray(raw)) return [];
  const out: ReferenceFundView['top_holdings'] = [];
  for (const item of raw) {
    const h = asObject(item);
    if (!h) continue;
    out.push({
      name: asStringOrNull(h.name),
      ticker: asStringOrNull(h.ticker),
      sector: asStringOrNull(h.sector),
      weight: asNumberOrNull(h.weight),
    });
  }
  return out;
}

// ─── The serializers ────────────────────────────────────────────────────────

/**
 * Shape one fund for a reference-tier response.
 *
 * Everything emitted is listed in REFERENCE_ALLOWLIST above. The dossier may
 * be null (defensive: a fund missing its Dossier row still renders identity
 * and returns; coverage shows as null rather than invented numbers).
 */
export function shapeFundForReference(
  fund: ReferenceFundIdentity,
  score: ReferenceScoreSource,
  dossier: ReferenceDossierSource | null,
): ReferenceFundView {
  const details = asObject(score.factor_details) ?? {};

  return {
    ticker: fund.ticker,
    name: fund.name,
    expense_ratio: fund.expense_ratio,
    returns: extractReturns(details),
    sector_exposure: extractSectorExposure(details),
    top_holdings: extractTopHoldings(details),
    holdings_count: dossier ? dossier.holdings_total : null,
    fallback_count: dossier ? dossier.fallback_count : null,
    coverage: dossier
      ? {
          resolved_pct: dossier.resolved_of_resolvable_pct,
          classified_pct: dossier.classified_pct,
          passes_gate: dossier.passes_gate,
        }
      : null,
    as_of: {
      report_date: dossier ? dossier.report_date : null,
      priced_as_of: score.scored_at,
      scored_at: score.scored_at,
    },
  };
}

/**
 * Shape the full fund list for a reference-tier response.
 *
 * Output is sorted alphabetically by ticker — the server never returns a
 * ranking to a reference account (plan §1.2). Any ordering by cost or
 * returns happens only as the user's own click on a factual column.
 */
export function shapeFundListForReference(
  scoreRows: Array<ReferenceScoreSource & { fund_id: string; funds?: ReferenceFundIdentity | null }>,
  dossierRows: ReferenceDossierSource[],
): ReferenceFundView[] {
  const dossierByFund = new Map<string, ReferenceDossierSource>();
  for (const d of dossierRows) {
    if (d.fund_id) dossierByFund.set(d.fund_id, d);
  }

  const shaped: ReferenceFundView[] = [];
  for (const row of scoreRows) {
    // The embedded funds(ticker, name, expense_ratio) join must be present;
    // a row without it has no identity to show and is skipped rather than
    // emitted half-formed.
    if (!row.funds) continue;
    shaped.push(
      shapeFundForReference(row.funds, row, dossierByFund.get(row.fund_id) ?? null)
    );
  }

  shaped.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return shaped;
}

/**
 * Shape one holdings_cache row for the reference fund-detail response:
 * name, ticker, percent of fund, sector. Nothing else from the row.
 */
export function shapeHoldingForReference(row: ReferenceHoldingSource): ReferenceHoldingView {
  return {
    name: row.name,
    ticker: row.ticker,
    pct: row.pct_of_nav,
    sector: row.sector,
  };
}
