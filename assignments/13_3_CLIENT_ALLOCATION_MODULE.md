# Assignment 13.3: Port Allocation Engine to Client-Side Module

**Session:** 13
**Estimate:** 30 minutes
**Depends on:** 13.2 (server-side allocation.ts is correct)

---

## Spec Reference

- **§5.2** — "The React client is a display layer that reads scores from Supabase and applies user-specific weighting client-side (pure math rescore via computeComposite — no API calls)."
- **§3.1–3.6** — Full allocation algorithm
- **§6.4** — "Affects: Allocation only. Scores do not change."

## Rationale

The allocation engine is pure math — no API calls, no DB queries, no Claude calls. It takes composite scores + risk tolerance as input and produces allocation percentages. Porting it to the client enables:

1. Instant allocation updates when the user moves the risk slider (no API round-trip)
2. Instant allocation updates when the user changes factor weights (weight change → client rescore → client re-allocate)
3. Consistency with the existing client-side rescore pattern

The server-side `allocation.ts` continues to exist for Brief generation. Both implementations use the same algorithm.

## Files to Read First

- `src/engine/allocation.ts` — the server-side implementation (just fixed in 13.2). This is what you're porting.
- `src/engine/constants.ts` — the constants used by allocation.ts (KELLY_RISK_TABLE, ALLOCATION, TIER_BADGES, SPECIAL_TIERS, etc.)
- `client/src/pages/Portfolio.tsx` — the client already has inline constants for tiers, MAD, and MM tickers (lines 55–91). The client allocation module should reuse the same pattern.

## Files to Create

- `client/src/engine/allocation.ts` — new file, client-side allocation module

## What to Do

### 1. Create the client-side allocation module

Create `client/src/engine/allocation.ts`. This file must:

- Be a self-contained TypeScript module with zero server-side imports
- Inline all necessary constants (KELLY_RISK_TABLE k-values, DE_MINIMIS_PCT, MAD_CONSISTENCY, QUALITY_GATE_MAX_FALLBACKS, tier badge thresholds, money market tickers)
- Export a `computeClientAllocations()` function with the same algorithm as the server-side `computeAllocations()`
- Use the same types (or compatible types) for input and output

### 2. Module structure

```typescript
/**
 * FundLens v6 — Client-Side Allocation Engine
 *
 * Pure-math port of src/engine/allocation.ts for instant client-side
 * allocation computation. No API calls, no server dependencies.
 *
 * Algorithm (§3.1–3.6):
 *   1. MAD-based modified z-scores (§3.2)
 *   2. Quality gate: 4+ fallbacks excluded (§3.3)
 *   3. Exponential curve: e^(k × mod_z) with Kelly k-interpolation (§3.4)
 *   4. De minimis floor: drop < 5%, renormalize (§3.5)
 *   5. Round to whole %, absorb error into largest (§3.6)
 *
 * Session 13: Created as client-side port of server allocation engine.
 */

// ─── Constants (inlined from server constants.ts) ───────────────────────

const KELLY_K_TABLE: Record<number, number> = {
  1: 0.30, 2: 0.50, 3: 0.70, 4: 0.95,
  5: 1.20, 6: 1.50, 7: 1.85,
};

const DE_MINIMIS_PCT = 0.05;   // 5% minimum allocation (§3.5)
const MAD_CONSISTENCY = 0.6745; // 1/Phi^-1(0.75)
const QUALITY_GATE_MAX_FALLBACKS = 4;
const RISK_MIN = 1;
const RISK_MAX = 7;
const DEFAULT_RISK = 4;

const MM_TICKERS = new Set(['FDRXX', 'ADAXX']);

const TIER_BADGES = [
  { zMin: 2.0, label: 'Breakaway', color: '#F59E0B' },
  { zMin: 1.2, label: 'Strong',    color: '#10B981' },
  { zMin: 0.3, label: 'Solid',     color: '#3B82F6' },
  { zMin: -0.5, label: 'Neutral',  color: '#6B7280' },
  { zMin: -Infinity, label: 'Weak', color: '#EF4444' },
] as const;

// ─── Types ──────────────────────────────────────────────────────────────

export interface ClientAllocationInput {
  ticker: string;
  compositeScore: number;
  isMoneyMarket: boolean;
  fallbackCount: number;
}

export interface ClientAllocationResult {
  ticker: string;
  allocationPct: number;
  tier: string;
  tierColor: string;
  modZ: number | null;
  compositeScore: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function median(arr: number[]): number { /* same as server */ }
function clampRisk(rt: number): number { /* same as server */ }
function interpolateK(rt: number): number { /* same as server */ }
function getTier(modZ: number): { tier: string; color: string } { /* same as server */ }

// ─── Public API ─────────────────────────────────────────────────────────

export function computeClientAllocations(
  funds: ClientAllocationInput[],
  riskTolerance: number
): ClientAllocationResult[] {
  // Exact same algorithm as server-side computeAllocations()
  // with de minimis floor (not capture threshold)
}
```

### 3. Implementation details

Copy the algorithm from `src/engine/allocation.ts` exactly. The only differences from the server version:

- Constants are inlined (not imported from constants.ts)
- Types have "Client" prefix to avoid confusion with server types
- No `import` of any server-side module
- The function name is `computeClientAllocations` to distinguish from server-side

The algorithm must be **identical** to the server-side version after the 13.2 fix:
1. MAD z-scores from non-MM composites
2. Quality gate (4+ fallbacks → excluded)
3. Exponential curve with interpolated k
4. De minimis floor: drop < 5%, renormalize (single pass)
5. Round to whole %, error absorption into largest

## What NOT to Do

- Do NOT import anything from `src/engine/` — client and server are separate build targets
- Do NOT add API calls or fetch logic
- Do NOT change the algorithm from what's in the server-side allocation.ts
- Do NOT add any logic that doesn't exist in the server version (no extra thresholds, no minimum fund counts, no capture threshold)
- Do NOT modify any existing client files yet — that's Task 13.4

## Verification

1. `tsc --noEmit` — must pass (new file, no existing code modified)
2. Code review: compare the client module's algorithm line-by-line against `src/engine/allocation.ts` to confirm they are identical
3. Confirm the file has zero imports from `src/engine/` or any server module

## Rollback

Delete `client/src/engine/allocation.ts`.
