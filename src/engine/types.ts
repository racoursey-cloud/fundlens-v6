/**
 * FundLens v6 — Engine Types
 *
 * Shared TypeScript interfaces for the scoring engine, holdings pipeline,
 * and data layer. Every module imports types from here — no inline type
 * definitions in engine files.
 *
 * Session 2 deliverable. Covers: EDGAR holdings, OpenFIGI resolution,
 * holdings pipeline, fund metadata, and Supabase row shapes.
 */

// ─── EDGAR NPORT-P Types ────────────────────────────────────────────────────

/** Raw holding extracted from an NPORT-P XML filing */
export interface EdgarHolding {
  /** Security name as reported in filing (max 150 chars) */
  name: string;
  /** 9-character CUSIP identifier */
  cusip: string;
  /** ISIN if present in filing (12 chars) */
  isin: string | null;
  /** Legal Entity Identifier if present */
  lei: string | null;
  /** Security title */
  title: string;
  /** Value in USD */
  valueUsd: number;
  /** Percentage of fund net assets (0.0–1.0 scale, e.g. 0.07 = 7%) */
  pctOfNav: number;
  /** SEC asset category code */
  assetCategory: string | null;
  /** Issuer category (e.g. "CORP", "UST", "MUN") */
  issuerCategory: string | null;
  /** Number of shares/units held */
  balance: number | null;
  /** Units type: "NS" (number of shares), "PA" (principal amount), etc. */
  balanceUnits: string | null;
  /** Country of issuer (ISO 2-letter code) */
  countryOfIssuer: string | null;
  /** Whether this holding is itself a fund (for fund-of-funds detection) */
  isInvestmentCompany: boolean;
}

/** Metadata extracted from the NPORT-P filing header */
export interface EdgarFilingMeta {
  /** Fund CIK number (Central Index Key) */
  cik: string;
  /** Fund registrant name */
  registrantName: string;
  /** Fund series ID (e.g. S000002140) */
  seriesId: string;
  /** Fund series name */
  seriesName: string;
  /** Filing date (ISO string) */
  filingDate: string;
  /** Report date / period end (ISO string) */
  reportDate: string;
  /** Accession number (e.g. 0001752724-24-068719) */
  accessionNumber: string;
  /** Total net assets of the fund in USD */
  totalNetAssets: number | null;
  /** Expense ratio if available from filing */
  expenseRatio: number | null;
}

/** Complete parsed result from an NPORT-P filing */
export interface EdgarFilingResult {
  meta: EdgarFilingMeta;
  holdings: EdgarHolding[];
  /** Total number of holdings in the filing (before any cutoff) */
  totalHoldingsCount: number;
}

/** Entry from SEC's company_tickers_mf.json for ticker→CIK lookup */
export interface MutualFundTickerEntry {
  cik: number;
  seriesId: string;
  classId: string;
  symbol: string;
}

// ─── OpenFIGI Types ─────────────────────────────────────────────────────────

/** Single job in an OpenFIGI batch request */
export interface FigiMappingJob {
  idType: 'ID_CUSIP';
  idValue: string;
}

/** Single result from OpenFIGI mapping response */
export interface FigiResult {
  figi: string;
  ticker: string;
  name: string;
  securityType: string;
  securityType2?: string;
  exchCode: string;
  compositeFigi?: string;
  shareClassFigi?: string;
  marketSector: string;
}

/** Resolved CUSIP→ticker mapping */
export interface CusipResolution {
  cusip: string;
  ticker: string | null;
  name: string | null;
  securityType: string | null;
  /** True if OpenFIGI returned a match */
  resolved: boolean;
  /** Warning message if resolution failed */
  warning: string | null;
}

// ─── Holdings Pipeline Types ────────────────────────────────────────────────

