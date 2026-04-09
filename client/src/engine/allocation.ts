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

/** Kelly k-parameters by risk level (§3.4) */
const KELLY_K_TABLE: Record<number, number> = {
  1: 0.30, 2: 0.50, 3: 0.70, 4: 0.95,
  5: 1.20, 6: 1.50, 7: 1.85,
};

const DE_MINIMIS_PCT = 0.05;   // 5% minimum allocation (§3.5)
const MAD_CONSISTENCY = 0.6745; // 1/Φ⁻¹(0.75)
const QUALITY_GATE_MAX_FALLBACKS = 4;
const RISK_MIN = 1;
const RISK_MAX = 7;
const DEFAULT_RISK = 4;

const TIER_BADGES = [
  { zMin: 2.0,       label: 'Breakaway', color: '#F59E0B' },
  { zMin: 1.2,       label: 'Strong',    color: '#10B981' },
  { zMin: 0.3,       label: 'Solid',     color: '#3B82F6' },
  { zMin: -0.5,      label: 'Neutral',   color: '#6B7280' },
  { zMin: -Infinity,  label: 'Weak',      color: '#EF4444' },
] as const;

const SPECIAL_TIERS = {
  MONEY_MARKET: { label: 'MM',       color: '#4B5563' },
  LOW_DATA:     { label: 'Low Data', color: '#4B5563' },
} as const;

// ─── Types ──────────────────────────────────────────────────────────────

/** Input fund data for the client allocation engine */
export interface ClientAllocationInput {
  ticker: string;
  /** Composite score (0–100, from scoring engine or client rescore) */
  compositeScore: number;
  /** Whether this is a money market fund (FDRXX, ADAXX) */
  isMoneyMarket: boolean;
  /** Number of factor fallbacks (dataQuality flags) */
  fallbackCount: number;
}

