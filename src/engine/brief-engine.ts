/**
 * FundLens v6 — Investment Brief Engine (Session 8 Rewrite)
 *
 * Generates personalized Investment Briefs for each user. The brief reads
 * like advice from a knowledgeable friend — never like output from a model.
 *
 * Two-layer personalization (Master Reference §7):
 *
 *   Layer 1 — Raw Data Packet:
 *     Before Claude writes a word, we assemble actual financial data:
 *     expense ratios, company margins, returns, sector weights. NO scores,
 *     NO factor names, NO model internals. Claude forms its own narrative
 *     from the raw numbers.
 *
 *   Layer 2 — Editorial Policy:
 *     A versioned prompt file (editorial-policy.md) that governs voice,
 *     structure, and the "behind the curtain" rule — model mechanics
 *     never leak into the Brief.
 *
 * MANDATORY: Claude API calls are sequential with 1.2s delays.
 * NEVER Promise.all() — has crashed production 5+ times.
 *
 * Session 8 deliverable. References: Master Reference §7.1–§7.9.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE, BRIEF, KELLY_RISK_TABLE, RISK_MAX, MONEY_MARKET_TICKERS, ALLOCATION } from './constants.js';
import { computeCompositeFromZScores } from './scoring.js';
import type { FundZScores } from './scoring.js';
import { delay } from './types.js';
import type { UserProfileRow, FundScoresRow, InvestmentBriefRow, AllocationHistoryRow } from './types.js';
import type { FactorWeights } from './scoring.js';
import type { MacroThesis, SectorPreference } from './thesis.js';
import { computeAllocations } from './allocation.js';
import type { AllocationInput } from './allocation.js';
import { supaFetch, supaSelect, supaInsert } from './supabase.js';
// ─── Helpers ───────────────────────────────────────────────────────────────

/** Human-readable label for risk tolerance 1.0–7.0 (spec §3.4, §6.4).
 *  For exact integers, returns the anchor label. For fractional values,
 *  returns the nearest anchor label (rounds to nearest integer). */
function riskLabel(rt: number): string {
  const nearest = Math.round(Math.min(RISK_MAX, Math.max(1, rt)));
  const entry = KELLY_RISK_TABLE.find(r => r.level === nearest);
  return entry?.label ?? 'Moderate';
}

/**
 * Fetch the user's most recent prior allocation from allocation_history (§7.7).
 * Returns null if no prior allocation exists (first-time user).
 */
async function fetchPreviousAllocation(
  userId: string
): Promise<AllocationHistoryRow | null> {
  const { data } = await supaFetch<AllocationHistoryRow>('allocation_history', {
    params: {
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit: '1',
    },
    single: true,
  });
  return data ?? null;
}

/**
 * Persist the current allocation to allocation_history (§7.7).
 * Called after each Brief generation so future Briefs can compute deltas.
 */
async function persistAllocationHistory(
  userId: string,
  pipelineRunId: string,
  briefId: string | null,
  riskTolerance: number,
  allocation: Array<{ ticker: string; percentage: number; tier?: string; tierColor?: string }>
): Promise<void> {
  const allocations = allocation.map(a => ({
    ticker: a.ticker,
    pct: a.percentage,
    tier: a.tier ?? '',
    tierColor: a.tierColor ?? '',
  }));

  const { error } = await supaInsert('allocation_history', {
    user_id: userId,
    pipeline_run_id: pipelineRunId,
    brief_id: briefId,
    risk_tolerance: riskTolerance,
    allocations,
  });

  if (error) {
    console.error(`[brief-engine] Failed to persist allocation history: ${error}`);
  } else {
    console.log(`[brief-engine] Allocation history saved for user ${userId}`);
  }
}

/**
 * Compute allocation changes between current and previous allocation (§7.7).
 * Returns null if no previous allocation exists.
 */
