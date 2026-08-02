/**
 * FundLens — Display-Ticker Positive Validation (H1-F2 v3)
 *
 * THE RULING OF RECORD (Robert, August 2, 2026): "The Ticker column shows
 * an identifier a member could type into a quote site and find the
 * security — or an honest dash." Negative filtering lost to the vendor's
 * junk-heavy candidate lists three cure cycles running (HONGBP→HONGBX,
 * TRI4EUR→TRI4CAD — the S-H1 sweep report); this module replaces it with
 * positive validation: a ticker DISPLAYS only when the app can
 * affirmatively vouch for it.
 *
 * The rules, in order:
 *   1. US listing where one exists (MDT, not 0Y6X.L).
 *   2. Else the OTC code (ASMLF, SSNLF — house convention).
 *   3. Else the bare home-market code where the code's venue matches the
 *      security's home country; suffixed forms strip to bare
 *      (TVSMOTOR.NS → TVSMOTOR, 9433.T → 9433). A venue that contradicts
 *      the home country never displays.
 *   4. Corporate-bond rows display the ISSUER's ticker by rules 1–3
 *      (BAC, not BAC.SW).
 *   5. Sovereign/government rows always display a dash — a government has
 *      no ticker, and an ETF is not a government.
 *   6. Anything passing none of these: a dash. A dash is honest; a wrong
 *      or cryptic code is not.
 *
 * This is DISPLAY-time policy: pure functions, no I/O. The pipeline's
 * display-validation pass calls computeDisplayTicker for every built
 * holding after enrichment (profiles in hand for the h6 name-agreement
 * requirement) and persist writes the result to holdings_cache.ticker —
 * the member-visible column. The resolved ticker is untouched: enrichment
 * keys on it, and cusip_cache keeps raw vendor truth (scope guards).
 */

import { cinsCountry, isinCountry, venueSuffixCountry } from './cusip.js';
import { profileMatchesHoldingName } from './fmp.js';

// ─── Inputs ─────────────────────────────────────────────────────────────────

/** The holding fields the policy reads (satisfied by ResolvedHolding). */
export interface DisplayTickerSource {
  ticker: string | null;
  name: string;
  cusip: string;
  isin?: string | null;
  listingTier?: 'us' | 'otc' | 'home' | null;
  assetCategory: string | null;
  countryOfIssuer: string | null;
  isDebt: boolean;
  issuerCategory: string | null;
}

/** The profile fields the policy reads (h6 agreement), or null when the
 *  ticker has no cached/fetched profile. */
export interface DisplayTickerProfile {
  companyName?: string | null;
}

// ─── Debt detection (mirrors the classify.ts/holdings.ts category sets) ─────

const DEBT_ASSET_CATS = new Set(['DBT', 'STIV', 'LON', 'ABS-MBS', 'ABS-O', 'ABS-CBDO']);

function isDebtRow(h: DisplayTickerSource): boolean {
  return h.isDebt || (!!h.assetCategory && DEBT_ASSET_CATS.has(h.assetCategory.toUpperCase()));
}

// ─── Rule 5: sovereign detection ────────────────────────────────────────────
// Evidence-verified against the flagged D-class production rows (August 2
// read-only sweep): every sovereign row is a DEBT row, and the near-miss
// names (Republic Services, Commonwealth Bank of Australia, Old Republic,
// Emirates NBD, Hellenic Telecom) are all equities — so the heuristic runs
// on debt rows only, with a fund-name guard for money-market rows
// ("First American Government Obli" keeps its real FGXXX ticker).
// Misses fall through to rules 4/6, which dash anything unvouchable.

const SOVEREIGN_ISSUER_CATS = new Set(['UST', 'USGA', 'MUN', 'SOV']);

const SOVEREIGN_NAME_PATTERNS: RegExp[] = [
  /\bREPUBLIC OF\b/i,
  /\bKINGDOM OF\b/i,
  /\bCOMMONWEALTH OF\b/i,
  /\bSTATE OF\b/i,
  /\bPROVINCE OF\b/i,
  /\bEMIRATE OF\b/i,
  /\bMINISTRY OF FINANCE\b/i,
  /\(GOVERNMENT\)/i,
  /\bGOVERNMENT (INTERNATIONAL )?BONDS?\b/i,
  /\bGOVERNMENT OF\b/i,
  /\bFEDERAL REPUBLIC\b/i,
  /\bSOVEREIGN\b/i,
  /^(UNITED STATES|U\.?S\.?) TREASURY\b/i,
];

/** Country-name-only rows ("SWITZERLAND", "ROMANIA," …). Compared against
 *  the row name with punctuation stripped, whole-name only. */
const SOVEREIGN_COUNTRY_NAMES = new Set([
  'AUSTRALIA', 'AUSTRIA', 'BELGIUM', 'BRAZIL', 'BULGARIA', 'CANADA',
  'CHILE', 'CHINA', 'COLOMBIA', 'CROATIA', 'CZECH REPUBLIC', 'DENMARK',
  'DOMINICAN REPUBLIC', 'FINLAND', 'FRANCE', 'GERMANY', 'GREECE',
  'HUNGARY', 'ICELAND', 'INDONESIA', 'IRELAND', 'ISRAEL', 'ITALY',
  'IVORY COAST', 'JAPAN', 'KOREA', 'MALAYSIA', 'MEXICO', 'MOROCCO',
  'NETHERLANDS', 'NEW ZEALAND', 'NORWAY', 'PANAMA', 'PARAGUAY', 'PERU',
  'PHILIPPINES', 'POLAND', 'PORTUGAL', 'QATAR', 'ROMANIA', 'SAUDI ARABIA',
  'SERBIA', 'SINGAPORE', 'SLOVAKIA', 'SLOVENIA', 'SOUTH AFRICA', 'SPAIN',
  'SWEDEN', 'SWITZERLAND', 'THAILAND', 'TURKEY', 'UKRAINE',
  'UNITED KINGDOM', 'URUGUAY', 'VIETNAM',
]);

