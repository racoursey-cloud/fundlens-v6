/**
 * FundLens v6 — Master Constants
 *
 * Single source of truth for all thresholds, factor weights, API endpoints,
 * and configuration values. Carried forward from v5.1 with rebuild refinements.
 *
 * References: Master Reference Document, Sections 4-6, 8, 10
 */

// ─── Factor Weights (defaults — users can customize in profile) ──────────────
// SESSION 1: Corrected per spec §2.2 — Momentum 25%, Positioning 20%
// (Previously swapped: positioning was 0.25, momentum was 0.20)
export const DEFAULT_FACTOR_WEIGHTS = {
  costEfficiency: 0.25,
  holdingsQuality: 0.30,
  momentum: 0.25,
  positioning: 0.20,
} as const;

// ─── Holdings Coverage Thresholds ────────────────────────────────────────────
// Walk down holdings by weight (largest first). Stop when either threshold hit.
export const HOLDINGS_COVERAGE = {
  /** Stop when cumulative weight reaches this percentage.
   *  NPORT-P pctVal is reported as whole percentages (e.g. 4.89 = 4.89%),
   *  so this threshold must also be in whole-percentage units. */
  TARGET_WEIGHT_PCT: 65,
  /** Hard cap on number of holdings to analyze per fund */
  MAX_HOLDINGS: 50,
} as const;

// ─── Risk Tolerance (7-Point Kelly Scale, Spec §3.4, §6.4) ─────────────────
// Affects allocation sizing only, NOT scoring. Same scores, different position sizes.
// The k values are non-linearly spaced — tighter at conservative end, wider at aggressive.
export const KELLY_RISK_TABLE = [
  { level: 1, label: 'Very Conservative',     kellyFraction: 0.15, k: 0.30 },
  { level: 2, label: 'Conservative',          kellyFraction: 0.22, k: 0.50 },
  { level: 3, label: 'Moderate-Conservative',  kellyFraction: 0.30, k: 0.70 },
  { level: 4, label: 'Moderate',               kellyFraction: 0.40, k: 0.95 },
  { level: 5, label: 'Moderate-Aggressive',    kellyFraction: 0.50, k: 1.20 },
  { level: 6, label: 'Aggressive',             kellyFraction: 0.65, k: 1.50 },
  { level: 7, label: 'Very Aggressive',        kellyFraction: 0.80, k: 1.85 },
] as const;

/** Default risk level (Moderate = 4) */
export const DEFAULT_RISK_LEVEL = 4;
/** Min/max risk tolerance values */
export const RISK_MIN = 1;
export const RISK_MAX = 7;

// Legacy compatibility — kept for any code referencing the old shape
export const RISK_LEVELS = {
  CONSERVATIVE: 'conservative',
  MODERATE: 'moderate',
  AGGRESSIVE: 'aggressive',
} as const;

export type RiskLevel = typeof RISK_LEVELS[keyof typeof RISK_LEVELS];

// ─── Tier Badges (Spec §6.3) ────────────────────────────────────────────────
// Derived from MAD-based modified z-score in allocation engine.
export const TIER_BADGES = [
  { tier: 'BREAKAWAY',    zMin: 2.0,   color: '#F59E0B', label: 'Breakaway' },
  { tier: 'STRONG',       zMin: 1.2,   color: '#10B981', label: 'Strong' },
  { tier: 'SOLID',        zMin: 0.3,   color: '#3B82F6', label: 'Solid' },
  { tier: 'NEUTRAL',      zMin: -0.5,  color: '#6B7280', label: 'Neutral' },
  { tier: 'WEAK',         zMin: -Infinity, color: '#EF4444', label: 'Weak' },
] as const;

/** Special tier badges (not z-score-based) */
export const SPECIAL_TIERS = {
  MONEY_MARKET: { tier: 'MONEY_MARKET', color: '#4B5563', label: 'MM' },
  LOW_DATA:     { tier: 'LOW_DATA',     color: '#4B5563', label: 'Low Data' },
} as const;

