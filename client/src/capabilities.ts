/**
 * FundLens — Derived capabilities (U1 wave A)
 *
 * One app, modules by entitlement. This file is the single place that turns
 * an account's server-enforced facts — access_tier (B1 migration, B2
 * enforcement) and is_admin (A5 Task 4) — into what the shell shows it.
 * Nothing here is stored and nothing new is read: no column was added, and
 * no field is consulted that the app was not already consulting (U1: "no new
 * columns, no Database-law ceremony").
 *
 * THE SAFETY ARCHITECTURE DOES NOT LIVE HERE. This file decides which tabs
 * render, whether the global chat icon exists, and whether the pipeline
 * machinery exists. It does NOT decide what DATA an account receives — that
 * remains the server's alone, through the B2 allowlist
 * (src/engine/reference-shape.ts) and requireFullTier. A browser that forced
 * every flag below to true would mount components that then render whatever
 * the server chose to send, which for a reference account is reference-shaped
 * facts and nothing else. Capabilities are furniture; the fence is the fence.
 *
 * Tier reading mirrors the server exactly: auth.ts and routes.ts both treat
 * "not 'full'" as reference, so this file does the same rather than testing
 * for the literal 'reference'. The column is NOT NULL DEFAULT 'reference'
 * with a CHECK constraint, so the two readings agree in practice; matching
 * the server is the safer of two equivalent choices.
 *
 * Destination: client/src/capabilities.ts
 */

import type { UserProfile } from './api';

// ─── Tabs ──────────────────────────────────────────────────────────────────

export interface NavTab {
  path: string;
  label: string;
  /** Exact-match path (only the index route needs it) */
  end: boolean;
}

/** The shared base every account gets — the reference pages (U1-A). */
const BASE_TABS: NavTab[] = [
  { path: '/', label: 'Funds', end: true },
  { path: '/mymix', label: 'My Mix', end: false },
];

/** Reference accounts keep the fenced Help page as their help surface. */
const REFERENCE_TABS: NavTab[] = [
  { path: '/help', label: 'Help', end: false },
];

/** The full-tier modules that light up on top of the base (U1 ruling 1:
 *  full/admin gets the global chat icon instead of a Help tab). */
const FULL_TABS: NavTab[] = [
  { path: '/brief', label: 'Brief', end: false },
  { path: '/research', label: 'Research', end: false },
];

/** Settings sits last, after the admin cockpit (U1-A tab order). */
const SETTINGS_TAB: NavTab = { path: '/settings', label: 'Settings', end: false };

/** A5 Task 4: the cockpit is an admin module. */
const ADMIN_TAB: NavTab = { path: '/pipeline', label: 'Pipeline', end: false };

// ─── The capability set ────────────────────────────────────────────────────

export interface Capabilities {
  tier: 'reference' | 'full';
  isAdmin: boolean;
  /** The nav list, in display order, for both the desktop and mobile bars */
  tabs: NavTab[];
  /** U1 ruling 1: the global chat affordance is a full/admin surface */
  globalChat: boolean;
  /** The LIVE / SEED DATA source badge and the single status read that sets
   *  it on mount. Full tier, admin or not — that is exactly who saw it
   *  before this wave, and U1-A is not the order that changes it. */
  dataFreshness: boolean;
  /** The pipeline CONTROLS — Refresh Analysis, the progress polling it
   *  starts, and the run overlay. Admin only (A5 Task 4).
   *
   *  Both flags false is the property that matters: a reference account's
   *  shell makes no /api/pipeline/* call of any kind, which is what B3 built
   *  and what this merge must not quietly drop. */
  pipelineControls: boolean;
  /** The "Reference" wordmark tag beside the logo */
  referenceTag: boolean;
  /** The educational/not-advice footer (B3, placeholder copy pending
   *  Robert's approved legal text) */
  disclaimerFooter: boolean;
}

/**
 * Derive what this account sees from what the server already says it is.
 *
 * @param profile the /api/profile row, or null while it is still loading
 */
export function deriveCapabilities(profile: UserProfile | null): Capabilities {
  const tier: 'reference' | 'full' = profile?.access_tier === 'full' ? 'full' : 'reference';
  const isAdmin = profile?.is_admin === true;

  if (tier === 'reference') {
    return {
      tier,
      isAdmin: false, // admin is a full-tier concept; never a reference module
      tabs: [...BASE_TABS, ...REFERENCE_TABS],
      globalChat: false,
      dataFreshness: false,
      pipelineControls: false,
      referenceTag: true,
      disclaimerFooter: true,
    };
  }

  return {
    tier,
    isAdmin,
    tabs: [
      ...BASE_TABS,
      ...FULL_TABS,
      ...(isAdmin ? [ADMIN_TAB] : []),
      SETTINGS_TAB,
    ],
    globalChat: true,
    dataFreshness: true,
    pipelineControls: isAdmin,
    referenceTag: false,
    disclaimerFooter: false,
  };
}