function computeAllocationDelta(
  current: Array<{ ticker: string; name: string; percentage: number }>,
  previous: AllocationHistoryRow | null
): AllocationDelta[] | null {
  if (!previous) return null;

  const prevMap = new Map(
    (previous.allocations || []).map(a => [a.ticker, a.pct])
  );
  const currMap = new Map(
    current.map(a => [a.ticker, a.percentage])
  );
  const nameMap = new Map(
    current.map(a => [a.ticker, a.name])
  );

  const deltas: AllocationDelta[] = [];

  // New or changed positions
  for (const { ticker, name, percentage } of current) {
    const prevPct = prevMap.get(ticker);
    if (prevPct === undefined) {
      deltas.push({ ticker, name, change: 'new', currentPct: percentage, previousPct: 0 });
    } else if (Math.abs(percentage - prevPct) >= 1) {
      // Only report changes of 1% or more (below that is rounding noise)
      deltas.push({ ticker, name, change: 'changed', currentPct: percentage, previousPct: prevPct });
    }
  }

  // Removed positions (were in previous, not in current)
  for (const [ticker, prevPct] of prevMap) {
    if (!currMap.has(ticker)) {
      deltas.push({ ticker, name: ticker, change: 'removed', currentPct: 0, previousPct: prevPct });
    }
  }

  return deltas.length > 0 ? deltas : null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Key financial metrics for a single holding (extracted from factor_details) */
interface HoldingFinancials {
  name: string;
  ticker: string | null;
  /** Approximate weight in the fund (% of NAV) */
  weightPct: number;
  sector: string | null;
  /** Key profitability metrics (actual values, not scores) */
  profitability: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    returnOnEquity: number | null;
    returnOnAssets: number | null;
  };
  /** Balance sheet health */
  balanceSheet: {
    debtToEquity: number | null;
    currentRatio: number | null;
    interestCoverage: number | null;
  };
  /** Cash flow metrics */
  cashFlow: {
    freeCashFlowPerShare: number | null;
    operatingCashFlowPerShare: number | null;
  };
  /** Valuation multiples */
  valuation: {
    peRatio: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
  };
}

/** Fund return data (extracted from factor_details) */
interface FundReturns {
  threeMonth: number | null;
  sixMonth: number | null;
  nineMonth: number | null;
  twelveMonth: number | null;
}

/** Per-fund data assembled for the Brief prompt — raw data only, NO scores */
interface FundBriefData {
  ticker: string;
  name: string;
  /** Expense ratio as decimal (e.g. 0.0003 = 0.03%) */
  expenseRatio: number | null;
  /** Top holdings with actual financial metrics */
  holdingFinancials: HoldingFinancials[];
  /** Fund-level return data */
  returns: FundReturns;
  /** Sector exposure breakdown */
  sectorExposure: Array<{
    sector: string;
    /** Weight as decimal (e.g. 0.35 = 35%) */
    weight: number;
  }>;
  /** Coverage: what fraction of the fund's holdings had financial data */
  dataCoverage: number;
  /** Whether this is a bond-heavy fund */
  isBondFund: boolean;
  /** Number of factors using synthetic fallback data (0 = all real) */
  fallbackCount: number;
  /** Internal only — used for allocation computation, NOT sent to Claude */
  _composite: number;
  /** Internal only — used for ordering */
  _rank: number;
}

/** Complete data packet sent to Claude for Brief generation */
/** Change in a single fund's allocation between briefs */
interface AllocationDelta {
  ticker: string;
  name: string;
  /** 'new' = added this month, 'removed' = dropped, 'changed' = weight changed */
  change: 'new' | 'removed' | 'changed';
  /** Current allocation % (0 if removed) */
  currentPct: number;
  /** Previous allocation % (0 if new) */
  previousPct: number;
}

export interface BriefDataPacket {
  /** User profile summary (no model internals) */
  user: {
    riskTolerance: string;
    profileSummary: string;
  };
  /** Current macro environment */
  macro: {
    narrative: string;
    sectorPreferences: SectorPreference[];
    keyThemes: string[];
  };
  /** Per-fund raw data */
  funds: FundBriefData[];
  /** Recommended allocation with natural-language reasoning */
  allocation: Array<{
    ticker: string;
    name: string;
    percentage: number;
    reason: string;
  }>;
  /** Changes since last allocation (null if no prior allocation exists) */
  allocationDelta: AllocationDelta[] | null;
  /** Generation metadata */
  generatedAt: string;
  pipelineRunId: string;
}

/** Result from Brief generation */
export interface BriefGenerationResult {
  briefId: string;
  title: string;
  contentMd: string;
  dataPacket: BriefDataPacket;
  generationMs: number;
  model: string;
}

// ─── Raw Data Extraction ───────────────────────────────────────────────────

/**
 * Extract actual financial ratio values from a holding's quality dimensions.
 *
 * The factor_details JSON contains per-holding dimension breakdowns with
 * individual ratio scores. We pull the RAW VALUES (not scores) to feed Claude.
 */
