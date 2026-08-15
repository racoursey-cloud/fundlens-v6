/**
 * FundLens — Reference Tier Shared Constants (B4 c1)
 *
 * The single home for constants shared between the reference Funds grid
 * and the reference FundDetail expansion. No list in this file may be
 * duplicated into another file (B4 assignment, gate proposal 4).
 */

// ─── Money market funds ────────────────────────────────────────────────────
// The reference payload deliberately ships NO money-market flag — the B2
// allowlist excludes everything not explicitly enumerated, and the flag
// wasn't (gate finding, July 28, 2026). Ticker matching is therefore the
// operative mechanism, per the ratified B4 assignment. Mirrors the server's
// MONEY_MARKET_TICKERS (src/engine/constants.ts).

export const MONEY_MARKET_TICKERS = new Set(['ADAXX', 'FDRXX']);

// ─── Cash-sweep vehicles (F3, ruled July 28, 2026) ─────────────────────────
// Thirteen exact vehicle names from Fabio's July 28, 2026 database
// enumeration — internal cash-management funds that appear as "holdings" in
// N-PORT filings (11 of the 23 plan funds carry at least one). Rows whose
// FULL name matches one of these — case-insensitively, exact full-name
// match ONLY — get a muted "cash reserves" tag in the reference detail.
//
// PATTERN MATCHING IS FORBIDDEN. Never match on substrings or keywords:
// FirstCash Holdings Inc, Metcash Ltd, and Lancashire Holdings Ltd are real
// portfolio companies whose names contain the letters c-a-s-h. A substring
// or keyword match would tag real companies as cash. Exact full-name
// equality against this list is the only sanctioned mechanism.

export const CASH_SWEEP_HOLDING_NAMES: readonly string[] = [
  'BlackRock Liquidity Funds',
  'State Street Institutional US Government Money Market Fund',
  'Dreyfus Institutional Preferred Government Plus Money Market Fund',
  'Dreyfus Institutional Preferred Money Market Funds',
  'TCW Central Cash Fund',
  'Invesco Private Prime Fund',
  'UMB Money Market Special II',
  'Capital Group Central Cash Fund',
  'Morgan Stanley Invst Mgt Inc - Morgan Stanley Instl Liquidity Fund - Govt Prtflo',
  'Fidelity Institutional Money Market Funds - Government Portfolio',
  'Dreyfus Cash Management Funds - Dreyfus Treasury and Agency Cash Management',
  'US Government Money Market Fund',
  'Vanguard Cmt Funds-Vanguard Market Liquidity Fund',
];

/** Lowercased set for the case-insensitive exact-match test */
const CASH_SWEEP_NAMES_LOWER = new Set(
  CASH_SWEEP_HOLDING_NAMES.map(n => n.toLowerCase())
);

/** Exact full-name match, case-insensitive — the F3 rule, nothing looser */
export function isCashSweepHolding(name: string): boolean {
  return CASH_SWEEP_NAMES_LOWER.has(name.trim().toLowerCase());
}

// ─── Sector palette (gate amendment 2, approved July 28, 2026) ─────────────
// Values copied VERBATIM from the full-tier module-private SECTOR_COLORS
// maps so both tiers paint sectors identically. The two files this note
// originally named are gone — FundLens.tsx retired in U1-B and the
// unimported components/FundDetail.tsx in M1 m10 — but the duplication is
// real and still stands: Research.tsx and YourBrief.tsx each carry their
// own unexported copy of the same palette. Unifying the three into one
// shared export remains logged in FOLLOWUPS.md.
//
// Composition colors only: a sector's color says what the fund HOLDS,
// never whether that is good or bad. Any sector missing from this map
// renders the house #71717a gray and legends as "Other".
//
// 'Money market' and 'No sector data' are reference-only mix-level buckets
// added in B6 (produced by client/src/engine/example-mix.ts, never present
// in fund-level sector maps) and are not part of the full-tier copy.

export const REFERENCE_SECTOR_COLORS: Record<string, string> = {
  Technology: '#3b82f6',
  Healthcare: '#06b6d4',
  Financials: '#8b5cf6',
  'Consumer Discretionary': '#f59e0b',
  'Consumer Staples': '#22c55e',
  Energy: '#ef4444',
  Industrials: '#f97316',
  Materials: '#14b8a6',
  'Real Estate': '#ec4899',
  Utilities: '#6366f1',
  'Communication Services': '#a855f7',
  'Precious Metals': '#eab308',
  'Fixed Income': '#64748b',
  'Cash & Equivalents': '#94a3b8',
  'Money market': '#38bdf8',
  'No sector data': '#c4b5fd',
  Other: '#71717a',
};

/** The house gray for sectors outside the map */
export const SECTOR_FALLBACK_COLOR = '#71717a';
