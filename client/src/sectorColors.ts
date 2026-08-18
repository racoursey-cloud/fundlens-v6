/**
 * FundLens — Sector Palette (one shared export)
 *
 * The single home for the sector composition palette. Before this file the
 * same map was written out four times: Research.tsx, YourBrief.tsx,
 * components/SectorScorecard.tsx, and pages/reference/constants.ts. All four
 * now read from here — FOLLOWUPS #24 (2026-08-15), closed in two passes.
 *
 * COMPOSITION COLORS ONLY. A sector's color says what the fund HOLDS, never
 * whether that is good or bad. Nothing here encodes a score, a tier or a
 * verdict, and nothing here may start to.
 *
 * Any sector missing from this map renders the house gray (#71717a, the
 * theme's textDim) and legends as "Other" at the call site.
 *
 * SectorScorecard.tsx was held back on the first pass and has since joined.
 * The reason for holding it — no 'Other' key, and a different fallback gray
 * (#6b7280) — was real but unreachable: its other fourteen keys are
 * value-identical to this map, and the thesis engine has produced only those
 * fourteen sectors across all 230 cached runs, never 'Other'. The one key
 * that could have painted differently never arrives. Its #6b7280 fallback
 * stays its own; it is the component's, not the palette's.
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