function extractRatioValue(
  ratios: Array<{ name: string; value: number | null }> | undefined,
  name: string
): number | null {
  if (!ratios) return null;
  const found = ratios.find(r => r.name === name);
  return found?.value ?? null;
}

function extractHoldingFinancials(
  holdingScore: {
    ticker: string;
    name: string;
    dimensions?: {
      profitability?: { ratios?: Array<{ name: string; value: number | null }> };
      balanceSheet?: { ratios?: Array<{ name: string; value: number | null }> };
      cashFlow?: { ratios?: Array<{ name: string; value: number | null }> };
      valuation?: { ratios?: Array<{ name: string; value: number | null }> };
    };
  },
  weight: number,
  sector: string | null
): HoldingFinancials {
  const dims = holdingScore.dimensions;

  return {
    name: holdingScore.name,
    ticker: holdingScore.ticker,
    weightPct: weight,
    sector,
    profitability: {
      grossMargin: extractRatioValue(dims?.profitability?.ratios, 'Gross Profit Margin'),
      operatingMargin: extractRatioValue(dims?.profitability?.ratios, 'Operating Margin'),
      netMargin: extractRatioValue(dims?.profitability?.ratios, 'Net Profit Margin'),
      returnOnEquity: extractRatioValue(dims?.profitability?.ratios, 'Return on Equity'),
      returnOnAssets: extractRatioValue(dims?.profitability?.ratios, 'Return on Assets'),
    },
    balanceSheet: {
      debtToEquity: extractRatioValue(dims?.balanceSheet?.ratios, 'Debt to Equity'),
      currentRatio: extractRatioValue(dims?.balanceSheet?.ratios, 'Current Ratio'),
      interestCoverage: extractRatioValue(dims?.balanceSheet?.ratios, 'Interest Coverage'),
    },
    cashFlow: {
      freeCashFlowPerShare: extractRatioValue(dims?.cashFlow?.ratios, 'Free CF per Share'),
      operatingCashFlowPerShare: extractRatioValue(dims?.cashFlow?.ratios, 'Operating CF per Share'),
    },
    valuation: {
      peRatio: extractRatioValue(dims?.valuation?.ratios, 'P/E Ratio'),
      priceToBook: extractRatioValue(dims?.valuation?.ratios, 'P/B Ratio'),
      priceToSales: extractRatioValue(dims?.valuation?.ratios, 'Price to Sales'),
    },
  };
}

/**
 * Extract fund returns from factor_details.momentum
 */
function extractReturns(factorDetails: Record<string, unknown>): FundReturns {
  const momentum = factorDetails?.momentum as {
    returns?: { threeMonth: number | null; sixMonth: number | null; nineMonth: number | null; twelveMonth: number | null };
  } | undefined;

  return {
    threeMonth: momentum?.returns?.threeMonth ?? null,
    sixMonth: momentum?.returns?.sixMonth ?? null,
    nineMonth: momentum?.returns?.nineMonth ?? null,
    twelveMonth: momentum?.returns?.twelveMonth ?? null,
  };
}

// ─── Allocation Bridge ─────────────────────────────────────────────────────

/**
 * Bridge to the allocation engine with natural-language reason strings.
 *
 * The reason strings must NEVER reference model internals (scores, tiers,
 * z-scores, composites). Instead, they describe the fund in terms a human
 * advisor would use.
 */
function computeAllocationForBrief(
  rankedFunds: Array<{ ticker: string; name: string; composite: number; expenseRatio: number | null; isBondFund: boolean; fallbackCount?: number }>,
  riskTolerance: number
): Array<{ ticker: string; name: string; percentage: number; reason: string }> {

  if (rankedFunds.length === 0) return [];

  const inputs: AllocationInput[] = rankedFunds.map(f => ({
    ticker: f.ticker,
    compositeScore: f.composite,
    isMoneyMarket: MONEY_MARKET_TICKERS.has(f.ticker),
    fallbackCount: f.fallbackCount ?? 0,
  }));

  const results = computeAllocations(inputs, riskTolerance);

  const nameMap = new Map(rankedFunds.map(f => [f.ticker, f]));

  return results
    .filter(r => r.allocationPct > 0)
    .map(r => {
      const fund = nameMap.get(r.ticker);
      // Natural-language reason — no model internals
      const reason = buildAllocationReason(fund, r.allocationPct, rankedFunds.length);
      return {
        ticker: r.ticker,
        name: fund?.name ?? r.ticker,
        percentage: r.allocationPct,
        reason,
      };
    });
}

