/**
 * FundLens v6 — Allocation Engine (§3)
 *
 * Converts universal fund scores into personalized position sizing
 * based on the user's risk tolerance. Scores are universal; allocations
 * are personal.
 *
 * Ported from v5.1 outlier.js with spec §3 updates:
 *   - 7-point Kelly risk scale (was 1–9)
 *   - 5% de minimis floor (was 0.5% or capture-threshold)
 *   - MAD-based modified z-scores with 0.6745 consistency constant
 *   - Exponential curve e^(k × mod_z) using KELLY_RISK_TABLE k-parameters
 *   - Quality gate: 4+ fallback funds excluded
 *   - Rounding with error absorption into largest position
 *
 * Theoretical basis: Fractional Kelly Criterion (Kelly 1956), Grinold & Kahn's
 * Fundamental Law of Active Management.
 *
 * No Claude calls. No external API calls. Pure math.
 *
 * Session 6: Extracted from brief-engine.ts, rewritten to match spec §3.1–3.6.
 * Session 13: Replaced capture threshold (Step 4) with de minimis floor per §3.5.
 * Session 22: De minimis swept weight routes to top-scoring MM fund (§3.5 cash sweep).
 *             MM funds scored on real factors but excluded from Kelly curve.
 */

import {
  KELLY_RISK_TABLE,
  ALLOCATION,
  TIER_BADGES,
  SPECIAL_TIERS,
  DEFAULT_RISK_LEVEL,
  RISK_MIN,
  RISK_MAX,
} from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Input fund data for the allocation engine */
export interface AllocationInput {
  ticker: string;
  /** Composite score (0–100, from scoring engine) */
  compositeScore: number;
  /** Whether this is a money market fund (FDRXX, ADAXX) */
  isMoneyMarket: boolean;
  /** Number of factor fallbacks (dataQuality flags) */
  fallbackCount: number;
}

/** Allocation result for a single fund */
export interface AllocationResult {
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

// ─── Internal Helpers ──────────────────────────────────────────────────────

/** Compute the median of an array */
function median(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Clamp risk tolerance to valid 1.0–7.0 range (continuous, §3.4) */
function clampRisk(rt: number): number {
  if (!Number.isFinite(rt)) return DEFAULT_RISK_LEVEL;
  return Math.min(RISK_MAX, Math.max(RISK_MIN, rt));
}

/**
 * Interpolate k parameter between KELLY_RISK_TABLE anchor points (§3.4).
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

  // Build a lookup from the table (levels 1–7) — use number keys for flexibility
  const kByLevel = new Map<number, number>(KELLY_RISK_TABLE.map(r => [r.level as number, r.k as number]));

  if (floorLevel === ceilLevel) {
    // Exact integer — return table value directly
    return kByLevel.get(floorLevel) ?? 0.95;
  }

  const kFloor = kByLevel.get(floorLevel) ?? 0.95;
  const kCeil = kByLevel.get(ceilLevel) ?? 0.95;
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

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute allocation percentages from scored funds (§3.1–3.6).
 *
 * @param funds Scored fund data (composite scores, money market flags, fallback counts)
 * @param riskTolerance User's risk tolerance (1–7 per spec §3.4)
 * @returns Allocation results sorted by allocationPct descending
 */
export function computeAllocations(
  funds: AllocationInput[],
  riskTolerance: number
): AllocationResult[] {
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

    const modZ = ALLOCATION.MAD_CONSISTENCY * (fund.compositeScore - med) / safeMad;

    // ── STEP 2 — Quality Gate (§3.3) ─────────────────────────────────────
    const isLowData = fund.fallbackCount >= ALLOCATION.QUALITY_GATE_MAX_FALLBACKS;

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

  // ── STEP 4 — De Minimis Floor + Cash Sweep (§3.5, Session 22) ────────
  // Drop any fund with allocation below 5% (DE_MINIMIS_PCT).
  // Route swept weight to top-scoring MM fund (capped at MM_CASH_CAP).
  // Excess above cap reverts to proportional redistribution among survivors.
  const deMinimisThreshold = ALLOCATION.DE_MINIMIS_PCT * 100; // 5 (percentage points)
  const mmCashCap = ALLOCATION.MM_CASH_CAP * 100;             // 15 (percentage points)

  // Calculate total swept weight before removing
  let sweptPct = 0;
  for (const [, pct] of allocMap) {
    if (pct < deMinimisThreshold) {
      sweptPct += pct;
    }
  }

  // Remove sub-threshold funds
  for (const [ticker, pct] of allocMap) {
    if (pct < deMinimisThreshold) {
      allocMap.delete(ticker);
    }
  }

  // Find top-scoring MM fund for cash sweep
  const mmFunds = funds
    .filter(f => f.isMoneyMarket)
    .sort((a, b) => b.compositeScore - a.compositeScore);
  const topMM = mmFunds.length > 0 ? mmFunds[0] : null;

  // Route swept weight to MM fund, capped at MM_CASH_CAP
  let cashPct = 0;
  if (sweptPct > 0 && topMM) {
    cashPct = Math.min(sweptPct, mmCashCap);
    const survivorTarget = 100 - cashPct;

    // Renormalize survivors to (100 - cashPct)%
    const survivorSum = Array.from(allocMap.values()).reduce((a, b) => a + b, 0) || 1;
    for (const [ticker, pct] of allocMap) {
      allocMap.set(ticker, (pct / survivorSum) * survivorTarget);
    }

    // Assign cash allocation to top MM fund
    allocMap.set(topMM.ticker, cashPct);

    console.log(
      `[allocation] Cash sweep: ${sweptPct.toFixed(1)}% swept → ` +
      `${cashPct.toFixed(1)}% to ${topMM.ticker} (score ${topMM.compositeScore})` +
      (sweptPct > mmCashCap ? ` [CAPPED — ${(sweptPct - cashPct).toFixed(1)}% redistributed]` : '')
    );
  } else {
    // No MM funds available or nothing swept — renormalize to 100%
    const survivorSum = Array.from(allocMap.values()).reduce((a, b) => a + b, 0) || 1;
    for (const [ticker, pct] of allocMap) {
      allocMap.set(ticker, (pct / survivorSum) * 100);
    }
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
  // MM funds may have received allocation via cash sweep even though they
  // are excluded from the Kelly curve. Check allocMap for all funds.
  const results: AllocationResult[] = withZ.map(fund => ({
    ticker: fund.ticker,
    allocationPct: allocMap.get(fund.ticker) ?? 0,
    tier: fund.tier,
    tierColor: fund.tierColor,
    modZ: fund.modZ,
    compositeScore: fund.compositeScore,
  }));

  // Sort by allocation descending (non-allocated at the bottom)
  results.sort((a, b) => b.allocationPct - a.allocationPct);

  return results;
}