/** Allocation result for a single fund */
export interface ClientAllocationResult {
  ticker: string;
  /** Allocation percentage (0–100, whole numbers, sums to 100) */
  allocationPct: number;
  /** Tier classification from modified z-score */
  tier: string;
  /** Tier color for UI display */
  tierColor: string;
  /** Modified z-score (MAD-based) */
  modZ: number | null;
  /** Composite score (passed through for display) */
  compositeScore: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Compute the median of an array */
function median(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Clamp risk tolerance to valid 1.0–7.0 range (continuous, §3.4) */
function clampRisk(rt: number): number {
  if (!Number.isFinite(rt)) return DEFAULT_RISK;
  return Math.min(RISK_MAX, Math.max(RISK_MIN, rt));
}

/**
 * Interpolate k parameter between KELLY_K_TABLE anchor points (§3.4).
 *
 * For integer values, returns the exact k from the table.
 * For fractional values (e.g. 5.3), linearly interpolates:
 *   k = k_table[floor] + (k_table[ceil] - k_table[floor]) × fraction
 *
 * Example: rt=5.3 → k = 1.20 + (1.50 - 1.20) × 0.3 = 1.29
 */
function interpolateK(rt: number): number {
  const floorLevel = Math.floor(rt);
  const ceilLevel = Math.ceil(rt);

  if (floorLevel === ceilLevel) {
    // Exact integer — return table value directly
    return KELLY_K_TABLE[floorLevel] ?? 0.95;
  }

  const kFloor = KELLY_K_TABLE[floorLevel] ?? 0.95;
  const kCeil = KELLY_K_TABLE[ceilLevel] ?? 0.95;
  const fraction = rt - floorLevel;

  return kFloor + (kCeil - kFloor) * fraction;
}

/** Get tier from modified z-score (§6.3) */
function getTier(modZ: number): { tier: string; color: string } {
  for (const badge of TIER_BADGES) {
    if (modZ >= badge.zMin) {
      return { tier: badge.label, color: badge.color };
    }
  }
  return { tier: 'Weak', color: '#EF4444' };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Compute allocation percentages from scored funds (§3.1–3.6).
 *
 * Client-side port of server computeAllocations(). Same algorithm,
 * inlined constants, no server dependencies.
 *
 * @param funds Scored fund data (composite scores, money market flags, fallback counts)
 * @param riskTolerance User's risk tolerance (1–7 per spec §3.4)
 * @returns Allocation results sorted by allocationPct descending
 */
export function computeClientAllocations(
  funds: ClientAllocationInput[],
  riskTolerance: number
): ClientAllocationResult[] {
  if (!Array.isArray(funds) || funds.length === 0) return [];

  const rt = clampRisk(riskTolerance);

  // ── STEP 1 — Modified Z-Score (MAD-based, §3.2) ────────────────────────
  // Pool only non-money-market funds for the statistical calculation.
  const nonMM = funds.filter(f => !f.isMoneyMarket);
  const scores = nonMM.map(f => f.compositeScore);

  const med = median(scores);
  const absDeviations = scores.map(s => Math.abs(s - med));
  const mad = median(absDeviations);

  // Avoid division by zero when all scores are identical
  const safeMad = mad > 0 ? mad : 1e-9;

  // Compute modified z-scores for every fund
  const withZ = funds.map(fund => {
    if (fund.isMoneyMarket) {
      return {
        ...fund,
        modZ: null as number | null,
        tier: SPECIAL_TIERS.MONEY_MARKET.label,
        tierColor: SPECIAL_TIERS.MONEY_MARKET.color,
        excluded: true,
      };
    }

    const modZ = MAD_CONSISTENCY * (fund.compositeScore - med) / safeMad;

    // ── STEP 2 — Quality Gate (§3.3) ─────────────────────────────────────
    const isLowData = fund.fallbackCount >= QUALITY_GATE_MAX_FALLBACKS;

    if (isLowData) {
      return {
        ...fund,
        modZ,
        tier: SPECIAL_TIERS.LOW_DATA.label,
        tierColor: SPECIAL_TIERS.LOW_DATA.color,
        excluded: true,
      };
    }

    const tierInfo = getTier(modZ);
    return {
      ...fund,
      modZ,
      tier: tierInfo.tier,
      tierColor: tierInfo.color,
      excluded: false,
    };
  });

  // ── STEP 3 — Exponential Allocation Curve (§3.4) ─────────────────────
  // k parameter interpolated between Kelly risk table anchor points (continuous)
  const k = interpolateK(rt);

  const eligible = withZ.filter(f => !f.excluded);

  if (eligible.length === 0) {
    // No eligible funds — return all with 0% allocation
    return withZ.map(f => ({
      ticker: f.ticker,
      allocationPct: 0,
      tier: f.tier,
      tierColor: f.tierColor,
      modZ: f.modZ,
      compositeScore: f.compositeScore,
    }));
  }

  // raw_weight[i] = e^(k × mod_z[i])
  const rawWeights = eligible.map(fund => ({
    ticker: fund.ticker,
    rawWeight: Math.exp(k * (fund.modZ ?? 0)),
  }));

  const totalRaw = rawWeights.reduce((acc, e) => acc + e.rawWeight, 0) || 1;

  // Normalize to 100%
  const allocMap = new Map<string, number>();
  for (const { ticker, rawWeight } of rawWeights) {
    allocMap.set(ticker, (rawWeight / totalRaw) * 100);
  }

  // ── STEP 4 — De Minimis Floor (§3.5) ─────────────────────────────────
  // Drop any fund with allocation below 5% (DE_MINIMIS_PCT).
  // Renormalize survivors to sum to 100%.
  //
  // This is a single-pass operation: removing sub-threshold funds only
  // increases survivor allocations (denominator shrinks), so no fund
  // that was above 5% can drop below 5% after removal.
  const deMinimisThreshold = DE_MINIMIS_PCT * 100; // 5 (percentage points)

  for (const [ticker, pct] of allocMap) {
    if (pct < deMinimisThreshold) {
      allocMap.delete(ticker);
    }
  }

  // Renormalize survivors to 100%
  const survivorSum = Array.from(allocMap.values()).reduce((a, b) => a + b, 0) || 1;
  for (const [ticker, pct] of allocMap) {
    allocMap.set(ticker, (pct / survivorSum) * 100);
  }

  // ── STEP 5 — Rounding and Error Absorption (§3.6) ─────────────────────
  // Round each surviving fund to whole percentage
  for (const [ticker, pct] of allocMap) {
    allocMap.set(ticker, Math.round(pct));
  }

  // Absorb rounding error (typically ±1%) into largest position
  const roundedSum = Array.from(allocMap.values()).reduce((a, b) => a + b, 0);
  const diff = 100 - roundedSum;

  if (diff !== 0 && allocMap.size > 0) {
    // Find the largest position
    let largestTicker = '';
    let largestPct = -1;
    for (const [ticker, pct] of allocMap) {
      if (pct > largestPct) {
        largestPct = pct;
        largestTicker = ticker;
      }
    }
    if (largestTicker) {
      allocMap.set(largestTicker, (allocMap.get(largestTicker) ?? 0) + diff);
    }
  }

  // ── Assemble Results ──────────────────────────────────────────────────
  const results: ClientAllocationResult[] = withZ.map(fund => ({
    ticker: fund.ticker,
    allocationPct: fund.excluded ? 0 : (allocMap.get(fund.ticker) ?? 0),
    tier: fund.tier,
    tierColor: fund.tierColor,
    modZ: fund.modZ,
    compositeScore: fund.compositeScore,
  }));

  // Sort by allocation descending (non-allocated at the bottom)
  results.sort((a, b) => b.allocationPct - a.allocationPct);

  return results;
}