/**
 * Build a natural-language allocation reason.
 * This is included in the data packet so Claude has context for WHY
 * a fund was selected — but in terms Claude can repeat without
 * exposing model internals.
 */
function buildAllocationReason(
  fund: { ticker: string; name: string; expenseRatio: number | null; isBondFund: boolean } | undefined,
  pct: number,
  totalFunds: number
): string {
  if (!fund) return 'Included in allocation.';

  const parts: string[] = [];

  if (pct >= 25) {
    parts.push('Core position');
  } else if (pct >= 15) {
    parts.push('Significant allocation');
  } else if (pct >= 8) {
    parts.push('Supporting position');
  } else {
    parts.push('Smaller allocation for diversification');
  }

  if (fund.expenseRatio != null) {
    if (fund.expenseRatio <= 0.001) {
      parts.push('very low cost');
    } else if (fund.expenseRatio <= 0.005) {
      parts.push('low cost');
    } else if (fund.expenseRatio >= 0.01) {
      parts.push('higher cost but justified by other merits');
    }
  }

  if (fund.isBondFund) {
    parts.push('provides fixed income exposure');
  }

  return parts.join('; ') + '.';
}

/**
 * Generate a profile summary without exposing factor weights or model terms.
 */
function profileSummary(profile: UserProfileRow): string {
  const rt = profile.risk_tolerance;
  const label = riskLabel(rt);

  if (rt <= 2) {
    return `${label} investor who prefers stability, broad diversification, and keeping costs low.`;
  } else if (rt <= 3) {
    return `${label} investor who leans toward diversification with some willingness to be selective.`;
  } else if (rt <= 4) {
    return `${label} investor who balances growth potential with risk management.`;
  } else if (rt <= 5) {
    return `${label} investor who prioritizes growth and is comfortable with more concentrated positions.`;
  } else if (rt <= 6) {
    return `${label} investor who seeks high-conviction positions and accepts higher concentration.`;
  } else {
    return `${label} investor who seeks maximum conviction with highly concentrated positions.`;
  }
}

// ─── Data Packet Assembly ───────────────────────────────────────────────────

/**
 * Assemble the data packet for a user's Investment Brief.
 *
 * Pure data assembly — no AI calls. Gathers raw financial data from
 * Supabase and structures it for the prompt. NO scores, NO factor names,
 * NO model internals make it into the packet that Claude sees.
 */
