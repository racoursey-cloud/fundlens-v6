/**
 * FundLens v6 — Research Page
 *
 * Deep-dive analysis tab. Layout (top to bottom):
 *   1. Dual donuts row: Fund Allocation (click fund → see its sectors)
 *      + Sector Exposure (click sector → see contributing funds)
 *   2. Market Environment — macro stance, narrative (industry-standard framing:
 *      Macro Environment → Thematic Drivers → Asset Class Outlook → Positioning)
 *   3. Sector Outlook — SectorScorecard grid (1–10 per GICS sector)
 *   4. Fund Analysis — full fund scores table with expandable FundDetail
 *
 * Session 19 redesign — dual donuts restored, W-structure removed from narrative,
 * industry-standard framing adopted (BlackRock/PIMCO/T. Rowe Price model).
 * References: Spec §2.6, §6.1–§6.7
 */

import React, { useEffect, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  fetchThesis,
  fetchScores,
  fetchProfile,
  type ThesisData,
  type FundScore,
  type PipelineRun,
} from '../api';
import { theme } from '../theme';

/** Render inline markdown bold/italic within narrative text */
function inlineMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${theme.colors.text};font-weight:600">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em>$1</em>`);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em'],
    ALLOWED_ATTR: ['style'],
  });
}
import { SectorScorecard, type SectorScore } from '../components/SectorScorecard';
import { DonutChart, BarBreakdown, type DonutSlice, type DonutDrillItem } from '../components/DonutChart';
import { FundDetail } from '../components/FundDetail';
import { computeClientAllocations, type ClientAllocationInput } from '../engine/allocation';

// ─── Shared Utilities ─────────────────────────────────────────────────────

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const absZ = Math.abs(z);
  const x = absZ / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);
  const result = 0.5 * (1.0 + erf);
  return z >= 0 ? result : 1.0 - result;
}

const MAD_CONSISTENCY = 0.6745;
const MM_TICKERS = new Set(['FDRXX', 'ADAXX']);

const TIER_BADGES = [
  { tier: 'Top Pick', zMin: 2.0, color: '#F59E0B' },
  { tier: 'Strong',    zMin: 1.2, color: '#10B981' },
  { tier: 'Solid',     zMin: 0.3, color: '#3B82F6' },
  { tier: 'Neutral',   zMin: -0.5, color: '#6B7280' },
  { tier: 'Weak',      zMin: -Infinity, color: '#EF4444' },
] as const;

function clientMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function computeClientTier(
  ticker: string, composite: number,
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

// ─── Stance Configuration ──────────────────────────────────────────────────

const STANCE_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string;
}> = {
  'risk-on':      { label: 'Bullish',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)'  },
  bullish:        { label: 'Bullish',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)'  },
  'risk-off':     { label: 'Bearish',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
  bearish:        { label: 'Bearish',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
  mixed:          { label: 'Neutral',       color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)'  },
  neutral:        { label: 'Neutral',       color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)'  },
  transitional:   { label: 'Transitional',  color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)' },
};

function getStance(macroStance: string) {
  return STANCE_CONFIG[macroStance?.toLowerCase()] ?? STANCE_CONFIG['neutral']!;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Main Component ────────────────────────────────────────────────────────

export function Research() {
  // Thesis state
  const [thesis, setThesis] = useState<ThesisData | null>(null);
  const [loadingThesis, setLoadingThesis] = useState(true);

  // Scores + profile state
  const [scores, setScores] = useState<FundScore[]>([]);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [loadingScores, setLoadingScores] = useState(true);
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  // Weights + risk for client-side rescore
  const [weights, setWeights] = useState({ cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25 });
  const [risk, setRisk] = useState<number>(4.0);

  // ── Data fetching ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchThesis().then(res => {
      if (res.data?.thesis) setThesis(res.data.thesis);
      setLoadingThesis(false);
    });
  }, []);

  useEffect(() => {
    Promise.all([fetchScores(), fetchProfile()]).then(([scoresRes, profileRes]) => {
      if (scoresRes.data?.scores) setScores(scoresRes.data.scores);
      if (scoresRes.data?.pipelineRun) setPipelineRun(scoresRes.data.pipelineRun as unknown as PipelineRun);
      if (profileRes.data?.profile) {
        const p = profileRes.data.profile;
        setWeights({
          cost: p.weight_cost, quality: p.weight_quality,
          positioning: p.weight_positioning, momentum: p.weight_momentum,
        });
        setRisk(p.risk_tolerance);
      }
      setLoadingScores(false);
    });
  }, []);

  // ── Client-side rescore ───────────────────────────────────────────────

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
      ticker: s.funds?.ticker || s.fund_id, composite: s.userComposite,
    }));
    return withComposites
      .map(s => {
        const ticker = s.funds?.ticker || s.fund_id;
        const tierInfo = computeClientTier(ticker, s.userComposite, allComposites);
        return { ...s, userTier: tierInfo.tier, userTierColor: tierInfo.tierColor };
      })
      .sort((a, b) => {
        const aIsMM = MM_TICKERS.has(a.funds?.ticker || a.fund_id);
        const bIsMM = MM_TICKERS.has(b.funds?.ticker || b.fund_id);
        if (aIsMM && !bIsMM) return 1;
        if (!aIsMM && bIsMM) return -1;
        return b.userComposite - a.userComposite;
      });
  }, [scores, weights]);

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

  // ── Sector Exposure donut — click sector → see contributing funds ────

  const { sectorSlices, sectorDrillData } = useMemo(() => {
    const sectorAgg = new Map<string, number>();
    const sectorFunds = new Map<string, DonutDrillItem[]>();

    for (const s of scores) {
      const ticker = s.funds?.ticker || s.fund_id;
      const fundAlloc = allocMap.get(ticker) ?? 0;
      const details = s.factor_details as Record<string, unknown> | undefined;
      const sectors = (details?.sectorExposure || details?.sectors) as Record<string, number> | undefined;

      if (sectors) {
        for (const [sector, weight] of Object.entries(sectors)) {
          sectorAgg.set(sector, (sectorAgg.get(sector) || 0) + weight);

          // Drill: sector → funds contributing to this sector
          if (fundAlloc > 0) {
            const existing = sectorFunds.get(sector) || [];
            const contribution = Math.round(weight * fundAlloc * 10) / 10;
            if (contribution > 0) {
              existing.push({
                name: s.funds?.name || ticker,
                ticker,
                weight: contribution,
              });
              sectorFunds.set(sector, existing);
            }
          }
        }
      }
    }

    for (const [sector, items] of sectorFunds.entries()) {
      sectorFunds.set(sector, items.sort((a, b) => b.weight - a.weight).slice(0, 20));
    }

    const total = [...sectorAgg.values()].reduce((s, v) => s + v, 0);
    const slices: DonutSlice[] = [...sectorAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => total > 0 && (v / total) * 100 > 0.1)
      .map(([label, value]) => ({
        id: label, label, pct: total > 0 ? (value / total) * 100 : 0,
        color: SECTOR_COLORS[label] ?? '#71717a',
      }));

    return { sectorSlices: slices, sectorDrillData: sectorFunds };
  }, [scores, allocMap]);

  // ── Fund Allocation donut — click fund → see its sector breakdown ────

  const { fundSlices, fundDrillData } = useMemo(() => {
    const slices: DonutSlice[] = allocations
      .filter(a => a.allocationPct > 0)
      .map((a, i) => ({
        id: a.ticker, label: a.ticker, pct: a.allocationPct,
        color: FUND_PALETTE[i % FUND_PALETTE.length]!,
      }));

    const fundSectors = new Map<string, DonutDrillItem[]>();
    for (const s of scores) {
      const ticker = s.funds?.ticker || s.fund_id;
      if (!allocMap.has(ticker)) continue;
      const details = s.factor_details as Record<string, unknown> | undefined;
      const sectors = (details?.sectorExposure || details?.sectors) as Record<string, number> | undefined;
      if (sectors) {
        const items: DonutDrillItem[] = Object.entries(sectors)
          .filter(([, w]) => w > 0.001)
          .sort((a, b) => b[1] - a[1])
          .map(([sector, w]) => ({
            name: sector,
            weight: Math.round(w * 1000) / 10,
          }));
        fundSectors.set(ticker, items);
      }
    }

    return { fundSlices: slices, fundDrillData: fundSectors };
  }, [allocations, scores, allocMap]);

  // ── Loading state ─────────────────────────────────────────────────────

  if (loadingThesis || loadingScores) {
    return <div style={{ color: theme.colors.textMuted, padding: '32px' }}>Loading research...</div>;
  }

  // ── Thesis section ────────────────────────────────────────────────────

  const sectorScores: Record<string, SectorScore> = {};
  if (thesis?.sector_preferences) {
    for (const sp of thesis.sector_preferences) {
      sectorScores[sp.sector] = {
        score: sp.score,
        reasoning: sp.reasoning || sp.preference,
      };
    }
  }

  const stance = thesis ? getStance(thesis.macro_stance) : null;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>

      {/* ═══ SECTION 1: Dual Donuts ═════════════════════════════════════════ */}
      {!loadingScores && scores.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
        }}>
          {/* Fund Allocation donut — click fund → see its sector breakdown */}
          <div style={{
            background: theme.colors.surface, borderRadius: theme.radii.lg,
            border: `1px solid ${theme.colors.border}`,
            padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            {fundSlices.length > 0 ? (
              <>
                <DonutChart
                  slices={fundSlices}
                  size={220}
                  title="Recommended Allocation"
                  drillData={fundDrillData}
                />
                <BarBreakdown items={fundSlices} />
              </>
            ) : (
              <div style={{ color: theme.colors.textDim, fontSize: 13, padding: 40, textAlign: 'center' }}>
                No allocation data available.
              </div>
            )}
          </div>

          {/* Sector Exposure donut — click sector → see contributing funds */}
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
                <BarBreakdown items={sectorSlices} />
              </>
            ) : (
              <div style={{ color: theme.colors.textDim, fontSize: 13, padding: 40, textAlign: 'center' }}>
                No holdings data available for sector breakdown.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION 2: Market Environment ═══════════════════════════════ */}
      {thesis && stance && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: theme.radii.lg, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 24px', borderBottom: `1px solid ${theme.colors.border}`,
          }}>
            <span style={{
              fontFamily: theme.fonts.serif, fontWeight: 700, fontSize: 15,
              color: theme.colors.text,
            }}>Market Environment</span>
            {thesis.generated_at && (
              <span style={{ fontSize: 11, color: theme.colors.textDim }}>
                {fmtDate(thesis.generated_at)}
              </span>
            )}
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Badges row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, letterSpacing: '0.03em',
                textTransform: 'uppercase',
                color: stance.color, background: stance.bg,
                border: `1px solid ${stance.border}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stance.color }} />
                {stance.label}
              </span>
              {thesis.dominant_theme && thesis.dominant_theme !== 'Unavailable' && (
                <span style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  color: '#93c5fd', background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}>{thesis.dominant_theme}</span>
              )}
            </div>

            {/* Narrative — continuous prose with topic-based subheadings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {thesis.narrative.split(/\n\s*\n/).map((para, i) => {
                const trimmed = para.trim();
                if (!trimmed) return null;
                const headerMatch = trimmed.match(/^\*\*(.+?)\*\*\s*(.*)/s);
                if (headerMatch) {
                  return (
                    <div key={i}>
                      <h3 style={{
                        fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: theme.colors.textMuted,
                        margin: i > 0 ? '8px 0 6px' : '0 0 6px',
                        fontFamily: theme.fonts.body,
                      }}>{headerMatch[1]}</h3>
                      {headerMatch[2] && (
                        <p
                          style={{ fontSize: 14, lineHeight: 1.75, color: '#d1d5db', margin: 0 }}
                          dangerouslySetInnerHTML={{ __html: inlineMarkdown(headerMatch[2].trim()) }}
                        />
                      )}
                    </div>
                  );
                }
                return (
                  <p
                    key={i}
                    style={{ fontSize: 14, lineHeight: 1.75, color: '#d1d5db', margin: 0 }}
                    dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed) }}
                  />
                );
              })}
            </div>

            {/* Key themes */}
            {thesis.key_themes && thesis.key_themes.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {thesis.key_themes.map((t, i) => (
                  <span key={i} style={{
                    padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                    color: theme.colors.textMuted, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION 3: Sector Outlook ═══════════════════════════════════ */}
      {thesis && Object.keys(sectorScores).length > 0 && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: theme.radii.lg, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 24px', borderBottom: `1px solid ${theme.colors.border}`,
          }}>
            <span style={{
              fontFamily: theme.fonts.serif, fontWeight: 700, fontSize: 15,
              color: theme.colors.text,
            }}>Sector Outlook</span>
            <span style={{ fontSize: 11, color: theme.colors.textDim }}>
              {Object.keys(sectorScores).length} sectors scored 1{'\u2013'}10
            </span>
          </div>
          <div style={{ padding: '16px 24px' }}>
            <SectorScorecard sectorScores={sectorScores} />
          </div>
        </div>
      )}

      {/* ═══ SECTION 4: Fund Analysis ════════════════════════════════════ */}
      {!loadingScores && scores.length > 0 && (
        <>
          <div style={{
            background: theme.colors.surface, borderRadius: theme.radii.lg,
            border: `1px solid ${theme.colors.border}`, overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <span style={{
                fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>Fund Scores</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                    {['Fund', 'Alloc', 'Score', 'Tier', 'Cost', 'Quality', 'Momentum', 'Position'].map((h, idx) => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: idx === 0 ? 'left' : 'center',
                        fontWeight: 600, color: theme.colors.textDim, fontSize: 11,
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>{h}</th>
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
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = theme.colors.surfaceHover; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '8px 10px', textAlign: 'left' }}>
                            <span style={{
                              fontWeight: 700, color: theme.colors.accentBlue,
                              fontFamily: theme.fonts.mono, letterSpacing: '0.02em',
                            }}>{ticker}</span>
                            {name && (
                              <span style={{
                                marginLeft: 8, fontSize: 12, color: theme.colors.textDim,
                                maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{name}</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {(() => {
                              const alloc = allocMap.get(ticker);
                              if (!alloc) return <span style={{ color: theme.colors.textDim }}>—</span>;
                              return <span style={{ fontWeight: 700, fontFamily: theme.fonts.mono, color: theme.colors.text, fontSize: 14 }}>{alloc}%</span>;
                            })()}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: 6,
                              background: scoreBg(s.userComposite), color: scoreColor(s.userComposite),
                              fontWeight: 700, fontFamily: theme.fonts.mono, fontSize: 14,
                            }}>{s.userComposite}</span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              padding: '3px 8px', borderRadius: 4, fontSize: 11,
                              fontWeight: 600, letterSpacing: '0.03em',
                              color: s.userTierColor,
                              background: `${s.userTierColor}18`,
                              border: `1px solid ${s.userTierColor}40`,
                            }}>{s.userTier}</span>
                          </td>
                          <td style={tdFactorStyle}>
                            {(() => { const v = Math.round(100 * normalCDF(s.z_cost_efficiency ?? 0)); return <span style={{ color: scoreColor(v) }}>{v}</span>; })()}
                          </td>
                          <td style={tdFactorStyle}>
                            {(() => { const v = Math.round(100 * normalCDF(s.z_holdings_quality ?? 0)); return <span style={{ color: scoreColor(v) }}>{v}</span>; })()}
                          </td>
                          <td style={tdFactorStyle}>
                            {(() => { const v = Math.round(100 * normalCDF(s.z_momentum ?? 0)); return <span style={{ color: scoreColor(v) }}>{v}</span>; })()}
                          </td>
                          <td style={tdFactorStyle}>
                            {(() => { const v = Math.round(100 * normalCDF(s.z_positioning ?? 0)); return <span style={{ color: scoreColor(v) }}>{v}</span>; })()}
                          </td>
                        </tr>
                        {isSelected && (
                          <FundDetail ticker={ticker} onClose={() => setSelectedFund(null)} />
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
        </>
      )}

      {/* Empty state */}
      {!loadingScores && scores.length === 0 && !thesis && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 400, gap: 16, color: theme.colors.textMuted, textAlign: 'center', padding: 40,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textDim} strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text }}>No research data yet</div>
          <div style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
            Run the scoring pipeline to generate fund scores, sector outlook, and market analysis.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const tdFactorStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'center',
  fontFamily: theme.fonts.mono, fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
};
