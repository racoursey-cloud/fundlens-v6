/**
 * FundLens v6 — Master Constants
 *
 * Single source of truth for all thresholds, factor weights, API endpoints,
 * and configuration values. Carried forward from v5.1 with rebuild refinements.
 *
 * References: Master Reference Document, Sections 4-6, 8, 10
 */

// ─── Money Market Funds (§2.7, updated Session 22) ─────────────────────────
// Scored on real factors adapted to MM characteristics.
// Cost Efficiency: scored normally. Quality: credit quality proxy.
// Momentum: 7-day SEC yield proxy. Positioning: neutral 50.
// Excluded from Kelly curve; only enters allocation if score survives on merit (§3.5).
export const MONEY_MARKET_TICKERS = new Set(['FDRXX', 'ADAXX']);

/**
 * Money market fund scoring configuration (§2.7, Session 22).
 *
 * Quality → credit quality proxy:
 *   Government-only MM funds (UST/agency paper only) score higher than
 *   prime MM funds (commercial paper, CDs, repos).
 *
 * Momentum → 7-day SEC yield proxy:
 *   Scored by linear interpolation between yield floor/ceiling.
 *   SEC yield is the standardized measure of what an MM fund earns.
 *
 * Data: prefer Finnhub/FMP API. Fall back to static map (90-day refresh).
 */
export const MM_SCORING = {
  /** Credit quality scores by fund type */
  GOVERNMENT_QUALITY: 85,  // Government-only funds: highest safety (UST + USG paper)
  PRIME_QUALITY: 65,       // Prime funds: commercial paper, lower safety

  /** 7-day SEC yield scoring benchmarks (linear interpolation) */
  YIELD_FLOOR: 0.02,      // 2.0% → score 20 (very low yield environment)
  YIELD_CEILING: 0.06,    // 6.0% → score 80 (high yield environment)
  YIELD_SCORE_MIN: 20,
  YIELD_SCORE_MAX: 80,

  /** Positioning: neutral for all MM funds */
  NEUTRAL_POSITIONING: 50,
} as const;

/**
 * Known MM fund metadata — fallback when APIs don't provide MM-specific data.
 * Refresh on 90-day cadence (aligned with Finnhub cache TTL).
 * Source: fund prospectuses, SEC N-MFP filings (public data).
 */
export const MM_FUND_DATA: ReadonlyMap<string, {
  type: 'government' | 'prime';
  secYield7Day: number;     // 7-day SEC yield as decimal (e.g., 0.0425 = 4.25%)
  lastUpdated: string;      // ISO date of last manual refresh
}> = new Map([
  ['FDRXX', { type: 'government', secYield7Day: 0.0406, lastUpdated: '2026-04-09' }],
  ['ADAXX', { type: 'government', secYield7Day: 0.0387, lastUpdated: '2026-04-09' }],
]);

// ─── Factor Weights (defaults — users can customize in profile) ──────────────
// SESSION 1: Corrected per spec §2.2 — Momentum 25%, Positioning 20%
// (Previously swapped: positioning was 0.25, momentum was 0.20)
export const DEFAULT_FACTOR_WEIGHTS = {
  costEfficiency: 0.25,
  holdingsQuality: 0.30,
  momentum: 0.25,
  positioning: 0.20,
} as const;

// ─── Holdings Coverage ───────────────────────────────────────────────────────
// A5 Task 1 (ratified July 5, 2026): the coverage cutoff is RETIRED. The old
// HOLDINGS_COVERAGE constants (95% walk termination / 400-holding cap) are
// deleted — every filing row enters the pipeline at its true weight. See
// holdings.ts includeAllHoldings().

// ─── Risk Tolerance (7-Point Kelly-Inspired Scale, Spec §3.4, §6.4) ────────
// Affects allocation sizing only, NOT scoring. Same scores, different position sizes.
// The k values are non-linearly spaced — tighter at conservative end, wider at aggressive.
export const KELLY_RISK_TABLE = [
  { level: 1, label: 'Very Conservative',     kellyFraction: 0.20, k: 0.42 },
  { level: 2, label: 'Conservative',          kellyFraction: 0.30, k: 0.65 },
  { level: 3, label: 'Moderate-Conservative',  kellyFraction: 0.40, k: 0.90 },
  { level: 4, label: 'Moderate',               kellyFraction: 0.50, k: 1.20 },
  { level: 5, label: 'Moderate-Aggressive',    kellyFraction: 0.60, k: 1.50 },
  { level: 6, label: 'Aggressive',             kellyFraction: 0.72, k: 1.85 },
  { level: 7, label: 'Very Aggressive',        kellyFraction: 0.85, k: 2.25 },
] as const;

/** Default risk level (Moderate = 4) */
export const DEFAULT_RISK_LEVEL = 4;
/** Min/max risk tolerance values */
export const RISK_MIN = 1;
export const RISK_MAX = 7;