export async function assembleDataPacket(
  userId: string,
  pipelineRunId: string
): Promise<BriefDataPacket | null> {

  // Fetch user profile
  const { data: profile } = await supaFetch<UserProfileRow>('user_profiles', {
    params: { id: `eq.${userId}` },
    single: true,
  });

  if (!profile) {
    console.error(`[brief-engine] No profile found for user ${userId}`);
    return null;
  }

  // Fetch latest scores from this pipeline run
  const { data: scoreRows } = await supaSelect<(FundScoresRow & { funds: { ticker: string; name: string; expense_ratio: number | null } })[]>(
    'fund_scores',
    {
      pipeline_run_id: `eq.${pipelineRunId}`,
      select: '*, funds(ticker, name, expense_ratio)',
      order: 'composite_default.desc',
    }
  );

  if (!scoreRows || scoreRows.length === 0) {
    console.error(`[brief-engine] No scores found for pipeline run ${pipelineRunId}`);
    return null;
  }

  // Fetch latest thesis
  const { data: thesisRow } = await supaFetch<{
    narrative: string;
    sector_preferences: Array<{ sector: string; score?: number; preference?: number; reasoning?: string; reason?: string }>;
    key_themes: string[];
    dominant_theme?: string;
    macro_stance?: string;
    risk_factors?: string[];
  }>('thesis_cache', {
    params: {
      pipeline_run_id: `eq.${pipelineRunId}`,
      order: 'generated_at.desc',
      limit: '1',
    },
    single: true,
  });

  const thesis: MacroThesis = thesisRow ? {
    narrative: thesisRow.narrative,
    sectorPreferences: (thesisRow.sector_preferences || []).map(sp => ({
      sector: String(sp.sector || ''),
      score: Number(sp.score ?? sp.preference ?? 5.0),
      reasoning: String(sp.reasoning || sp.reason || ''),
    })),
    keyThemes: thesisRow.key_themes || [],
    dominantTheme: (thesisRow as Record<string, unknown>).dominant_theme as string || '',
    macroStance: ((thesisRow as Record<string, unknown>).macro_stance as string || 'mixed') as MacroThesis['macroStance'],
    riskFactors: (thesisRow as Record<string, unknown>).risk_factors as string[] || [],
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  } : {
    narrative: 'Macro thesis unavailable.',
    sectorPreferences: [],
    keyThemes: [],
    dominantTheme: '',
    macroStance: 'mixed' as const,
    riskFactors: [],
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  };

  // Build user weights (used internally for composite, never sent to Claude)
  const userWeights: FactorWeights = {
    costEfficiency: profile.weight_cost,
    holdingsQuality: profile.weight_quality,
    positioning: profile.weight_positioning,
    momentum: profile.weight_momentum,
  };

  // Build per-fund data with RAW financials (no scores)
  const fundsData: FundBriefData[] = [];

  for (const row of scoreRows) {
    const fund = row.funds;

    // Compute user composite internally (for allocation only)
    const zScores: FundZScores = {
      costEfficiency: Number(row.z_cost_efficiency ?? 0),
      holdingsQuality: Number(row.z_holdings_quality ?? 0),
      positioning: Number(row.z_positioning ?? 0),
      momentum: Number(row.z_momentum ?? 0),
    };
    const composite = computeCompositeFromZScores(zScores, userWeights);

    // Extract raw financial data from factor_details
    const fd = row.factor_details as Record<string, unknown> || {};
    const qualityData = fd.holdingsQuality as {
      holdingScores?: Array<{
        ticker: string;
        name: string;
        weight?: number;
        dimensions?: Record<string, { ratios?: Array<{ name: string; value: number | null }> }>;
      }>;
      coveragePct?: number;
      bondRatio?: number;
    } | undefined;

    // Fetch top holdings for sector data
    const { data: holdings } = await supaSelect<Array<{
      name: string; ticker: string | null; sector: string | null; pct_of_nav: number;
    }>>(
      'holdings_cache',
      {
        fund_id: `eq.${row.fund_id}`,
        order: 'pct_of_nav.desc',
        limit: '10',
        select: 'name,ticker,sector,pct_of_nav',
      }
    );

    // Build holding financials by matching quality scores with holdings cache
    const holdingFinancials: HoldingFinancials[] = [];
    const holdingScores = qualityData?.holdingScores ?? [];

    for (const hs of holdingScores.slice(0, 8)) {
      // Find matching holding from cache for sector info
      const cachedHolding = holdings?.find(
        h => h.ticker === hs.ticker || h.name === hs.name
      );
      const sector = cachedHolding?.sector ?? null;
      const weight = hs.weight ?? cachedHolding?.pct_of_nav ?? 0;

      holdingFinancials.push(
        extractHoldingFinancials(
          hs as Parameters<typeof extractHoldingFinancials>[0],
          weight,
          sector
        )
      );
    }

    // Build sector exposure from holdings
    const sectorMap = new Map<string, number>();
    if (holdings) {
      for (const h of holdings) {
        const sector = h.sector || 'Unclassified';
        sectorMap.set(sector, (sectorMap.get(sector) || 0) + Number(h.pct_of_nav));
      }
    }
    const sectorExposure = Array.from(sectorMap.entries())
      .map(([sector, weight]) => ({ sector, weight }))
      .sort((a, b) => b.weight - a.weight);

    // Extract returns from momentum data
    const returns = extractReturns(fd);

    const isBondFund = (qualityData?.bondRatio ?? 0) > 0.5;

    fundsData.push({
      ticker: fund.ticker,
      name: fund.name,
      expenseRatio: fund.expense_ratio,
      holdingFinancials,
      returns,
      sectorExposure,
      dataCoverage: qualityData?.coveragePct ?? 0,
      isBondFund,
      fallbackCount: (fd as Record<string, unknown>).fallbackCount as number ?? 0,
      _composite: composite,
      _rank: 0,
    });
  }

  // Sort by composite and assign internal ranks
  fundsData.sort((a, b) => b._composite - a._composite);
  fundsData.forEach((f, i) => { f._rank = i + 1; });

  // Compute allocation via MAD-based Kelly engine
  const allocation = computeAllocationForBrief(
    fundsData.map(f => ({
      ticker: f.ticker,
      name: f.name,
      composite: f._composite,
      expenseRatio: f.expenseRatio,
      isBondFund: f.isBondFund,
      fallbackCount: f.fallbackCount,
    })),
    profile.risk_tolerance
  );

  // Fetch previous allocation for "What Changed" delta (§7.7)
  const previousAllocation = await fetchPreviousAllocation(userId);
  const allocationDelta = computeAllocationDelta(allocation, previousAllocation);

  return {
    user: {
      riskTolerance: `${riskLabel(profile.risk_tolerance)} (${profile.risk_tolerance.toFixed(1)}/${RISK_MAX})`,
      profileSummary: profileSummary(profile),
    },
    macro: {
      narrative: thesis.narrative,
      sectorPreferences: thesis.sectorPreferences,
      keyThemes: thesis.keyThemes,
    },
    funds: fundsData,
    allocation,
    allocationDelta,
    generatedAt: new Date().toISOString(),
    pipelineRunId,
  };
}