// ─── Score Display Colors (Spec §6.2) ───────────────────────────────────────
export const SCORE_COLORS = {
  GREEN:  { min: 75, color: '#10B981' },
  BLUE:   { min: 50, color: '#3B82F6' },
  AMBER:  { min: 25, color: '#F59E0B' },
  RED:    { min: 0,  color: '#EF4444' },
} as const;

// ─── Allocation Engine Constants (Spec §3) ──────────────────────────────────
export const ALLOCATION = {
  /** MAD consistency constant (1/Φ⁻¹(0.75)) — makes MAD comparable to stdev for normal distributions */
  MAD_CONSISTENCY: 0.6745,
  /** De minimis floor — positions below this are dropped (spec §3.5) */
  DE_MINIMIS_PCT: 0.05,
  /** Quality gate: funds with this many or more fallbacks are excluded */
  QUALITY_GATE_MAX_FALLBACKS: 4,
} as const;

// ─── FRED Commodity Series (Spec §4.4) ──────────────────────────────────────
export const FRED_COMMODITY_SERIES = {
  WTI_CRUDE: 'DCOILWTICO',
  BRENT_CRUDE: 'DCOILBRENTEU',
  GOLD: 'GOLDAMGBD228NLBM',
  DOLLAR_INDEX: 'DTWEXBGS',
} as const;

// ─── Claude AI Configuration ─────────────────────────────────────────────────
// MANDATORY: All Claude API calls are sequential with 1.2s delays.
// NEVER use Promise.all() for Claude calls — has crashed production 5+ times.
export const CLAUDE = {
  /** Model for sector classification of holdings */
  CLASSIFICATION_MODEL: 'claude-haiku-4-5-20251001',
  /** Model for macro thesis generation */
  THESIS_MODEL: 'claude-sonnet-4-6',
  /** Model for Investment Brief writing — Opus for natural voice and stronger reasoning (spec §4.2) */
  BRIEF_MODEL: 'claude-opus-4-6',
  /** Minimum delay between sequential Claude API calls (milliseconds) */
  CALL_DELAY_MS: 1200,
  /** All Claude calls route through this proxy endpoint */
  PROXY_ENDPOINT: '/api/claude',
} as const;

// ─── Supabase Configuration ──────────────────────────────────────────────────
// All Supabase calls route through supaFetch() via the proxy endpoint.
// Only exception: magic link auth uses the Supabase JS client directly.
export const SUPABASE = {
  PROXY_ENDPOINT: '/api/supabase',
} as const;

// ─── Data Source Endpoints ───────────────────────────────────────────────────

/** SEC EDGAR — fund holdings, expense ratios, fund metadata (free) */
export const EDGAR = {
  BASE_URL: 'https://efts.sec.gov/LATEST',
  NPORT_SEARCH: 'https://efts.sec.gov/LATEST/search-index?q=',
  FULL_TEXT_SEARCH: 'https://efts.sec.gov/LATEST/search-index',
  /** User-Agent required by SEC (they block generic agents) */
  USER_AGENT: 'FundLens fundlens.app racoursey@gmail.com',
} as const;

/** OpenFIGI — CUSIP-to-ticker resolution (free with API key, 100 per batch) */
export const OPENFIGI = {
  BASE_URL: 'https://api.openfigi.com/v3/mapping',
  BATCH_SIZE: 100,
} as const;

/** Financial Modeling Prep — company fundamentals, prices, news ($19/mo Starter) */
// FMP migrated from /api/v3/ to /stable/ after August 31 2025.
// All v3 endpoints return "Legacy Endpoint" errors. Use /stable/ exclusively.
// Holdings endpoint (/stable/etf/holdings) requires Professional plan — NOT available
// on Starter. Fund holdings come from SEC EDGAR NPORT-P filings instead.
export const FMP = {
  BASE_URL: 'https://financialmodelingprep.com/stable',
  /** Endpoints we use from FMP Starter */
  ENDPOINTS: {
    PROFILE: '/profile',
    QUOTE: '/quote',
    INCOME_STATEMENT: '/income-statement',
    BALANCE_SHEET: '/balance-sheet-statement',
    CASH_FLOW: '/cash-flow-statement',
    RATIOS: '/ratios',
    KEY_METRICS: '/key-metrics',
    HISTORICAL_PRICE: '/historical-price-eod/full',
    STOCK_NEWS: '/stock_news',
    SEARCH: '/search-name',
  },
} as const;


