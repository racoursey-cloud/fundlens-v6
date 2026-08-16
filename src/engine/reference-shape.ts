/**
 * FundLens — Reference Tier: the allowlist serializer (B-series B2)
 *
 * THIS FILE IS THE SINGLE REVIEWABLE ARTIFACT FOR HR/LEGAL (plan §2
 * "Allowlist principle", §4). Everything a reference-tier account can ever
 * receive is enumerated here, field by field. Nothing reaches the reference
 * tier by omission: a field not explicitly shaped in this file is not sent,
 * period.
 *
 * THREE SURFACES are enumerated below, each with its own allowlist:
 *   1. The scores API (B2) — REFERENCE_ALLOWLIST, the fund list and detail.
 *   2. The holding company panel (H2) — COMPANY_PANEL_ALLOWLIST, the FMP
 *      company profile served behind GET /api/holdings/company.
 *   3. The cross-fund holdings search (H3) — HOLDINGS_SEARCH_ALLOWLIST, the
 *      response behind GET /api/holdings/search.
 * The second was added by the ratified H2 assignment (August 2, 2026), which
 * records that U1's "reference-shape.ts untouched" scope guard bound the U1
 * waves only, and that an explicit allowlist addition is the ratified path
 * under B2 law. The third is the same ratified path, taken again by the H3
 * assignment (August 15, 2026, ruling 4). Same discipline, one more surface
 * each time.
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
  // H4 ruling 1 (Robert, August 15, 2026): the honest card's two new facts.
  // industry is VENDOR-SOURCED ONLY — see vendorIndustry below; country is
  // the country of issuer as filed with the SEC. Nothing else moved: cusip,
  // value_usd, accession_number, is_look_through and every scoring field
  // stay excluded.
  'holdings[].industry',
  'holdings[].country',
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
  /** H4: the enrichment industry, which may be the vendor's or our own
   *  classifier's — never emitted without reading industry_source below. */
  industry?: string | null;
  /** 'fmp' (the vendor said so), 'haiku' (our nightly classifier decided),
   *  or null/absent (unclassified). persist.ts writes it per row. */
  industry_source?: string | null;
  /** Country of issuer, as filed with the SEC (persist.ts: countryOfIssuer) */
  country?: string | null;
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
  /** H4: present only where the VENDOR supplied it (ruling 2) */
  industry: string | null;
  /** H4: as filed */
  country: string | null;
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
 * THE INDUSTRY GATE (H4 ruling 2, Robert, August 15, 2026).
 *
 * A holding's industry is not always something we were told. persist.ts
 * stamps every row with where its industry came from: 'fmp' means the data
 * vendor said so; 'haiku' means our own nightly classifier decided it
 * (classify.ts sets that stamp); null means nobody classified it.
 *
 * The ruling: a member's card prints an industry line ONLY for 'fmp'.
 * Model-classified rows show no industry line at all — not an unlabelled
 * one, and not a labelled one either. So the gate lives HERE, at the
 * serializer, and a model's guess never leaves the building rather than
 * being filtered on the way to the screen.
 */
function vendorIndustry(row: {
  industry?: string | null;
  industry_source?: string | null;
}): string | null {
  return row.industry_source === 'fmp' ? row.industry ?? null : null;
}

/**
 * Shape one holdings_cache row for the reference fund-detail response:
 * name, ticker, percent of fund, sector, and — since H4 — the vendor's
 * industry where there is one and the filed country. Nothing else from the
 * row; the route reads the whole row (supaSelect defaults to every column)
 * and this function is what decides what a member sees.
 */
