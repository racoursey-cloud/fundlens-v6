/**
 * FundLens v6 — Investment Brief Engine
 *
 * Generates personalized Investment Briefs for each user. This is the
 * core of what makes FundLens valuable — a monthly research document
 * that tells each user why their funds matter (or don't) given their
 * specific preferences and the current market environment.
 *
 * Two-layer personalization (Master Reference §7):
 *
 *   Layer 1 — Data Packet:
 *     Before Claude writes a word, we assemble a structured factual
 *     dossier for each user. Same underlying data, but with pre-computed
 *     "relevance tags" that highlight which data points matter most to
 *     THIS user based on their risk tolerance and factor weights.
 *
 *   Layer 2 — Editorial Policy:
 *     A versioned prompt file (editorial-policy.md) that governs how
 *     Claude writes the Brief. Every claim must cite a metric. Material
 *     negatives are never hidden. Personalization selects which truths
 *     to emphasize, never alters the truth.
 *
 * MANDATORY: Claude API calls are sequential with 1.2s delays.
 * NEVER Promise.all() — has crashed production 5+ times.
 *
 * Session 6 deliverable. Destination: src/engine/brief-engine.ts
 * References: Master Reference §7 (The Investment Brief).
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE, BRIEF, DEFAULT_FACTOR_WEIGHTS, KELLY_RISK_TABLE, RISK_MAX } from './constants.js';
import { computeComposite } from './scoring.js';
import { delay } from './types.js';
import type { UserProfileRow, FundScoresRow, InvestmentBriefRow } from './types.js';
import type { FundCompositeScore, FactorWeights } from './scoring.js';
import type { MacroThesis, SectorPreference } from './thesis.js';
import { supaFetch, supaSelect, supaInsert, supaUpdate } from './supabase.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Human-readable label for risk tolerance 1-7 (spec §3.4, §6.4) */
function riskLabel(rt: number): string {
  const entry = KELLY_RISK_TABLE.find(r => r.level === rt);
  return entry?.label ?? 'Moderate';
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Relevance tag attached to a fund in the data packet */
interface RelevanceTag {
  /** What the tag highlights (e.g. "Low expense ratio", "Precious metals exposure") */
  label: string;
  /** Why it matters for this user's profile */
  reason: string;
  /** The underlying data point */
  metric: string;
}

/** Per-fund data assembled for the Brief prompt */
interface FundBriefData {
  ticker: string;
  name: string;
  expenseRatio: number | null;
  /** Raw factor scores (0-100) */
  scores: {
    costEfficiency: number;
    holdingsQuality: number;
    positioning: number;
    momentum: number;
  };
  /** Composite score using THIS user's weights */
  userComposite: number;
  /** Rank among all funds using this user's weights */
  userRank: number;
  /** Composite score using default weights (for reference) */
  defaultComposite: number;
  /** Top holdings with sectors and weights */
  topHoldings: Array<{
    name: string;
    ticker: string | null;
    sector: string | null;
    weight: number;
  }>;
  /** Sector exposure breakdown */
  sectorExposure: Array<{
    sector: string;
    weight: number;
  }>;
  /** Factor-level detail (from scoring engine) */
  factorDetails: Record<string, unknown>;
  /** Pre-computed relevance tags for this user */
  relevanceTags: RelevanceTag[];
}

/** Complete data packet sent to Claude for Brief generation */
export interface BriefDataPacket {
  /** User profile summary */
  user: {
    riskTolerance: string; // e.g. "Moderate (5/9)"
    factorWeights: {
      costEfficiency: number;
      holdingsQuality: number;
      positioning: number;
      momentum: number;
    };
    /** What this user's profile emphasizes */
    profileSummary: string;
  };
  /** Current macro thesis */
  macro: {
    narrative: string;
    sectorPreferences: SectorPreference[];
    keyThemes: string[];
  };
  /** Per-fund data with relevance tags */
  funds: FundBriefData[];
  /** Recommended allocation for this user */
  allocation: Array<{
    ticker: string;
    name: string;
    percentage: number;
    reason: string;
  }>;
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

// ─── Data Packet Assembly ───────────────────────────────────────────────────

/**
 * Compute relevance tags for a fund based on the user's profile.
 *
 * This is Layer 1 personalization — selecting which truths to emphasize.
 * A conservative user and an aggressive user see the same fund data, but
 * different aspects are highlighted as relevant to THEIR posture.
 */
function computeRelevanceTags(
  fund: {
    ticker: string;
    scores: FundBriefData['scores'];
    expenseRatio: number | null;
    sectorExposure: Array<{ sector: string; weight: number }>;
    factorDetails: Record<string, unknown>;
  },
  userProfile: {
    riskTolerance: number;
    weights: FactorWeights;
  },
  thesis: MacroThesis
): RelevanceTag[] {
  const tags: RelevanceTag[] = [];
  const { riskTolerance, weights } = userProfile;

  // ── Cost Efficiency tags ──
  if (weights.costEfficiency >= 0.25) {
    if (fund.scores.costEfficiency >= 80) {
      tags.push({
        label: 'Low cost leader',
        reason: 'Cost Efficiency is weighted heavily in your profile',
        metric: `Cost Efficiency score: ${fund.scores.costEfficiency}/100` +
          (fund.expenseRatio != null ? `, expense ratio: ${(fund.expenseRatio * 100).toFixed(2)}%` : ''),
      });
    }
    if (fund.scores.costEfficiency <= 30) {
      tags.push({
        label: 'High cost concern',
        reason: 'You weight Cost Efficiency highly, and this fund scores poorly',
        metric: `Cost Efficiency score: ${fund.scores.costEfficiency}/100`,
      });
    }
  }

  // ── Holdings Quality tags ──
  if (weights.holdingsQuality >= 0.25) {
    if (fund.scores.holdingsQuality >= 75) {
      tags.push({
        label: 'Strong fundamentals',
        reason: 'Holdings Quality aligns with your emphasis on company health',
        metric: `Holdings Quality score: ${fund.scores.holdingsQuality}/100`,
      });
    }
    if (fund.scores.holdingsQuality <= 35) {
      tags.push({
        label: 'Weak fundamentals',
        reason: 'You prioritize holdings quality, and this fund\'s companies show weakness',
        metric: `Holdings Quality score: ${fund.scores.holdingsQuality}/100`,
      });
    }
  }

  // ── Positioning tags (thesis alignment) ──
  if (weights.positioning >= 0.20) {
    // Find sectors where the fund has heavy exposure AND thesis has strong preference
    for (const exposure of fund.sectorExposure) {
      if (exposure.weight < 0.10) continue; // skip small exposures

      const pref = thesis.sectorPreferences.find(
        p => p.sector.toLowerCase() === exposure.sector.toLowerCase()
      );
      if (!pref) continue;

      if (pref.preference >= 1.5 && exposure.weight >= 0.15) {
        tags.push({
          label: `${exposure.sector} alignment`,
          reason: `Thesis is bullish on ${exposure.sector}, fund has ${(exposure.weight * 100).toFixed(1)}% exposure`,
          metric: `Positioning score: ${fund.scores.positioning}/100, thesis preference: +${pref.preference}`,
        });
      }
      if (pref.preference <= -1.5 && exposure.weight >= 0.15) {
        tags.push({
          label: `${exposure.sector} headwind`,
          reason: `Thesis is bearish on ${exposure.sector}, fund has ${(exposure.weight * 100).toFixed(1)}% exposure`,
          metric: `Positioning score: ${fund.scores.positioning}/100, thesis preference: ${pref.preference}`,
        });
      }
    }
  }

  // ── Momentum tags ──
  if (weights.momentum >= 0.15) {
    if (fund.scores.momentum >= 80) {
      tags.push({
        label: 'Strong momentum',
        reason: 'Recent price trend confirms other factor signals',
        metric: `Momentum score: ${fund.scores.momentum}/100`,
      });
    }
    if (fund.scores.momentum <= 25) {
      tags.push({
        label: 'Weak momentum',
        reason: 'Recent price trend is lagging despite other factors',
        metric: `Momentum score: ${fund.scores.momentum}/100`,
      });
    }
  }

  // ── Risk-tolerance-specific tags ──
  if (riskTolerance <= 3) {
    // Conservative users (1-3) care about stability and cost
    const hasFixedIncome = fund.sectorExposure.find(
      s => s.sector.toLowerCase() === 'fixed income' && s.weight >= 0.20
    );
    if (hasFixedIncome) {
      tags.push({
        label: 'Fixed income anchor',
        reason: 'Conservative profile benefits from bond exposure for stability',
        metric: `Fixed income weight: ${(hasFixedIncome.weight * 100).toFixed(1)}%`,
      });
    }
  }

  if (riskTolerance >= 7) {
    // Aggressive users (7-9) care about growth and momentum
    const hasTech = fund.sectorExposure.find(
      s => s.sector.toLowerCase() === 'technology' && s.weight >= 0.20
    );
    if (hasTech && fund.scores.momentum >= 60) {
      tags.push({
        label: 'Growth + momentum combo',
        reason: 'Aggressive profile aligns with tech exposure backed by positive trend',
        metric: `Tech weight: ${(hasTech.weight * 100).toFixed(1)}%, Momentum: ${fund.scores.momentum}/100`,
      });
    }
  }

  return tags;
}

/**
 * Generate the recommended allocation using z-score weighted sizing.
 *
 * Cross-sectional signal weighting: the same approach quant firms use
 * to size positions proportional to signal strength. Composite scores
 * are z-scored across the fund universe — funds that "break away from
 * the pack" (high z-score) earn proportionally larger allocations.
 *
 * No artificial caps or floors on fund count. The statistics determine
 * everything:
 *   - If one fund is genuinely exceptional (z = 2.5), it dominates
 *   - If all funds cluster together (low standard deviation), allocation
 *     spreads out naturally — there's no breakaway to reward
 *
 * Risk tolerance controls the z-score THRESHOLD for inclusion.
 * If you score below the threshold, you're not in the recommendation —
 * there are better funds available. Mutual funds are already diversified
 * across hundreds of holdings, so spreading across too many funds just
 * dilutes the signal.
 *
 *   - Conservative (threshold 0.0σ): above-average funds only. You beat
 *     the pack, you're in. Widest net, but still excludes the bottom half.
 *   - Moderate (threshold +0.5σ): clearly above average. Separating from
 *     the middle of the menu.
 *   - Aggressive (threshold +1.0σ): statistical outliers. Only funds
 *     genuinely breaking away earn an allocation.
 *
 * Position sizes are proportional to (z - threshold), so the fund
 * right at the cutoff gets a small weight and the top scorer gets the
 * largest. The further a fund breaks away, the more it's rewarded.
 *
 * Academic basis: Grinold & Kahn's Fundamental Law of Active Management —
 * optimal portfolio weights are proportional to alpha signal strength.
 * Z-scoring IS that strength measurement.
 */
function computeAllocation(
  rankedFunds: Array<{ ticker: string; name: string; composite: number; rank: number }>,
  riskTolerance: number
): Array<{ ticker: string; name: string; percentage: number; reason: string }> {

  if (rankedFunds.length === 0) return [];

  // ── Step 1: Compute mean and standard deviation of composite scores ──
  const scores = rankedFunds.map(f => f.composite);
  const n = scores.length;
  const mean = scores.reduce((sum, s) => sum + s, 0) / n;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Edge case: zero variance means all funds scored identically.
  // No fund is breaking away — equal-weight the entire menu.
  if (stdDev < 0.01) {
    const equalPct = Math.round(100 / n);
    return rankedFunds.map((f, i) => ({
      ticker: f.ticker,
      name: f.name,
      percentage: i === 0 ? 100 - (equalPct * (n - 1)) : equalPct,
      reason: `Rank #${f.rank}, composite ${f.composite}/100 (no statistical separation)`,
    }));
  }

  // ── Step 2: Z-score each fund ──
  const zScored = rankedFunds.map(f => ({
    ...f,
    zScore: (f.composite - mean) / stdDev,
  }));

  // ── Step 3: Apply risk tolerance threshold ──
  // The threshold determines which funds qualify for allocation.
  // Conservative casts a wider net; aggressive demands separation.
  // Map 1-9 risk scale to z-score threshold:
  //   1 (most conservative) → 0.0  (above average — wide net)
  //   5 (moderate)           → 0.5  (clearly above average)
  //   9 (most aggressive)    → 1.0  (statistical outliers only)
  const threshold = (riskTolerance - 1) / 8;

  // ── Step 4: Filter to funds above the threshold ──
  const qualifying = zScored.filter(f => f.zScore > threshold);

  // Safety net: if threshold excludes everything (possible with aggressive
  // when scores are tightly clustered), include the top scorer.
  if (qualifying.length === 0) {
    const best = zScored[0]; // already sorted by composite descending
    return [{
      ticker: best.ticker,
      name: best.name,
      percentage: 100,
      reason: `Rank #${best.rank}, composite ${best.composite}/100, z ${best.zScore.toFixed(2)}σ (sole qualifier)`,
    }];
  }

  // ── Step 5: Size positions proportional to (z - threshold) ──
  // The fund right at the cutoff gets a small weight.
  // The further a fund breaks away, the more it's rewarded.
  const withWeight = qualifying.map(f => ({
    ...f,
    weight: f.zScore - threshold,
  }));

  const totalWeight = withWeight.reduce((sum, f) => sum + f.weight, 0);

  const rawAllocation = withWeight.map(f => ({
    ticker: f.ticker,
    name: f.name,
    rawPct: (f.weight / totalWeight) * 100,
    rank: f.rank,
    composite: f.composite,
    zScore: f.zScore,
  }));

  // Drop funds that round to less than 1% — rounding noise, not a
  // meaningful position. The z-score barely cleared the threshold.
  const meaningful = rawAllocation.filter(a => a.rawPct >= 0.5);

  // Re-normalize to sum to exactly 100
  const meaningfulSum = meaningful.reduce((sum, a) => sum + a.rawPct, 0);
  const allocation = meaningful.map(a => ({
    ticker: a.ticker,
    name: a.name,
    percentage: Math.round((a.rawPct / meaningfulSum) * 100),
    reason: `Rank #${a.rank}, composite ${a.composite}/100, z ${a.zScore.toFixed(2)}σ`,
  }));

  // Fix rounding to exactly 100
  const roundedSum = allocation.reduce((sum, a) => sum + a.percentage, 0);
  if (roundedSum !== 100 && allocation.length > 0) {
    allocation[0].percentage += 100 - roundedSum;
  }

  return allocation;
}

/**
 * Generate a profile summary string for the prompt.
 */
function profileSummary(profile: UserProfileRow): string {
  const emphasis: string[] = [];
  if (profile.weight_quality >= 0.30) emphasis.push('company fundamentals');
  if (profile.weight_cost >= 0.30) emphasis.push('low costs');
  if (profile.weight_positioning >= 0.30) emphasis.push('macro positioning');
  if (profile.weight_momentum >= 0.25) emphasis.push('recent performance trends');

  // SESSION 1: Updated for 7-point scale (spec §3.4)
  const toleranceDesc =
    profile.risk_tolerance <= 1 ? 'prefers stability and maximum diversification' :
    profile.risk_tolerance <= 2 ? 'prefers stability and broad diversification' :
    profile.risk_tolerance <= 3 ? 'leans conservative, favoring diversification with some selectivity' :
    profile.risk_tolerance <= 4 ? 'balances growth with risk management' :
    profile.risk_tolerance <= 5 ? 'prioritizes growth and is comfortable with concentration' :
    profile.risk_tolerance <= 6 ? 'seeks high conviction with concentrated positions' :
             'seeks maximum conviction with highly concentrated positions';

  const toleranceLabel = riskLabel(profile.risk_tolerance);

  return `${toleranceLabel} investor (${profile.risk_tolerance}/${RISK_MAX}) who ${toleranceDesc}` +
    (emphasis.length > 0 ? `. Emphasizes: ${emphasis.join(', ')}` : '');
}

// ─── Brief Generation ───────────────────────────────────────────────────────

/**
 * Assemble the data packet for a user's Investment Brief.
 *
 * This is pure data assembly — no AI calls. Gathers scores, holdings,
 * thesis, and computes relevance tags based on the user's profile.
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
    sector_preferences: SectorPreference[];
    key_themes: string[];
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
    sectorPreferences: thesisRow.sector_preferences,
    keyThemes: thesisRow.key_themes,
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  } : {
    narrative: 'Macro thesis unavailable.',
    sectorPreferences: [],
    keyThemes: [],
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  };

  // Build user weights
  const userWeights: FactorWeights = {
    costEfficiency: profile.weight_cost,
    holdingsQuality: profile.weight_quality,
    positioning: profile.weight_positioning,
    momentum: profile.weight_momentum,
  };

  // Build per-fund data with user-specific composites and relevance tags
  const fundsData: FundBriefData[] = [];

  for (const row of scoreRows) {
    const fund = row.funds;
    const raw = {
      ticker: fund.ticker,
      name: fund.name,
      costEfficiency: Number(row.cost_efficiency),
      holdingsQuality: Number(row.holdings_quality),
      positioning: Number(row.positioning),
      momentum: Number(row.momentum),
    };

    const userComposite = computeComposite(raw, userWeights);

    // Fetch top holdings for this fund
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

    const scores = {
      costEfficiency: Number(row.cost_efficiency),
      holdingsQuality: Number(row.holdings_quality),
      positioning: Number(row.positioning),
      momentum: Number(row.momentum),
    };

    const relevanceTags = computeRelevanceTags(
      { ticker: fund.ticker, scores, expenseRatio: fund.expense_ratio, sectorExposure, factorDetails: row.factor_details },
      { riskTolerance: profile.risk_tolerance, weights: userWeights },
      thesis
    );

    fundsData.push({
      ticker: fund.ticker,
      name: fund.name,
      expenseRatio: fund.expense_ratio,
      scores,
      userComposite,
      userRank: 0, // assigned after sorting
      defaultComposite: Number(row.composite_default),
      topHoldings: (holdings || []).map(h => ({
        name: h.name,
        ticker: h.ticker,
        sector: h.sector,
        weight: Number(h.pct_of_nav),
      })),
      sectorExposure,
      factorDetails: row.factor_details,
      relevanceTags,
    });
  }

  // Sort by user's composite and assign ranks
  fundsData.sort((a, b) => b.userComposite - a.userComposite);
  fundsData.forEach((f, i) => { f.userRank = i + 1; });

  // Compute allocation
  const allocation = computeAllocation(
    fundsData.map(f => ({ ticker: f.ticker, name: f.name, composite: f.userComposite, rank: f.userRank })),
    profile.risk_tolerance
  );

  return {
    user: {
      riskTolerance: `${riskLabel(profile.risk_tolerance)} (${profile.risk_tolerance}/${RISK_MAX})`,
      factorWeights: {
        costEfficiency: profile.weight_cost,
        holdingsQuality: profile.weight_quality,
        positioning: profile.weight_positioning,
        momentum: profile.weight_momentum,
      },
      profileSummary: profileSummary(profile),
    },
    macro: {
      narrative: thesis.narrative,
      sectorPreferences: thesis.sectorPreferences,
      keyThemes: thesis.keyThemes,
    },
    funds: fundsData,
    allocation,
    generatedAt: new Date().toISOString(),
    pipelineRunId,
  };
}

/**
 * Generate an Investment Brief for a user.
 *
 * This is the main entry point. It:
 *   1. Assembles the data packet (Layer 1 — personalized data selection)
 *   2. Reads the editorial policy (Layer 2 — how to write)
 *   3. Calls Claude Opus to write the Brief
 *   4. Saves the Brief to Supabase
 *   5. Returns the Brief ID and content
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

  const userPrompt = `Here is the data packet for this user's Investment Brief. Write the Brief following the editorial policy exactly.

## User Profile
- Risk tolerance: ${dataPacket.user.riskTolerance}
- Profile: ${dataPacket.user.profileSummary}
- Factor weights: Cost Efficiency ${(dataPacket.user.factorWeights.costEfficiency * 100).toFixed(0)}%, Holdings Quality ${(dataPacket.user.factorWeights.holdingsQuality * 100).toFixed(0)}%, Positioning ${(dataPacket.user.factorWeights.positioning * 100).toFixed(0)}%, Momentum ${(dataPacket.user.factorWeights.momentum * 100).toFixed(0)}%

## Macro Environment
${dataPacket.macro.narrative}

### Sector Preferences
${dataPacket.macro.sectorPreferences.map(p =>
  `- ${p.sector}: ${p.preference > 0 ? '+' : ''}${p.preference} (${p.reasoning || 'no detail'})`
).join('\n')}

### Key Themes
${dataPacket.macro.keyThemes.map(t => `- ${t}`).join('\n')}

## Fund Scores and Data
${dataPacket.funds.map(f => `
### ${f.name} (${f.ticker})
- **Composite score**: ${f.userComposite}/100 (rank #${f.userRank} of ${dataPacket.funds.length})
- **Factor scores**: Cost Efficiency ${f.scores.costEfficiency}, Holdings Quality ${f.scores.holdingsQuality}, Positioning ${f.scores.positioning}, Momentum ${f.scores.momentum}
${f.expenseRatio != null ? `- **Expense ratio**: ${(f.expenseRatio * 100).toFixed(2)}%` : ''}
- **Top holdings**: ${f.topHoldings.slice(0, 5).map(h =>
    `${h.name}${h.ticker ? ` (${h.ticker})` : ''} at ${(h.weight * 100).toFixed(1)}%${h.sector ? ` [${h.sector}]` : ''}`
  ).join('; ')}
- **Sector exposure**: ${f.sectorExposure.slice(0, 5).map(s =>
    `${s.sector} ${(s.weight * 100).toFixed(1)}%`
  ).join(', ')}
${f.relevanceTags.length > 0 ? `- **Relevance to your profile**:\n${f.relevanceTags.map(t =>
    `  - ${t.label}: ${t.reason} (${t.metric})`
  ).join('\n')}` : ''}
`).join('\n')}

## Recommended Allocation
${dataPacket.allocation.map(a =>
  `- ${a.name} (${a.ticker}): ${a.percentage}% — ${a.reason}`
).join('\n')}

Write the complete Investment Brief now. Follow the Content Structure in the editorial policy (Macro Environment Summary → Thesis and Sector Views → Fund-by-Fund Highlights → Allocation Recommendation). Target 800-1200 words.`;

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

    // Extract text from response
    for (const block of response.content) {
      if (block.type === 'text') {
        contentMd += block.text;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brief-engine] Claude API error: ${msg}`);

    // Save failed brief for debugging
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