/** A holding after EDGAR parsing + CUSIP resolution + cutoff applied */
export interface ResolvedHolding {
  /** Security name from EDGAR */
  name: string;
  /** CUSIP from EDGAR */
  cusip: string;
  /** Resolved ticker from OpenFIGI (null if unresolved) */
  ticker: string | null;
  /** Percentage of fund net assets (0.0–1.0) */
  pctOfNav: number;
  /** Value in USD */
  valueUsd: number;
  /** SEC asset category */
  assetCategory: string | null;
  /** Country of issuer */
  countryOfIssuer: string | null;
  /** Sector classification (populated later by Claude Haiku) */
  sector: string | null;
  /** Whether this is a look-through holding from a sub-fund */
  isLookThrough: boolean;
  /** If look-through, the parent fund's name */
  parentFundName: string | null;
}

/** Result of the holdings pipeline for a single fund */
export interface HoldingsPipelineResult {
  /** Fund ticker (e.g. "VFIAX") */
  fundTicker: string;
  /** EDGAR filing metadata */
  filingMeta: EdgarFilingMeta;
  /** Holdings after cutoff + resolution (ready for scoring) */
  holdings: ResolvedHolding[];
  /** Coverage stats */
  coverage: {
    /** Number of holdings included after cutoff */
    holdingsIncluded: number;
    /** Total holdings in original filing */
    holdingsTotal: number;
    /** Cumulative weight of included holdings (0.0–1.0) */
    weightCovered: number;
    /** Which cutoff was hit: "weight" (65%) or "count" (50) */
    cutoffReason: 'weight' | 'count';
  };
  /** Fund-of-funds detection */
  fundOfFunds: {
    /** Whether any sub-fund holdings were detected */
    detected: boolean;
    /** Names of sub-funds that were looked through */
    subFundNames: string[];
    /** Number of look-through holdings added */
    lookThroughCount: number;
  };
  /** CUSIPs that failed OpenFIGI resolution */
  unresolvedCusips: string[];
  /** Timestamp of pipeline run */
  processedAt: string;
}

// ─── Supabase Row Types (match DB schema) ───────────────────────────────────

/** Row in the `funds` table */
export interface FundRow {
  id: string;
  ticker: string;
  name: string;
  cik: string;
  series_id: string;
  expense_ratio: number | null;
  /** Whether this fund is in the active 401k menu */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row in the `holdings_cache` table */
export interface HoldingsCacheRow {
  id: string;
  fund_id: string;
  /** EDGAR accession number this holding came from */
  accession_number: string;
  /** EDGAR report period date */
  report_date: string;
  /** Holding name from EDGAR */
  name: string;
  cusip: string;
  /** Resolved ticker (null if unresolved) */
  ticker: string | null;
  /** Percentage of fund NAV (0.0–1.0) */
  pct_of_nav: number;
  /** Value in USD */
  value_usd: number;
  asset_category: string | null;
  country: string | null;
  /** Sector from Claude Haiku classification */
  sector: string | null;
  /** True if this is a look-through from a sub-fund */
  is_look_through: boolean;
  parent_fund_name: string | null;
  created_at: string;
}

/** Row in the `cusip_cache` table — persistent CUSIP→ticker mappings */
export interface CusipCacheRow {
  cusip: string;
  ticker: string | null;
  name: string | null;
  security_type: string | null;
  resolved: boolean;
  resolved_at: string;
}

/** Row in the `pipeline_runs` table — tracks pipeline execution history */
export interface PipelineRunRow {
  id: string;
  fund_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  /** Which pipeline step failed (null if success) */
  failed_step: string | null;
  error_message: string | null;
  /** Coverage stats as JSON */
  coverage_stats: Record<string, unknown> | null;
}

// ─── Scoring Types (Preview — full implementation in Session 3) ─────────────

/** Raw factor scores for a fund (before user weighting) */
export interface RawFactorScores {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

/** User's custom factor weights */
export interface UserFactorWeights {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

// ─── Utility Types ──────────────────────────────────────────────────────────

/** Standard result wrapper for pipeline operations */
export interface PipelineStepResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  /** Duration of this step in milliseconds */
  durationMs: number;
}

/** Delay helper — used to enforce sequential API calls */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