/** Fund rows are not sovereigns even when their names carry "Government"
 *  (money-market portfolios) — their tickers are real and typeable. */
const FUND_NAME_GUARD = /\b(FUND|FUNDS|PORTFOLIO|TRUST|MONEY MARKET|ETF)\b/i;

export function isSovereignRow(h: DisplayTickerSource): boolean {
  if (h.issuerCategory && SOVEREIGN_ISSUER_CATS.has(h.issuerCategory.toUpperCase())) {
    return true;
  }
  if (!isDebtRow(h)) return false;
  const name = h.name || '';
  if (FUND_NAME_GUARD.test(name)) return false;
  if (SOVEREIGN_NAME_PATTERNS.some(p => p.test(name))) return true;
  const bareName = name.toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return SOVEREIGN_COUNTRY_NAMES.has(bareName);
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

/** Wide currency-tail list for home-tier candidates — the vendor's line
 *  codes now arrive in more currencies than h3's four (class A: GBX, CAD).
 *  Applied at length ≥6 only, preserving the f1 CICHF-class amendment. */
const WIDE_CURRENCY_TAILS =
  /(USD|EUR|GBP|CHF|GBX|CAD|JPY|AUD|NZD|SEK|NOK|DKK|PLN|HKD|SGD|KRW|TWD|INR|BRL|MXN|ZAR|CNY|CNH|ILS)$/;

function hasCurrencyTail(code: string): boolean {
  return code.length >= 6 && WIDE_CURRENCY_TAILS.test(code);
}

/** The security's home country: ISIN prefix first, CINS letter second
 *  (the f4 machinery), EDGAR's country-of-issuer as the last word. */
export function holdingHomeCountry(h: DisplayTickerSource): string | null {
  const fromIds = isinCountry(h.isin) ?? cinsCountry(h.cusip);
  if (fromIds) return fromIds;
  const c = (h.countryOfIssuer || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Bare home-market code shapes the policy vouches for (evidence-derived):
 *  all-letters (RELIANCE, TVSMOTOR, EMIRATES), all-digits (000660, 9433,
 *  2222), or digits + one trailing letter (KRX preferred 00680K, JPX
 *  alphanumeric 417A). Mixed venue codes (0Y6X, 6D8, UC94, 1JK) match
 *  none of these — no vouch. */
const HOME_BARE_SHAPES = [/^[A-Z]{1,8}$/, /^[0-9]{4,6}$/, /^[0-9]{3,5}[A-Z]$/];

function homeBareShapeOk(code: string): boolean {
  return HOME_BARE_SHAPES.some(p => p.test(code));
}

const US_SHAPE = /^[A-Z]{1,5}([.-][A-Z])?$/;
const OTC_SHAPE = /^[A-Z]{4,5}$/;

// ─── The policy ─────────────────────────────────────────────────────────────

/**
 * The vouched-for display ticker for one holding, or null (the honest
 * dash). profile is the FMP profile cached/fetched for the RESOLVED
 * ticker, when one exists — the h6 name-agreement requirement: a profile
 * that disagrees with the filed name is a vouch AGAINST.
 */
export function computeDisplayTicker(
  h: DisplayTickerSource,
  profile: DisplayTickerProfile | null,
): string | null {
  if (!h.ticker) return null;
  const t = h.ticker.trim().toUpperCase();
  if (!t) return null;

  // Rule 5 first: a government row never shows a ticker, whatever the
  // vendor served (an ETF is not a government).
  if (isSovereignRow(h)) return null;

  // h6 requirement, shared by every rule: where a profile exists for the
  // resolved ticker, its company must agree with the filed name.
  if (profile && !profileMatchesHoldingName(h.name, profile.companyName)) {
    return null;
  }

  // Rule 4: corporate-bond rows display the ISSUER's ticker — strip any
  // single venue suffix (BAC.SW → BAC), then require the plain US shape.
  if (isDebtRow(h)) {
    const parts = t.split('.');
    if (parts.length > 2) return null;
    const bare = parts[0];
    // Money-market fund rows keep their real five-letter tickers (FGXXX);
    // 1–5 plain letters covers issuer codes and fund tickers alike.
    if (!/^[A-Z]{1,5}$/.test(bare)) return null;
    return bare;
  }

  const homeCountry = holdingHomeCountry(h);
  // Tier unknown (pre-A4 cache rows): a US-country issuer validates as a
  // US listing; anything else validates under the strict home rules.
  const tier = h.listingTier ?? (homeCountry === 'US' ? 'us' : 'home');

  // Rules 1–2: US and OTC listings — shape plus the h6 agreement above.
  if (tier === 'us') return US_SHAPE.test(t) ? t : null;
  if (tier === 'otc') return OTC_SHAPE.test(t) ? t : null;

  // Rule 3: bare home-market code. The venue must MATCH the home country
  // to strip; an unknown or contradicting suffix is never an affirmation.
  // US issuers never display via the home rule — their real listings are
  // rules 1–2 (kills the HONGBX class at the root).
  if (!homeCountry || homeCountry === 'US') return null;
  let bare = t;
  if (t.includes('.')) {
    const parts = t.split('.');
    if (parts.length !== 2) return null;
    const venueCountry = venueSuffixCountry(parts[1]);
    if (!venueCountry || venueCountry !== homeCountry) return null;
    bare = parts[0];
  }
  if (hasCurrencyTail(bare)) return null;
  if (!homeBareShapeOk(bare)) return null;
  return bare;
}