// ─── Tier Badges (Spec §6.3) ────────────────────────────────────────────────
// Derived from MAD-based modified z-score in allocation engine.
export const TIER_BADGES = [
  { tier: 'TOP_PICK',     zMin: 2.0,   color: '#F59E0B', label: 'Top Pick' },
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
  /** Quality gate: funds with this many or more fallbacks are excluded */
  QUALITY_GATE_MAX_FALLBACKS: 4,
  /** De minimis floor (§3.5). Funds with allocation below this threshold are
   *  dropped and survivors renormalized. Industry-standard minimum position size.
   *  Single-pass: removing sub-threshold funds only increases survivor allocations.
   *  v6.1: Lowered from 5% to 4% to allow broader diversification at conservative
   *  risk levels while still eliminating negligible positions. */
  DE_MINIMIS_PCT: 0.04,
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
  /** A5 Task 5 (ratified July 5, 2026): ALL user-facing prose — thesis, fund
   *  summaries, Investment Brief — moves to this model. NEW constant; the
   *  frozen THESIS_MODEL/BRIEF_MODEL above stay in place, now genuinely
   *  unreferenced. That claim was not true when first written: BRIEF_MODEL
   *  had no reader, but pipeline.ts kept one reference to THESIS_MODEL in
   *  the thesis fallback, where it stamped 83 failure rows with a model that
   *  did not generate them (THESIS-F1, cured August 18, 2026 — the fallback
   *  stamps 'none'). Classification stays on CLASSIFICATION_MODEL untouched.
   *  Sonnet 5 notes: thinking is on by default and counts against
   *  max_tokens (prose calls raise their ceilings accordingly), and the
   *  model rejects temperature-style sampling parameters. */
  PROSE_MODEL: 'claude-sonnet-5',
  /** CB-S s1 (ruling 1, August 1, 2026): the classifier seat, ruled on the
   *  measured CB evidence (FUNDLENS_CB_COMPARISON.md): Opus beat Haiku by
   *  +18.2 points industry-level agreement and +5.5 sector-level, zero
   *  parser artifacts in 400 — under the decision rule set before any
   *  number was seen. CLASSIFICATION_MODEL above stays defined and
   *  unchanged as the benchmark's Haiku control. */
  CLASSIFIER_MODEL: 'claude-opus-5',
  /** CB-S s1 (ruling 4, August 1, 2026): the one shared Help chat seat —
   *  both the reference Help chat (B10) and the legacy full-tier chat
   *  (Session 12) call this model, by operator ruling (supersedes the B10
   *  ruling 9 Sonnet seat note; the eval stands as evidence of record).
   *  PROSE_MODEL is deliberately NOT moved: B9 translations and B10
   *  corpus drafting stay on Sonnet — re-pointing PROSE_MODEL would have
   *  re-seated them silently. Length caution cured by the Smart Brevity
   *  prompt sections (ruling 5). */
  HELP_CHAT_MODEL: 'claude-opus-5',
  /** Minimum delay between sequential Claude API calls (milliseconds) */
  CALL_DELAY_MS: 1200,
  /** All Claude calls route through this proxy endpoint */
  PROXY_ENDPOINT: '/api/claude',
} as const;

// ─── Reference Tier: Translation Flag (B-series B9; flipped in B9-T) ────────
// B9 feature flag. Gates the emission of translation_text in reference
// payloads (reference-shape.ts). Flipped true August 1, 2026 (B9-T t1)
// under Robert's proof-after-serving ruling, which supersedes B9 ruling
// 5's per-line pre-review precondition: the operator proofs the live app;
// corrections flow back through Fabio on Robert's typed word, served from
// the table with no deploy. All 23 stored translations passed the
// in-database fence sweep (zero banned stems, zero full-tier nouns)
// before this flip reached the repo.
export const REFERENCE_TRANSLATIONS_ENABLED = true;

// ─── Reference Tier: Help AI Flag (B-series B10) ────────────────────────────
// B10 kill switch (ruling 8: ON at launch — the Help chat serves generated
// text). Flipped false by Robert's deliberate edit: the reference Help chat
// UI hides, the ask route answers with the maintenance line and makes zero
// Claude calls, and the page degrades to B3's FAQ-only state. Scoped to Help
// only — the B7 and B9 flags above are untouched and stay false.
export const REFERENCE_HELP_AI_ENABLED = true;

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


/** Tiingo — mutual fund NAV prices (primary) + fee data (§4.1, §4.6) */
// Tiingo provides cleaner NAV history (split/distribution-adjusted, back to 1970s)
// and granular fee breakdowns (12b-1, loads, etc.) that FMP does not.
// Env var is TINNGO_KEY (intentional typo per §5.6 — do NOT correct).
export const TIINGO = {
  BASE_URL: 'https://api.tiingo.com',
  ENDPOINTS: {
    /** Daily prices / NAV history — works for mutual fund tickers */
    DAILY_PRICES: '/tiingo/daily',     // /{ticker}/prices
    // FUND_META and FUND_FEES removed Session 5 — endpoints don't work for mutual funds.
    // Fee data (12b-1, loads) now comes from Finnhub (finnhub.ts).
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
  /** Delay between sequential API calls to avoid rate limiting (ms)
   *  Session 10: Reduced from 500ms to 250ms. v5.1 uses 200-300ms successfully.
   *  This is still conservative — FMP allows 250/day on Starter, Tiingo 500/hr free tier. */
  API_CALL_DELAY_MS: 250,
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

// ─── Reference Tier: Signup Domain Gate (B-series B2, plan §1.3) ────────────
// Enforced in the server API layer (auth.ts requireAuth) — not Supabase
// config, not the client. An authenticated account whose email domain is
// not listed here AND whose email has no row in the access_exceptions table
// receives 403 { error: 'Access restricted' } on every API route. The
// Supabase auth user may exist; no route ever serves it.
// Exceptions (e.g., former employees with plan balances, and Robert's own
// non-company address) are rows in access_exceptions, added by Robert only.
// Domains are compared lowercase.
export const ALLOWED_SIGNUP_DOMAINS: readonly string[] = [
  'terrascend.com',
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
  'FINNHUB_KEY',       // Mutual fund expense ratios (ported from v5.1)
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