export function shapeHoldingForReference(row: ReferenceHoldingSource): ReferenceHoldingView {
  return {
    name: row.name,
    ticker: row.ticker,
    pct: row.pct_of_nav,
    sector: row.sector,
    industry: vendorIndustry(row),
    country: row.country ?? null,
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

// ═══════════════════════════════════════════════════════════════════════════
// H3 — THE CROSS-FUND HOLDINGS SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The third allowlist (H3 ruling 4, ratified August 15, 2026). Everything the
 * search response may ever contain, field by field, exactly as §5 t2 of the
 * assignment enumerates it.
 *
 * WHY THIS LIST IS LOAD-BEARING: the source rows are holdings_cache rows, and
 * a holdings_cache row carries a great deal this response must never ship —
 * cusip, value_usd, accession_number, is_look_through, asset_category,
 * parent_fund_name, exchange, average_volume, momentum_eligible, is_adr,
 * industry_source. Every one of them stays out, by the principle that governs
 * this whole file: a field not shaped here is not sent.
 *
 * H4 ruling 3 (Robert, August 15, 2026) — SEARCH PARITY. H3 §5 t2 excluded
 * sector, industry and country "forever unless separately ruled." This is
 * that separate ruling, and only that: those three join the list so a card
 * opened from a search result carries what a card opened from a holding row
 * carries. The other four names H3 excluded — cusip, value_usd,
 * accession_number, is_look_through — are untouched by it and remain out.
 * industry ships through the same vendor-only gate as everywhere else.
 *
 * Enforcement is a PICK, never a spread: shapeHoldingsSearch below names every
 * key it emits, one at a time, so a column added to holdings_cache tomorrow
 * cannot reach a member without an edit to this file.
 */
export const HOLDINGS_SEARCH_ALLOWLIST = [
  // The search string, echoed back trimmed
  'query',
  // One entry per company matched
  'companies[].companyName',
  'companies[].displayTicker',
  // H4 ruling 3: the honest card's facts, taken from the same largest filed
  // row that names the group. industry is vendor-sourced only (ruling 2).
  'companies[].sector',
  'companies[].industry',
  'companies[].country',
  // The funds in the plan that file that company, largest position first
  'companies[].funds[].fundTicker',
  'companies[].funds[].fundName',
  'companies[].funds[].pctOfNav',
  'companies[].funds[].reportDate',
] as const;

/** At most this many companies ship in one response (assignment §5 t3). */
export const HOLDINGS_SEARCH_COMPANY_CAP = 20;

/**
 * One matched holdings_cache row with its fund joined on, as the search route
 * reads it. `funds` is the embedded to-one relation — PostgREST joins it in
 * SQL, which is the v17 law; this file never matches rows to funds itself.
 */
export interface HoldingsSearchRowSource {
  /** The holding name as filed */
  name: string;
  /** holdings_cache.ticker — the H1-F2 VOUCHED display ticker, or null */
  ticker: string | null;
  /** Percent of the fund's NAV, whole-percent units (0.1442 = 0.1442%) */
  pct_of_nav: number;
  report_date: string | null;
  /** H4 ruling 3: the card's facts. industry_source is read to enforce the
   *  vendor-only gate and is never emitted. */
  sector?: string | null;
  industry?: string | null;
  industry_source?: string | null;
  country?: string | null;
  funds: { ticker: string; name: string } | null;
}

export interface HoldingsSearchFundView {
  fundTicker: string;
  fundName: string;
  pctOfNav: number;
  reportDate: string | null;
}

export interface HoldingsSearchCompanyView {
  companyName: string;
  /** Nullable by design: a third of filed rows carry no vouched ticker */
  displayTicker: string | null;
  /** H4 ruling 3 — from the largest filed row in the group, the same row
   *  that gives the group its name. industry is vendor-sourced only. */
  sector: string | null;
  industry: string | null;
  country: string | null;
  funds: HoldingsSearchFundView[];
}

export interface HoldingsSearchView {
  query: string;
  companies: HoldingsSearchCompanyView[];
}

/**
 * Shape the matched rows into the search response.
 *
 * Pure shaping — no API calls, no database access, no vendor round trips.
 * The route reads and joins; this decides what a member sees.
 *
 * GROUPING (assignment §7-c, forced by the evidence): the key is the display
 * ticker where there is one, else the exact filed name. Dollar General is the
 * case that ruled it — VADFX files "Dollar General Corp." and FXAIX files
 * "DOLLAR GEN CORP NEW", both under DG, and a member asking "do I own any
 * Dollar General" is owed one answer, not two. The cost, accepted and honest
 * to the filings: a company with no vouched ticker filed under two spellings
 * shows as two results.
 *
 * THREE THINGS THE ORDER LEFT OPEN, DECIDED HERE AND DISCLOSED:
 *
 *   1. The name shown for a group is the one filed by its LARGEST holder.
 *      Grouping on a ticker can gather two spellings; something has to be
 *      displayed, and the biggest position's filed name is deterministic and
 *      real. It is also the name that rides to the company panel, where the
 *      server's h6 guard checks it against the vendor profile — so it must be
 *      a name a fund actually filed, never a synthesis of several.
 *
 *   2. A fund that files one company across SEVERAL rows contributes ONE
 *      line, at the sum of those rows. MWTSX files eight separate Oracle
 *      bonds; eight identical-looking lines would read as a bug and answer a
 *      question nobody asked. The sum is that fund's own filed exposure to
 *      that company — the same arithmetic My Mix already does when it adds a
 *      holding's contributions across funds. Short rows are summed as filed,
 *      sign included; nothing is dropped for being negative.
 *
 *   3. Companies are ordered by their largest single position, descending —
 *      the order the rows already arrive in. Within a company, its funds are
 *      ordered the same way, which §5 t3 does rule.
 *
 * A row whose fund did not join is skipped: without the fund there is nothing
 * truthful to say about where the company is held.
 */
export function shapeHoldingsSearch(
  query: string,
  rows: HoldingsSearchRowSource[],
): HoldingsSearchView {
  interface Group {
    companyName: string;
    displayTicker: string | null;
    /** H4: the card's facts, carried from whichever row currently names the
     *  group. Grouping can gather rows from several funds that disagree —
     *  vendor and filing noise is ordinary — and decision 1 already settles
     *  that class of tie in favour of the largest filed position. These
     *  three travel with the name so the card and the heading can never
     *  describe two different rows. */
    sector: string | null;
    industry: string | null;
    country: string | null;
    /** Largest single filed row in the group — sets the name and the order */
    topRowPct: number;
    /** fund ticker → the accumulating line for that fund */
    byFund: Map<string, HoldingsSearchFundView>;
  }

  const groups = new Map<string, Group>();

  for (const row of rows) {
    if (!row.funds) continue;

    const displayTicker = row.ticker ? row.ticker.trim().toUpperCase() : null;
    // §7-c: the display ticker where there is one, else the exact filed name.
    // The prefix keeps a ticker group and a name group from ever colliding.
    const key = displayTicker ? `T:${displayTicker}` : `N:${row.name}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        companyName: row.name,
        displayTicker,
        sector: row.sector ?? null,
        industry: vendorIndustry(row),
        country: row.country ?? null,
        topRowPct: row.pct_of_nav,
        byFund: new Map(),
      };
      groups.set(key, group);
    } else if (row.pct_of_nav > group.topRowPct) {
      // A bigger position renames the group — decision 1 above — and brings
      // its own three facts with it (H4).
      group.companyName = row.name;
      group.sector = row.sector ?? null;
      group.industry = vendorIndustry(row);
      group.country = row.country ?? null;
      group.topRowPct = row.pct_of_nav;
    }

    const line = group.byFund.get(row.funds.ticker);
    if (line) {
      line.pctOfNav += row.pct_of_nav; // decision 2 above
    } else {
      group.byFund.set(row.funds.ticker, {
        fundTicker: row.funds.ticker,
        fundName: row.funds.name,
        pctOfNav: row.pct_of_nav,
        reportDate: row.report_date,
      });
    }
  }

  const companies: HoldingsSearchCompanyView[] = [...groups.values()]
    .sort((a, b) => b.topRowPct - a.topRowPct)
    .slice(0, HOLDINGS_SEARCH_COMPANY_CAP)
    .map(group => ({
      companyName: group.companyName,
      displayTicker: group.displayTicker,
      sector: group.sector,
      industry: group.industry,
      country: group.country,
      funds: [...group.byFund.values()].sort((a, b) => b.pctOfNav - a.pctOfNav),
    }));

  return { query, companies };
}