/** FRED — macroeconomic indicators (free) */
export const FRED = {
  BASE_URL: 'https://api.stlouisfed.org/fred/series/observations',
  /** Key macro series we track */
  SERIES: {
    GDP: 'GDP',
    UNEMPLOYMENT: 'UNRATE',
    CPI: 'CPIAUCSL',
    FED_FUNDS_RATE: 'FEDFUNDS',
    YIELD_10Y: 'DGS10',
    YIELD_2Y: 'DGS2',
    YIELD_SPREAD: 'T10Y2Y',
    CONSUMER_SENTIMENT: 'UMCSENT',
    INDUSTRIAL_PRODUCTION: 'INDPRO',
  },
} as const;

// ─── RSS News Feeds ──────────────────────────────────────────────────────────
// Five feeds, zero cost. Cached every 120 minutes.
// Pipeline pulls 15-20 most recent headlines from each feed (75-100 total per run).
export const RSS_FEEDS = [
  {
    name: 'Google News Business',
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    purpose: 'Aggregated business/finance headlines. Replaced Reuters (feed died).',
  },
  {
    name: 'CNBC Economy',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    purpose: 'US economic conditions, Fed coverage, labor market, inflation.',
  },
  {
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    purpose: 'Geopolitical events, trade policy, international markets.',
  },
  {
    name: 'Google News World',
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    purpose: 'Global/geopolitical headlines. Replaced AP News (rss.app proxy expired).',
  },
  {
    name: 'Federal Reserve',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    purpose: 'Direct from the source on monetary policy.',
  },
] as const;

export const RSS_CACHE_MINUTES = 120;
export const RSS_HEADLINES_PER_FEED = 20;

// ─── Investment Brief ────────────────────────────────────────────────────────
export const BRIEF = {
  /** Days between automatic Brief generation per user */
  DELIVERY_INTERVAL_DAYS: 30,
  /** Name used in all UI and communications */
  DISPLAY_NAME: 'Investment Brief',
} as const;

// ─── Pipeline Configuration ──────────────────────────────────────────────────
export const PIPELINE = {
  /** Delay between sequential API calls to avoid rate limiting (ms) */
  API_CALL_DELAY_MS: 500,
  /** Delay between sequential Claude calls (ms) — MUST use this, never Promise.all */
  CLAUDE_CALL_DELAY_MS: 1200,
} as const;

// ─── UI Theme ────────────────────────────────────────────────────────────────
// Dark theme mandatory — never revert to light theme.
export const THEME = {
  BG: '#0e0f11',
  SURFACE: '#16181c',
  BORDER: '#25282e',
  ACCENT_BLUE: '#3b82f6',
  FONT_BODY: 'Inter',
  FONT_MONO: 'JetBrains Mono',
} as const;

// ─── Server Configuration ────────────────────────────────────────────────────
export const SERVER = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  /** Railway sets NODE_ENV=production automatically */
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
} as const;

// ─── Admin Configuration ────────────────────────────────────────────────────
// SESSION 0 SECURITY: Admin emails for privileged operations (pipeline, etc.)
export const ADMIN_EMAILS: readonly string[] = [
  'racoursey@gmail.com',
];

// ─── Environment Variable Keys ───────────────────────────────────────────────
// Listed here so we can validate they exist at startup.
export const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'FMP_API_KEY',
  'OPENFIGI_API_KEY',
  'TINNGO_KEY',        // Intentional typo — NEVER correct or mention it
  'FRED_API_KEY',
  'RESEND_API_KEY',
] as const;

// SESSION 0 SECURITY: Server MUST NOT start without these.
export const CRITICAL_ENV_KEYS: readonly string[] = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
  'ANTHROPIC_API_KEY',
];
