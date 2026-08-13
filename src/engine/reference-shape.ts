/**
 * FundLens — Reference Tier: the allowlist serializer (B-series B2)
 *
 * THIS FILE IS THE SINGLE REVIEWABLE ARTIFACT FOR HR/LEGAL (plan §2
 * "Allowlist principle", §4). Everything a reference-tier account can ever
 * receive is enumerated here, field by field. Nothing reaches the reference
 * tier by omission: a field not explicitly shaped in this file is not sent,
 * period.
 *
 * TWO SURFACES are enumerated below, each with its own allowlist:
 *   1. The scores API (B2) — REFERENCE_ALLOWLIST, the fund list and detail.
 *   2. The holding company panel (H2) — COMPANY_PANEL_ALLOWLIST, the FMP
 *      company profile served behind GET /api/holdings/company.
 * The second was added by the ratified H2 assignment (August 2, 2026), which
 * records that U1's "reference-shape.ts untouched" scope guard bound the U1
 * waves only, and that an explicit allowlist addition is the ratified path
 * under B2 law. Same discipline, one more surface.
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
 *   - the fund's own SEC-filed description (B9): Investment Objective and
 *     Principal Investment Strategies verbatim, with the filing's
 *     accession, series id, and prospectus date (conduit principle —
 *     their words, unchanged)
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
 * A neutral, Robert-reviewed summary field (summary_reference) is emitted by
 * this file behind the REFERENCE_SUMMARIES_ENABLED constant (constants.ts,
 * built in B7), which ships false. While the flag is false the key is absent
 * from every reference payload — not null, absent — and zero AI-generated
 * text reaches reference accounts. Emission begins only when Robert
 * deliberately flips the flag after HR sign-off.
 *
 * Pure shaping — no API calls, no database access, no stored state.
 * routes.ts calls these functions only when the requesting account's
 * access tier is 'reference'; full-tier responses do not pass through
 * this file and are byte-identical to their pre-B2 form.
 */

import { REFERENCE_SUMMARIES_ENABLED, REFERENCE_TRANSLATIONS_ENABLED } from './constants.js';

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
  // Neutral, Robert-reviewed summary (B7) — emitted only while
  // REFERENCE_SUMMARIES_ENABLED (constants.ts) is true
  'summary_reference',
  // SEC-filed description (B9) — verbatim filed text, emitted whenever the
  // fund_descriptions row exists (no flag: their words, served live)
  'description.objective_text',
  'description.strategies_text',
  'description.source_accession',
  'description.source_series_id',
  'description.filing_ddate',
  // Our plain-English translation (B9) — emitted only while
  // REFERENCE_TRANSLATIONS_ENABLED (constants.ts) is true
  'description.translation_text',
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
  /** B7: neutral summary text attached by routes.ts from the
   *  reference_summaries table — only fetched while
   *  REFERENCE_SUMMARIES_ENABLED is true; null when no row exists */
  summary_reference?: string | null;
  /** B9: the fund_descriptions row attached by routes.ts — the SEC-filed
   *  verbatim text plus the flag-gated translation; null when no row */
  description?: ReferenceDescriptionSource | null;
}

