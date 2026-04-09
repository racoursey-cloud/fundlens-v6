/**
 * FundLens v6 — Portfolio Page
 *
 * Primary view — rebuilt in Session 11 to match v5.1's visual layout while
 * preserving v6 improvements (4 factors, continuous risk slider, z-score rescore).
 *
 * Layout (top to bottom):
 *   1. Two SVG donut charts (Sector Exposure + Fund Allocation) with drill-in
 *   2. Fund table (7 columns: Fund, Score, Tier, Cost, Quality, Momentum, Positioning)
 *   3. Factor weight sliders (4 sliders, proportional redistribution)
 *   4. Risk slider (continuous 1.0–7.0, step 0.1)
 *
 * Drill-in behavior:
 *   - Left donut (Sector Exposure): click a sector → shows company holdings in that sector
 *   - Right donut (Fund Allocation): click a fund → opens FundDetail sidebar
 *
 * Session 11 deliverable. Destination: client/src/pages/Portfolio.tsx
 * References: Spec §6.1–§6.7, v5.1 PortfolioTab.jsx
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchScores,
  fetchProfile,
  updateProfile,
  type FundScore,
  type PipelineRun,
  type UserProfile,
} from '../api';
import { theme } from '../theme';
import { DonutChart, DonutLegend, type DonutSlice, type DonutDrillItem } from '../components/DonutChart';
import { FundDetail } from '../components/FundDetail';
import { computeClientAllocations, type ClientAllocationInput } from '../engine/allocation';

// ─── Normal CDF (Abramowitz & Stegun 7.1.26) ──────────────────────────────
// Identical to server-side normalCDF in src/engine/scoring.ts.

function normalCDF(z: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const absZ = Math.abs(z);
  const x = absZ / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);
  const result = 0.5 * (1.0 + erf);
  return z >= 0 ? result : 1.0 - result;
}

// ─── Tier Badge Computation (§6.3) ────────────────────────────────────────

const TIER_BADGES = [
  { tier: 'Breakaway', zMin: 2.0, color: '#F59E0B' },
  { tier: 'Strong',    zMin: 1.2, color: '#10B981' },
  { tier: 'Solid',     zMin: 0.3, color: '#3B82F6' },
  { tier: 'Neutral',   zMin: -0.5, color: '#6B7280' },
  { tier: 'Weak',      zMin: -Infinity, color: '#EF4444' },
] as const;

const MAD_CONSISTENCY = 0.6745;
const MM_TICKERS = new Set(['FDRXX', 'ADAXX']);

function clientMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function computeClientTier(
  ticker: string,
  composite: number,
  allComposites: { ticker: string; composite: number }[]
): { tier: string; tierColor: string } {
  if (MM_TICKERS.has(ticker)) return { tier: 'MM', tierColor: '#4B5563' };
  const nonMM = allComposites.filter(f => !MM_TICKERS.has(f.ticker));
  if (nonMM.length === 0) return { tier: 'Neutral', tierColor: '#6B7280' };
  const scores = nonMM.map(f => f.composite);
  const med = clientMedian(scores);
  const mad = clientMedian(scores.map(s => Math.abs(s - med)));
  const safeMad = mad > 0 ? mad : 1e-9;
  const modZ = MAD_CONSISTENCY * (composite - med) / safeMad;
  for (const badge of TIER_BADGES) {
    if (modZ >= badge.zMin) return { tier: badge.tier, tierColor: badge.color };
  }
  return { tier: 'Weak', tierColor: '#EF4444' };
}

// ─── Sector Colors (GICS standard) ──────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
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

const FUND_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a78bfa',
  '#fb923c', '#84cc16',
];

// ─── Score color helpers ────────────────────────────────────────────────────

function scoreBg(score: number): string {
  if (score >= 75) return '#22c55e22';
  if (score >= 50) return '#3b82f622';
  if (score >= 25) return '#f59e0b22';
  return '#ef444422';
}
function scoreColor(score: number): string {
  if (score >= 75) return theme.colors.success;
  if (score >= 50) return theme.colors.accentBlue;
  if (score >= 25) return theme.colors.warning;
  return theme.colors.error;
}

// ─── Risk Slider ─────────────────────────────────────────────────────────────

const RISK_ANCHORS: Array<{ level: number; label: string }> = [
  { level: 1, label: 'Very Conservative' },
  { level: 2, label: 'Conservative' },
  { level: 3, label: 'Mod. Conservative' },
  { level: 4, label: 'Moderate' },
  { level: 5, label: 'Mod. Aggressive' },
  { level: 6, label: 'Aggressive' },
  { level: 7, label: 'Very Aggressive' },
];

function nearestRiskLabel(value: number): string {
  const nearest = Math.round(Math.min(7, Math.max(1, value)));
  return RISK_ANCHORS.find(a => a.level === nearest)?.label ?? 'Moderate';
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function Portfolio() {
  const { user: _user } = useAuth();
  const [scores, setScores] = useState<FundScore[]>([]);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [_profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  // Factor weight sliders (stored as fractions 0–1)
  const [weights, setWeights] = useState({
    cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25,
  });
  const [risk, setRisk] = useState<number>(4.0);

  useEffect(() => {
    Promise.all([fetchScores(), fetchProfile()]).then(([scoresRes, profileRes]) => {
      if (scoresRes.data?.scores) setScores(scoresRes.data.scores);
      if (scoresRes.data?.pipelineRun) setPipelineRun(scoresRes.data.pipelineRun as unknown as PipelineRun);
      if (profileRes.data?.profile) {
        const p = profileRes.data.profile;
        setProfile(p);
        setWeights({
          cost: p.weight_cost,
          quality: p.weight_quality,
          positioning: p.weight_positioning,
          momentum: p.weight_momentum,
        });
        setRisk(p.risk_tolerance);
      }
      setLoading(false);
    });
  }, []);

  // Proportional redistribution when a slider changes
  const handleWeightChange = useCallback((key: keyof typeof weights, newVal: number) => {
    setWeights(prev => {
      const others = Object.keys(prev).filter(k => k !== key) as Array<keyof typeof weights>;
      const remaining = 1 - newVal;
      const otherSum = others.reduce((s, k) => s + prev[k], 0);
      const next = { ...prev, [key]: newVal };
      if (otherSum > 0) {
        for (const k of others) {
          next[k] = Math.max(0.05, (prev[k] / otherSum) * remaining);
        }
      } else {
        const share = remaining / others.length;
        for (const k of others) next[k] = share;
      }
      // Normalize to exactly 1.0
      const total = Object.values(next).reduce((s, v) => s + v, 0);
      for (const k of Object.keys(next) as Array<keyof typeof weights>) {
        next[k] = next[k] / total;
      }
      return next;
    });
  }, []);

  // Persist preferences
  const savePreferences = useCallback(() => {
    updateProfile({
      weight_cost: weights.cost,
      weight_quality: weights.quality,
      weight_positioning: weights.positioning,
      weight_momentum: weights.momentum,
      risk_tolerance: risk,
    });
  }, [weights, risk]);

  const handleRiskChange = useCallback((val: number) => {
    setRisk(val);
    updateProfile({ risk_tolerance: val });
  }, []);

  // Client-side rescore with z-scores + CDF (§2.1)
  const rankedScores = useMemo(() => {
    const withComposites = scores.map(s => {
      const zComposite =
        (s.z_cost_efficiency ?? 0) * weights.cost +
        (s.z_holdings_quality ?? 0) * weights.quality +
        (s.z_positioning ?? 0) * weights.positioning +
        (s.z_momentum ?? 0) * weights.momentum;
      const composite = Math.round(Math.max(0, Math.min(100, 100 * normalCDF(zComposite))));
      return { ...s, userComposite: composite };
    });

    const allComposites = withComposites.map(s => ({
      ticker: s.funds?.ticker || s.fund_id,
      composite: s.userComposite,
    }));

    return withComposites
      .map(s => {
        const ticker = s.funds?.ticker || s.fund_id;
        const tierInfo = computeClientTier(ticker, s.userComposite, allComposites);
        return { ...s, userTier: tierInfo.tier, userTierColor: tierInfo.tierColor };
      })
      .sort((a, b) => {
        // Money market always sorts to bottom
        const aTicker = a.funds?.ticker || a.fund_id;
        const bTicker = b.funds?.ticker || b.fund_id;
        const aIsMM = MM_TICKERS.has(aTicker);
        const bIsMM = MM_TICKERS.has(bTicker);
        if (aIsMM && !bIsMM) return 1;
        if (!aIsMM && bIsMM) return -1;
        return b.userComposite - a.userComposite;
      });
  }, [scores, weights]);

  // ── Client-side allocation (§3.1–3.6) ────────────────────────────────────
  const allocations = useMemo(() => {
    const inputs: ClientAllocationInput[] = rankedScores.map(s => ({
      ticker: s.funds?.ticker || s.fund_id,
      compositeScore: s.userComposite,
      isMoneyMarket: MM_TICKERS.has(s.funds?.ticker || s.fund_id),
      fallbackCount: (s.factor_details as Record<string, unknown>)?.fallbackCount as number ?? 0,
    }));

    return computeClientAllocations(inputs, risk);
  }, [rankedScores, risk]);

  const allocMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      if (a.allocationPct > 0) map.set(a.ticker, a.allocationPct);
    }
    return map;
  }, [allocations]);

  // ── Sector Exposure donut slices ──────────────────────────────────────────

  const { sectorSlices, sectorDrillData } = useMemo(() => {
    const sectorAgg = new Map<string, number>();
    const sectorHoldings = new Map<string, DonutDrillItem[]>();

    for (const s of scores) {
      const details = s.factor_details as Record<string, unknown> | undefined;
      const sectors = (details?.sectorExposure || details?.sectors) as Record<string, number> | undefined;
      const holdings = (details?.holdings || details?.topHoldings) as Array<{
        name?: string; ticker?: string; sector?: string; weight?: number; pct_of_nav?: number;
      }> | undefined;

      if (sectors) {
        for (const [sector, weight] of Object.entries(sectors)) {
          sectorAgg.set(sector, (sectorAgg.get(sector) || 0) + weight);
        }
      }

      // Build drill-in data: holdings grouped by sector
      if (holdings) {
        for (const h of holdings) {
          const sector = h.sector || 'Other';
          const weight = h.weight ?? h.pct_of_nav ?? 0;
          if (weight <= 0) continue;
          const existing = sectorHoldings.get(sector) || [];
          existing.push({
            name: h.name || 'Unknown',
            ticker: h.ticker,
            weight: weight * 100, // Convert to percentage
          });
          sectorHoldings.set(sector, existing);
        }
      }
    }

    // Sort holdings within each sector by weight descending
    for (const [sector, items] of sectorHoldings.entries()) {
      sectorHoldings.set(sector, items.sort((a, b) => b.weight - a.weight).slice(0, 20));
    }

    const total = [...sectorAgg.values()].reduce((s, v) => s + v, 0);
    const slices: DonutSlice[] = [...sectorAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => total > 0 && (v / total) * 100 > 0.1)
      .map(([label, value]) => ({
        id: label,
        label,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: SECTOR_COLORS[label] ?? '#71717a',
      }));

    return { sectorSlices: slices, sectorDrillData: sectorHoldings };
  }, [scores]);

  // ── Fund Allocation donut slices ──────────────────────────────────────────

  const fundSlices = useMemo((): DonutSlice[] => {
    return allocations
      .filter(a => a.allocationPct > 0)
      .map((a, i) => ({
        id: a.ticker,
        label: a.ticker,
        pct: a.allocationPct,
        color: FUND_PALETTE[i % FUND_PALETTE.length]!,
      }));
  }, [allocations]);

  // ─── Loading / Empty states ───────────────────────────────────────────────

  if (loading) {
    return <div style={{ color: theme.colors.textMuted, padding: '32px' }}>Loading portfolio...</div>;
  }

  if (scores.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, gap: 16, color: theme.colors.textMuted, textAlign: 'center', padding: 40,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textDim} strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text }}>No portfolio data yet</div>
        <div style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
          Run the scoring pipeline to generate fund scores and allocation recommendations.
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '24px 0' }}>

      {/* ── Donuts Row ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24,
      }}>
        {/* Sector Exposure donut (left) — click drills into holdings */}
        <div style={{
          background: theme.colors.surface, borderRadius: theme.radii.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          {sectorSlices.length > 0 ? (
            <>
              <DonutChart
                slices={sectorSlices}
                size={220}
                title="Aggregate Sector Exposure"
                drillData={sectorDrillData}
              />
              <DonutLegend items={sectorSlices} />
            </>
          ) : (
            <div style={{ color: theme.colors.textDim, fontSize: 13, padding: 40, textAlign: 'center' }}>
              No holdings data available for sector breakdown.
            </div>
          )}
        </div>

        {/* Fund Allocation donut (right) — click opens FundDetail sidebar */}
        <div style={{
          background: theme.colors.surface, borderRadius: theme.radii.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <DonutChart
            slices={fundSlices}
            size={220}
            title="Recommended Allocation"
            onSliceClick={(slice) => setSelectedFund(slice.id)}
          />
          <DonutLegend
            items={fundSlices}
            onItemClick={(item) => setSelectedFund(item.id)}
          />
        </div>
      </div>

      {/* ── Fund Table ──────────────────────────────────────────────── */}
      <div style={{
        background: theme.colors.surface, borderRadius: theme.radii.lg,
        border: `1px solid ${theme.colors.border}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Fund Scores
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                {['Fund', 'Alloc', 'Score', 'Tier', 'Cost', 'Quality', 'Momentum', 'Position'].map((h, idx) => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    textAlign: idx === 0 ? 'left' : 'center',
                    fontWeight: 600, color: theme.colors.textDim, fontSize: 11,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankedScores.map((s, i) => {
                const ticker = s.funds?.ticker || s.fund_id.slice(0, 8);
                const name = s.funds?.name || '';
                const isSelected = selectedFund === ticker;
                return (
                  <React.Fragment key={s.id}>
                    <tr
                      onClick={() => setSelectedFund(isSelected ? null : ticker)}
                      style={{
                        borderBottom: (!isSelected && i < rankedScores.length - 1) ? `1px solid ${theme.colors.border}` : 'none',
                        cursor: 'pointer',
                        background: isSelected ? theme.colors.surfaceHover : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = theme.colors.surfaceHover;
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Fund (ticker + name) */}
                      <td style={{ padding: '10px 16px', textAlign: 'left' }}>
                        <span style={{
                          fontWeight: 700, color: theme.colors.accentBlue,
                          fontFamily: theme.fonts.mono, letterSpacing: '0.02em',
                        }}>
                          {ticker}
                        </span>
                        {name && (
                          <span style={{
                            marginLeft: 8, fontSize: 12, color: theme.colors.textDim,
                            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {name}
                          </span>
                        )}
                      </td>
                      {/* Allocation % */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {(() => {
                          const alloc = allocMap.get(ticker);
                          if (!alloc) return <span style={{ color: theme.colors.textDim }}>—</span>;
                          return (
                            <span style={{
                              fontWeight: 700,
                              fontFamily: theme.fonts.mono,
                              color: theme.colors.text,
                              fontSize: 14,
                            }}>
                              {alloc}%
                            </span>
                          );
                        })()}
                      </td>
                      {/* Score */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: scoreBg(s.userComposite),
                          color: scoreColor(s.userComposite),
                          fontWeight: 700, fontFamily: theme.fonts.mono,
                          fontSize: 14,
                        }}>
                          {s.userComposite}
                        </span>
                      </td>
                      {/* Tier */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11,
                          fontWeight: 600, letterSpacing: '0.03em',
                          color: s.userTierColor,
                          background: `${s.userTierColor}18`,
                          border: `1px solid ${s.userTierColor}40`,
                        }}>
                          {s.userTier}
                        </span>
                      </td>
                      {/* Factor scores */}
                      <td style={tdFactorStyle}>
                        <span style={{ color: scoreColor(s.cost_efficiency) }}>{s.cost_efficiency.toFixed(0)}</span>
                      </td>
                      <td style={tdFactorStyle}>
                        <span style={{ color: scoreColor(s.holdings_quality) }}>{s.holdings_quality.toFixed(0)}</span>
                      </td>
                      <td style={tdFactorStyle}>
                        <span style={{ color: scoreColor(s.momentum) }}>{s.momentum.toFixed(0)}</span>
                      </td>
                      <td style={tdFactorStyle}>
                        <span style={{ color: scoreColor(s.positioning) }}>{s.positioning.toFixed(0)}</span>
                      </td>
                    </tr>
                    {/* Inline holdings expansion */}
                    {isSelected && (
                      <FundDetail
                        ticker={ticker}
                        onClose={() => setSelectedFund(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline timestamp */}
      {pipelineRun && (
        <div style={{ fontSize: 12, color: theme.colors.textDim }}>
          Scores from {(() => {
            const ts = pipelineRun.completed_at || pipelineRun.started_at;
            if (!ts) return 'pending pipeline run';
            const d = new Date(ts);
            return isNaN(d.getTime()) ? 'unknown date' : d.toLocaleString();
          })()}
        </div>
      )}

      {/* ── Sliders: Weights + Risk ──────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24,
      }}>
        {/* Factor weight sliders */}
        <div style={{
          background: theme.colors.surface, borderRadius: theme.radii.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Factor Weights
          </div>

          <WeightSlider label="Cost Efficiency" value={weights.cost}
            onChange={(v) => handleWeightChange('cost', v)} />
          <WeightSlider label="Holdings Quality" value={weights.quality}
            onChange={(v) => handleWeightChange('quality', v)} />
          <WeightSlider label="Momentum" value={weights.momentum}
            onChange={(v) => handleWeightChange('momentum', v)} />
          <WeightSlider label="Positioning" value={weights.positioning}
            onChange={(v) => handleWeightChange('positioning', v)} />

          {/* Weight sum indicator */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
            paddingTop: 4, borderTop: `1px solid ${theme.colors.border}`,
          }}>
            <span style={{ fontSize: 11, color: theme.colors.textDim }}>Total:</span>
            <span style={{
              fontSize: 12, fontWeight: 700, fontFamily: theme.fonts.mono,
              color: Math.abs(Object.values(weights).reduce((s, v) => s + v, 0) - 1) < 0.02
                ? theme.colors.success : theme.colors.error,
            }}>
              {Math.round(Object.values(weights).reduce((s, v) => s + v, 0) * 100)}%
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setWeights({ cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25 });
              }}
              style={resetBtnStyle}
              onMouseEnter={e => { e.currentTarget.style.borderColor = theme.colors.accentBlue; e.currentTarget.style.color = theme.colors.accentBlue; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = theme.colors.border; e.currentTarget.style.color = theme.colors.textMuted; }}
            >
              Reset to Defaults
            </button>
            <button
              onClick={savePreferences}
              style={{
                flex: 1, padding: '8px 16px', borderRadius: 6,
                border: 'none', background: theme.colors.accentBlue,
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Save Weights
            </button>
          </div>
        </div>

        {/* Risk tolerance slider */}
        <div style={{
          background: theme.colors.surface, borderRadius: theme.radii.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Investment Style
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, color: theme.colors.text, fontWeight: 600 }}>
              {nearestRiskLabel(risk)}
            </span>
            <span style={{
              fontSize: 24, fontWeight: 700, color: theme.colors.accentBlue,
              fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums',
            }}>
              {risk.toFixed(1)}
            </span>
          </div>

          <input
            type="range"
            min={1} max={7} step={0.1}
            value={risk}
            onChange={(e) => handleRiskChange(Math.round(Number(e.target.value) * 10) / 10)}
            style={{
              width: '100%', height: 4,
              appearance: 'none', WebkitAppearance: 'none',
              background: `linear-gradient(to right, ${theme.colors.accentBlue} 0%, ${theme.colors.accentBlue} ${((risk - 1) / 6) * 100}%, ${theme.colors.border} ${((risk - 1) / 6) * 100}%, ${theme.colors.border} 100%)`,
              borderRadius: 2, outline: 'none', cursor: 'pointer',
            }}
          />

          {/* Anchor labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.colors.textDim }}>
            <span>Very Conservative</span>
            <span>Very Aggressive</span>
          </div>

          <div style={{
            marginTop: 4, padding: 14, borderRadius: 8,
            background: 'rgba(59,130,246,0.06)', fontSize: 12, lineHeight: 1.6,
            color: theme.colors.textMuted,
          }}>
            <strong style={{ color: theme.colors.text }}>How this works:</strong> Risk tolerance
            controls how aggressively allocation tilts toward top-scoring funds. Affects
            allocation sizing only — scores do not change.
          </div>
        </div>
      </div>

      {/* Fund detail now renders inline in the table above */}
    </div>
  );
}

// ─── Weight Slider Sub-Component ────────────────────────────────────────────

function WeightSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (val: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text }}>{label}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: theme.colors.accentBlue,
          fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums',
        }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={5} max={60} step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: '100%', accentColor: theme.colors.accentBlue }}
      />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const tdFactorStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'center',
  fontFamily: theme.fonts.mono, fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
};

const resetBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6,
  border: `1px solid ${theme.colors.border}`, background: 'transparent',
  color: theme.colors.textMuted, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', transition: 'all 0.15s',
};