// ─── Prompt Building ────────────────────────────────────────────────────────

/**
 * Format a holding's financials as a concise text block for the prompt.
 * Only includes metrics that have actual values.
 */
function formatHoldingForPrompt(h: HoldingFinancials): string {
  const lines: string[] = [];
  lines.push(`  ${h.name}${h.ticker ? ` (${h.ticker})` : ''} — ${(h.weightPct * 100).toFixed(1)}% of fund${h.sector ? `, ${h.sector}` : ''}`);

  const profParts: string[] = [];
  if (h.profitability.operatingMargin != null) profParts.push(`operating margin ${(h.profitability.operatingMargin * 100).toFixed(1)}%`);
  if (h.profitability.netMargin != null) profParts.push(`net margin ${(h.profitability.netMargin * 100).toFixed(1)}%`);
  if (h.profitability.returnOnEquity != null) profParts.push(`ROE ${(h.profitability.returnOnEquity * 100).toFixed(1)}%`);
  if (profParts.length > 0) lines.push(`    Profitability: ${profParts.join(', ')}`);

  const balParts: string[] = [];
  if (h.balanceSheet.debtToEquity != null) balParts.push(`debt/equity ${h.balanceSheet.debtToEquity.toFixed(2)}`);
  if (h.balanceSheet.currentRatio != null) balParts.push(`current ratio ${h.balanceSheet.currentRatio.toFixed(2)}`);
  if (balParts.length > 0) lines.push(`    Balance sheet: ${balParts.join(', ')}`);

  const valParts: string[] = [];
  if (h.valuation.peRatio != null) valParts.push(`P/E ${h.valuation.peRatio.toFixed(1)}`);
  if (h.valuation.priceToBook != null) valParts.push(`P/B ${h.valuation.priceToBook.toFixed(1)}`);
  if (valParts.length > 0) lines.push(`    Valuation: ${valParts.join(', ')}`);

  return lines.join('\n');
}

/**
 * Build the user prompt with raw data in the 4-section "W" structure.
 *
 * This prompt contains ONLY raw financial data — no scores, no factor
 * names, no model internals. Claude forms its own narrative from the numbers.
 */
