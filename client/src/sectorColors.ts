/**
 * FundLens — Sector Palette (one shared export)
 *
 * The single home for the sector composition palette. Before this file the
 * same map was written out four times: Research.tsx, YourBrief.tsx,
 * components/SectorScorecard.tsx, and pages/reference/constants.ts. Three of
 * those were value-identical; unifying them is FOLLOWUPS #24 (2026-08-15).
 *
 * COMPOSITION COLORS ONLY. A sector's color says what the fund HOLDS, never
 * whether that is good or bad. Nothing here encodes a score, a tier or a
 * verdict, and nothing here may start to.
 *
 * Any sector missing from this map renders the house gray (#71717a, the
 * theme's textDim) and legends as "Other" at the call site.
 *
 * NOT unified here, deliberately: components/SectorScorecard.tsx keeps its
 * own copy. It carries no 'Other' key and falls back to a different gray
 * (#6b7280), so folding it in would change what a sector named "Other"
 * paints. That is a display decision, not a dedupe, and it stays logged.
 *
 * Destination: client/src/sectorColors.ts
 */

export const SECTOR_COLORS: Record<string, string> = {
  Technology:               '#3b82f6',
  Healthcare:               '#06b6d4',
  Financials:               '#8b5cf6',
  'Consumer Discretionary': '#f59e0b',
  'Consumer Staples':       '#22c55e',
  Energy:                   '#ef4444',
  Industrials:              '#f97316',
  Materials:                '#14b8a6',
  'Real Estate':            '#ec4899',
  Utilities:                '#6366f1',
  'Communication Services': '#a855f7',
  'Precious Metals':        '#eab308',
  'Fixed Income':           '#64748b',
  'Cash & Equivalents':     '#94a3b8',
  Other:                    '#71717a',
};