/** The fund_descriptions fields this file reads (B9) */
export interface ReferenceDescriptionSource {
  objective_text: string;
  strategies_text: string;
  source_accession: string;
  source_series_id: string;
  filing_ddate: string;
  translation_text: string | null;
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
  /** B7: present (string or null) only while REFERENCE_SUMMARIES_ENABLED is
   *  true; absent entirely — not null — while the flag is false */
  summary_reference?: string | null;
  /** B9: the SEC-filed description, emitted whenever the row exists (their
   *  words serve live — no flag); null when the fund has no stored row.
   *  translation_text inside it appears only while
   *  REFERENCE_TRANSLATIONS_ENABLED is true — absent, not null, otherwise. */
  description: {
    objective_text: string;
    strategies_text: string;
    source_accession: string;
    source_series_id: string;
    filing_ddate: string;
    translation_text?: string | null;
  } | null;
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
    // B7: conditional spread — flag true emits the key for every fund (null
    // where no reference_summaries row exists); flag false leaves the key
    // ABSENT from the object, not null (Fabio's ruling, July 30, 2026).
    ...(REFERENCE_SUMMARIES_ENABLED
      ? { summary_reference: fund.summary_reference ?? null }
      : {}),
    // B9: the SEC-filed description emits whenever the row exists — the
    // verbatim text is not flag-gated (conduit principle; ruling 5). The
    // translation key rides inside it ONLY while
    // REFERENCE_TRANSLATIONS_ENABLED is true; while false the key is
    // absent, not null, and zero AI text reaches reference payloads.
    description: fund.description
      ? {
          objective_text: fund.description.objective_text,
          strategies_text: fund.description.strategies_text,
          source_accession: fund.description.source_accession,
          source_series_id: fund.description.source_series_id,
          filing_ddate: fund.description.filing_ddate,
          ...(REFERENCE_TRANSLATIONS_ENABLED
            ? { translation_text: fund.description.translation_text ?? null }
            : {}),
        }
      : null,
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

// ═══════════════════════════════════════════════════════════════════════════
// H2 — THE HOLDING COMPANY PANEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The second allowlist. Everything the company panel may ever contain,
 * field by field — the nine fields the H2 assignment enumerates plus the
 * `source` literal that attributes them.
 *
 * WHY THIS LIST IS LOAD-BEARING: unlike the fund payload, whose source rows
 * are ours, the panel's source is a RAW VENDOR BLOB. fmp_cache.profile is
 * stored as FMP returns it, and FMP returns far more than this — verified in
 * production August 13, 2026: price, marketCap, beta, change,
 * changePercentage, range, lastDividend, volume, averageVolume, ceo,
 * fullTimeEmployees, phone, address, zip, image, and more. Every one of
 * those is either a moving number or an evaluative signal, and the ratified
 * assignment excludes them by name: "No price, no market cap, no ratings —
 * nothing that moves or evaluates."
 *
 * The enforcement is therefore a PICK, never a spread. shapeCompanyPanel
 * below names its nine keys one at a time; a field FMP adds tomorrow cannot
 * reach a member without an edit to this file.
 */
export const COMPANY_PANEL_ALLOWLIST = [
  'companyName',
  'description',
  'city',
  'country',
  'sector',
  'industry',
  'exchange',
  'website',
  'ipoDate',
  // Attribution literal — always the string 'fmp', never vendor-supplied
  'source',
] as const;

/** The raw fmp_cache.profile blob, as an untyped bag of keys. The shaper
 *  reads only the ten names above out of it and ignores the rest. */
export type CompanyProfileSource = Record<string, unknown>;

export interface CompanyPanelView {
  companyName: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  website: string | null;
  ipoDate: string | null;
  /** Attribution, set by this file — the panel always says where it came from */
  source: 'fmp';
}

/** Trimmed string, or null — an empty vendor string is absence, not a value */
function asTrimmedStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Shape one cached FMP profile into the company panel.
 *
 * Pure shaping — no API calls, no database access, no h6 judgment. The
 * caller (routes.ts) is responsible for the h6 name-agreement re-check
 * BEFORE calling this; a profile that disagrees with the filed holding name
 * must never be shaped at all.
 */
export function shapeCompanyPanel(profile: CompanyProfileSource): CompanyPanelView {
  return {
    companyName: asTrimmedStringOrNull(profile.companyName),
    description: asTrimmedStringOrNull(profile.description),
    city: asTrimmedStringOrNull(profile.city),
    country: asTrimmedStringOrNull(profile.country),
    sector: asTrimmedStringOrNull(profile.sector),
    industry: asTrimmedStringOrNull(profile.industry),
    exchange: asTrimmedStringOrNull(profile.exchange),
    website: asTrimmedStringOrNull(profile.website),
    ipoDate: asTrimmedStringOrNull(profile.ipoDate),
    source: 'fmp',
  };
}