function buildUserPrompt(dataPacket: BriefDataPacket): string {
  const { user, macro, funds, allocation, allocationDelta } = dataPacket;

  // Separate allocated funds from non-allocated for emphasis ordering
  const allocatedTickers = new Set(allocation.map(a => a.ticker));
  const allocatedFunds = funds.filter(f => allocatedTickers.has(f.ticker));
  const otherFunds = funds.filter(f => !allocatedTickers.has(f.ticker));

  let prompt = `Write this user's Investment Brief following the editorial policy exactly.

## User Profile
- ${user.riskTolerance}
- ${user.profileSummary}

## Recommended Allocation
These are the funds and their target percentages. The allocation table itself will be rendered dynamically in the UI — do NOT include a markdown table of fund allocations in your output. Instead, in Section 1 ("Where the Numbers Point"), open with a brief rationale for each recommended fund. Reference funds by name and ticker but use qualitative sizing language (e.g., "a core position in FXAIX", "a meaningful allocation to DRRYX", "a smaller tactical position in RNWGX") rather than specific percentage numbers. The reader will see the exact percentages in the live table above your narrative.

Context (for your reference only — do not reproduce as a table):
${allocation.map(a =>
  `- ${a.name} (${a.ticker}): ${a.percentage}% — ${a.reason}`
).join('\n')}
`;

  // Allocation delta is woven into "What Happened" (§7.2: macro + allocation changes
  // as one cohesive cause-and-effect narrative, NOT separate sections)
  if (allocationDelta && allocationDelta.length > 0) {
    prompt += `
## Allocation Changes (for Section 2 — "What Happened")
Weave these changes INTO the macro narrative in Section 2. Do NOT create a separate section for them — the market story and the portfolio changes should read as one cohesive cause-and-effect narrative. Example: "With tech earnings strong and rates holding steady, we moved FXAIX up from 30% to 40%..."
${allocationDelta.map(d => {
  if (d.change === 'new') return `- NEW: ${d.name} (${d.ticker}) added at ${d.currentPct}%`;
  if (d.change === 'removed') return `- REMOVED: ${d.ticker} (was ${d.previousPct}%)`;
  const dir = d.currentPct > d.previousPct ? 'increased' : 'decreased';
  return `- CHANGED: ${d.name} (${d.ticker}) ${dir} from ${d.previousPct}% to ${d.currentPct}%`;
}).join('\n')}
`;
  } else if (allocationDelta === null) {
    prompt += `
## Note: First Brief
This is the user's first Brief — no prior allocation exists. Welcome them in Section 2.
`;
  }

  prompt += `
## Macro Environment
${macro.narrative}

### Sector Outlook
${macro.sectorPreferences.map(p =>
  `- ${p.sector}: ${p.reasoning || 'No detail available'}`
).join('\n')}

### Key Themes
${macro.keyThemes.map(t => `- ${t}`).join('\n')}

## Fund Data — Recommended Funds (cover in depth)
`;

  for (const fund of allocatedFunds) {
    prompt += formatFundBlock(fund);
  }

  prompt += `\n## Fund Data — Other Funds (cover briefly — why they didn't make the cut)\n`;

  for (const fund of otherFunds) {
    prompt += formatFundBlock(fund);
  }

  prompt += `\nWrite the complete Investment Brief now. Use this structure:
1. "Where the Numbers Point" — Lead with the recommended funds and why (no allocation table — it's rendered separately in the UI).
2. "Macro Environment" — The economic landscape grounded in specific data.
3. "Thematic Drivers" — The 2-3 forces shaping markets and connecting macro to sectors.
4. "Asset Class & Sector Outlook" — Where tailwinds and headwinds are, and the mechanisms.
5. "Portfolio Positioning" — How these views connect to the recommended holdings.

Formatting reminders:
- Bold fund names and tickers on first mention: **Fidelity 500 Index (FXAIX)**
- Bold sector and asset class names on first mention: **Technology**, **Consumer Staples**, **Fixed Income**
- If a concept might be over a general reader's head, add a brief parenthetical explainer (one clause, not a lecture)
Target 800-1200 words.`;

  return prompt;
}

/**
 * Format a single fund's raw data as a text block for the prompt.
 */
function formatFundBlock(fund: FundBriefData): string {
  let block = `\n### ${fund.name} (${fund.ticker})\n`;

  // Expense ratio
  if (fund.expenseRatio != null) {
    block += `- Annual expense ratio: ${(fund.expenseRatio * 100).toFixed(2)}%\n`;
  }

  // Returns
  const retParts: string[] = [];
  if (fund.returns.threeMonth != null) retParts.push(`3-mo: ${(fund.returns.threeMonth * 100).toFixed(1)}%`);
  if (fund.returns.sixMonth != null) retParts.push(`6-mo: ${(fund.returns.sixMonth * 100).toFixed(1)}%`);
  if (fund.returns.nineMonth != null) retParts.push(`9-mo: ${(fund.returns.nineMonth * 100).toFixed(1)}%`);
  if (fund.returns.twelveMonth != null) retParts.push(`12-mo: ${(fund.returns.twelveMonth * 100).toFixed(1)}%`);
  if (retParts.length > 0) {
    block += `- Returns: ${retParts.join(', ')}\n`;
  }

  // Sector exposure
  if (fund.sectorExposure.length > 0) {
    block += `- Sector exposure: ${fund.sectorExposure.slice(0, 5).map(s =>
      `${s.sector} ${(s.weight * 100).toFixed(1)}%`
    ).join(', ')}\n`;
  }

  // Bond fund flag
  if (fund.isBondFund) {
    block += `- This is primarily a bond fund\n`;
  }

  // Top holdings with financials
  if (fund.holdingFinancials.length > 0) {
    block += `- Top holdings:\n`;
    for (const h of fund.holdingFinancials.slice(0, 6)) {
      block += formatHoldingForPrompt(h) + '\n';
    }
  }

  // Data coverage note
  if (fund.dataCoverage < 0.40) {
    block += `- Note: Financial data available for only ${(fund.dataCoverage * 100).toFixed(0)}% of this fund's holdings\n`;
  }

  return block;
}

// ─── Brief Generation ───────────────────────────────────────────────────────

/**
 * Generate an Investment Brief for a user.
 *
 * Main entry point:
 *   1. Assembles raw data packet (no scores, no model internals)
 *   2. Reads editorial policy (voice and structure rules)
 *   3. Calls Claude Opus to write the Brief
 *   4. Saves to Supabase
 */
export async function generateBrief(
  userId: string,
  pipelineRunId: string,
  editorialPolicy: string
): Promise<BriefGenerationResult | null> {
  const startMs = Date.now();

  // ── Step 1: Assemble data packet ──
  console.log(`[brief-engine] Assembling data packet for user ${userId}`);
  const dataPacket = await assembleDataPacket(userId, pipelineRunId);

  if (!dataPacket) {
    console.error(`[brief-engine] Failed to assemble data packet for user ${userId}`);
    return null;
  }

  // ── Step 2: Build prompt ──
  const systemPrompt = editorialPolicy;
  const userPrompt = buildUserPrompt(dataPacket);

  // ── Step 3: Call Claude Opus ──
  console.log(`[brief-engine] Calling Claude ${CLAUDE.BRIEF_MODEL} for Brief generation`);

  const client = new Anthropic();
  let contentMd = '';

  try {
    const response = await client.messages.create({
      model: CLAUDE.BRIEF_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        contentMd += block.text;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brief-engine] Claude API error: ${msg}`);

    await supaInsert('investment_briefs', {
      user_id: userId,
      pipeline_run_id: pipelineRunId,
      title: `${BRIEF.DISPLAY_NAME} — Generation Failed`,
      content_md: '',
      data_packet: dataPacket,
      model_used: CLAUDE.BRIEF_MODEL,
      generation_ms: Date.now() - startMs,
      thesis_narrative: dataPacket.macro.narrative,
      status: 'failed',
    });

    return null;
  }

  await delay(CLAUDE.CALL_DELAY_MS);

  const generationMs = Date.now() - startMs;

  // ── Step 4: Generate title ──
  const today = new Date();
  const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const title = `${BRIEF.DISPLAY_NAME} — ${monthYear}`;

  // ── Step 5: Save to Supabase ──
  const { data: savedBrief, error } = await supaInsert<InvestmentBriefRow>('investment_briefs', {
    user_id: userId,
    pipeline_run_id: pipelineRunId,
    title,
    content_md: contentMd,
    data_packet: dataPacket,
    model_used: CLAUDE.BRIEF_MODEL,
    generation_ms: generationMs,
    thesis_narrative: dataPacket.macro.narrative,
    status: 'generated',
  }, { single: true });

  if (error || !savedBrief) {
    console.error(`[brief-engine] Failed to save Brief: ${error}`);
    return null;
  }

  // ── Step 6: Persist allocation to history (§7.7) ──
  // Fetch user profile risk_tolerance for the history record
  const { data: profileForHistory } = await supaFetch<UserProfileRow>('user_profiles', {
    params: { id: `eq.${userId}` },
    single: true,
  });

  if (profileForHistory) {
    await persistAllocationHistory(
      userId,
      pipelineRunId,
      savedBrief.id,
      profileForHistory.risk_tolerance,
      dataPacket.allocation.map(a => ({
        ticker: a.ticker,
        percentage: a.percentage,
      }))
    );
  }

  console.log(
    `[brief-engine] Brief generated for user ${userId}: ` +
    `${contentMd.length} chars, ${generationMs}ms, saved as ${savedBrief.id}`
  );

  return {
    briefId: savedBrief.id,
    title,
    contentMd,
    dataPacket,
    generationMs,
    model: CLAUDE.BRIEF_MODEL,
  };
}
