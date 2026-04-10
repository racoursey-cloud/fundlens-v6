/**
 * FundLens v6 — FundLens Page
 *
 * The microscope view — pick any fund in the 401(k) plan and look inside it.
 * Scrollable list of all funds; click a row to expand the three-panel block:
 *   Left: Sector Exposure bars
 *   Center: Sector donut for that fund
 *   Right: Top Holdings list
 *
 * Same visual DNA as the recommendation block on Your Brief, but for every
 * fund in the plan — not just the ones in your allocation.
 *
 * Data source: /api/scores (all fund scores + factor_details with sector
 * exposure and top holdings baked in by the pipeline).
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  fetchScores,
  fetchProfile,
  type FundScore,
  type PipelineRun,
} from '../api';
import { theme } from '../theme';
import { DonutChart, type DonutSlice } from '../components/DonutChart';

// ─── Constants ───────────────────────────────────────────────────────────────

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

const MM_TICKERS = new Set(['FDRXX', 'ADAXX']);

// ─── Utilities ───────────────────────────────────────────────────────────────

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

// ─── Data Extraction ─────────────────────────────────────────────────────────

interface SectorData {
  sector: string;
  weight: number;
  color: string;
}

interface HoldingData {
  name: string;
  ticker: string | null;
  weight: number;
  sector: string | null;
}

interface FundExplorerData {
  sectors: SectorData[];
  holdings: HoldingData[];
}

function extractExplorerData(score: FundScore): FundExplorerData {
  const details = score.factor_details as Record<string, unknown> | undefined;

  // Sector exposure
  const rawSectors = (details?.sectorExposure || details?.sectors) as Record<string, number> | undefined;
  const sectors: SectorData[] = [];
  if (rawSectors) {
    const maxVal = Math.max(...Object.values(rawSectors));
    const isDecimal = maxVal <= 1.0;
    for (const [sector, weight] of Object.entries(rawSectors)) {
      if (weight > 0) {
        const pct = isDecimal ? Math.round(weight * 1000) / 10 : Math.round(weight * 10) / 10;
        sectors.push({ sector, weight: pct, color: SECTOR_COLORS[sector] ?? '#71717a' });
      }
    }
    sectors.sort((a, b) => b.weight - a.weight);
  }

  // Top holdings
  const topHoldingsData = details?.topHoldings as
    Array<{ name?: string; ticker?: string; sector?: string | null; weight?: number }> | undefined;
  const holdings: HoldingData[] = [];
  if (topHoldingsData && topHoldingsData.length > 0) {
    for (const h of topHoldingsData) {
      const w = h.weight ?? 0;
      if (w > 0) {
        holdings.push({ name: h.name || 'Unknown', ticker: h.ticker || null, weight: Math.round(w * 10) / 10, sector: h.sector || null });
      }
    }
  } else {
    // Fallback: legacy holdingsQuality.holdingScores
    const qualityData = details?.holdingsQuality as {
      holdingScores?: Array<{ name?: string; ticker?: string; weight?: number }>;
    } | undefined;
    const rawHoldings = qualityData?.holdingScores;
    if (rawHoldings && rawHoldings.length > 0) {
      for (const h of rawHoldings) {
        const w = h.weight ?? 0;
        if (w > 0) {
          holdings.push({ name: h.name || 'Unknown', ticker: h.ticker || null, weight: Math.round(w * 10) / 10, sector: null });
        }
      }
      holdings.sort((a, b) => b.weight - a.weight);
    }
  }

  return { sectors, holdings };
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

const spinnerStyle: React.CSSProperties = {
  width: 28, height: 28, margin: '0 auto',
  border: `3px solid ${theme.colors.border}`,
  borderTopColor: theme.colors.accentBlue,
  borderRadius: '50%',
  animation: 'fl-spin 0.75s linear infinite',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function FundLens() {
  const [scores, setScores] = useState<FundScore[]>([]);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Weights + risk for client-side rescore
  const [weights, setWeights] = useState({ cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25 });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      }
      setLoading(false);
    });
  }, []);

  // Client-side rescore (same logic as Research/YourBrief)
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

  // Explorer data map
  const explorerMap = useMemo(() => {
    const map = new Map<string, FundExplorerData>();
    for (const s of scores) {
      const ticker = s.funds?.ticker || s.fund_id;
      map.set(ticker, extractExplorerData(s));
    }
    return map;
  }, [scores]);

  const handleRowClick = useCallback((ticker: string) => {
    setExpandedFund(prev => {
      if (prev === ticker) return null;
      setSelectedSector(null);  // reset sector filter when switching funds
      return ticker;
    });
  }, []);

  // ── Loading ──

  if (loading) {
    return (
      <div style={{ color: theme.colors.textMuted, padding: '32px' }}>
        <div style={spinnerStyle} />
        <p style={{ textAlign: 'center', marginTop: 16 }}>Loading fund data...</p>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div style={{ color: theme.colors.textMuted, padding: '32px', textAlign: 'center' }}>
        <p>No fund data available yet. Run an analysis to populate scores.</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{
          fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: 0,
          letterSpacing: '-0.01em',
        }}>
          <span style={{ color: theme.colors.text }}>Fund</span>
          <span style={{ color: theme.colors.accentBlue }}>Lens</span>
        </h2>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: '4px 0 0' }}>
          {rankedScores.length} funds in your 401(k) plan — click any fund to look inside
        </p>
      </div>

      {/* Fund list */}
      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
      }}>
        {rankedScores.map((s) => {
          const ticker = s.funds?.ticker || s.fund_id.slice(0, 8);
          const name = s.funds?.name || '';
          const isExpanded = expandedFund === ticker;
          const explorerData = explorerMap.get(ticker);

          // Sector donut slices for this fund — add Unclassified remainder so donut fills to 100%
          const sectorSlices: DonutSlice[] = [];
          if (explorerData) {
            for (const sec of explorerData.sectors) {
              sectorSlices.push({ id: sec.sector, label: sec.sector, pct: sec.weight, color: sec.color });
            }
            const classifiedTotal = explorerData.sectors.reduce((sum, s) => sum + s.weight, 0);
            const remainder = Math.round((100 - classifiedTotal) * 10) / 10;
            if (remainder > 0.5) {
              sectorSlices.push({ id: '__unclassified', label: 'Not Classified', pct: remainder, color: '#2a2d33' });
            }
          }

          return (
            <div key={s.id}>
              {/* ── Fund row ── */}
              <div
                onClick={() => handleRowClick(ticker)}
                onMouseEnter={(e) => {
                  if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = theme.colors.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '16px 60px 1fr 52px 64px',
                  alignItems: 'center', gap: 10,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: isExpanded ? theme.colors.surfaceHover : 'transparent',
                  borderBottom: `1px solid ${theme.colors.border}`,
                  transition: 'background 0.15s',
                }}
              >
                {/* Expand chevron */}
                <span style={{
                  fontSize: 10, color: theme.colors.textDim,
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  textAlign: 'center',
                }}>▶</span>

                {/* Ticker */}
                <span style={{
                  fontWeight: 700, color: theme.colors.accentBlue,
                  fontFamily: theme.fonts.mono, letterSpacing: '0.02em',
                  fontSize: 14,
                }}>{ticker}</span>

                {/* Fund name */}
                <span style={{
                  fontSize: 13, color: theme.colors.textMuted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{name}</span>

                {/* Score badge */}
                <span style={{
                  padding: '4px 0', borderRadius: 6,
                  background: scoreBg(s.userComposite), color: scoreColor(s.userComposite),
                  fontWeight: 700, fontFamily: theme.fonts.mono, fontSize: 13,
                  textAlign: 'center',
                }}>{s.userComposite}</span>

                {/* Tier badge */}
                <span style={{
                  padding: '3px 0', borderRadius: 4, fontSize: 10,
                  fontWeight: 600, letterSpacing: '0.03em',
                  color: s.userTierColor,
                  background: `${s.userTierColor}18`,
                  border: `1px solid ${s.userTierColor}40`,
                  textAlign: 'center',
                }}>{s.userTier}</span>
              </div>

              {/* ── Expanded three-panel block ── */}
              {isExpanded && explorerData && (
                <div style={{
                  background: theme.colors.bg,
                  borderBottom: `1px solid ${theme.colors.border}`,
                  padding: isMobile ? '16px' : '24px 32px',
                }}>
                  {/* Fund name header inside expansion */}
                  <div style={{
                    textAlign: 'center', marginBottom: 16,
                  }}>
                    <span style={{
                      fontSize: 15, fontWeight: 700, color: theme.colors.text,
                      fontFamily: theme.fonts.mono,
                    }}>{ticker}</span>
                    <span style={{
                      marginLeft: 10, fontSize: 13, color: theme.colors.textMuted,
                    }}>{name}</span>
                  </div>

                  {isMobile ? (
                    /* ── Mobile: stacked layout ── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                      {/* Donut */}
                      {sectorSlices.length > 0 && (
                        <DonutChart
                          slices={sectorSlices}
                          size={180}
                          title="Sector Breakdown"
                          onSliceClick={(slice) => {
                            if (slice.id === '__unclassified') return;
                            setSelectedSector(prev => prev === slice.id ? null : slice.id);
                          }}
                        />
                      )}

                      {/* Sectors */}
                      {explorerData.sectors.length > 0 && (
                        <div style={{ width: '100%' }}>
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                          }}>Sector Exposure</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {explorerData.sectors.map(sec => {
                              const isActive = selectedSector === sec.sector;
                              const isDimmed = selectedSector && !isActive;
                              return (
                                <div key={sec.sector}
                                  onClick={() => setSelectedSector(prev => prev === sec.sector ? null : sec.sector)}
                                  style={{
                                    display: 'grid', gridTemplateColumns: '90px 1fr 40px',
                                    alignItems: 'center', gap: 6, cursor: 'pointer',
                                    opacity: isDimmed ? 0.35 : 1, transition: 'opacity 0.15s',
                                  }}>
                                  <span style={{ fontSize: 11, color: isActive ? theme.colors.text : theme.colors.textMuted, fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.sector}</span>
                                  <div style={{ height: 6, borderRadius: 3, background: theme.colors.surfaceAlt, overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%', borderRadius: 3, background: sec.color,
                                      width: `${Math.min(100, (sec.weight / Math.max(...explorerData.sectors.map(x => x.weight))) * 100)}%`,
                                    }} />
                                  </div>
                                  <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600, color: theme.colors.text, textAlign: 'right' }}>{sec.weight.toFixed(1)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Holdings (filtered by selected sector) */}
                      {(() => {
                        const filtered = selectedSector
                          ? explorerData.holdings.filter(h => h.sector === selectedSector)
                          : explorerData.holdings;
                        return filtered.length > 0 ? (
                          <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                              <div style={{
                                fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>{selectedSector ? `${selectedSector} Holdings` : 'Top Holdings'}</div>
                              {selectedSector && (
                                <button onClick={() => setSelectedSector(null)} style={{
                                  background: 'none', border: 'none', color: theme.colors.textDim,
                                  cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1,
                                }}>&times;</button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
                              {filtered.map((h, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 8 }}>
                                  <span style={{ fontSize: 11, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.name}</span>
                                  {h.ticker && <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim, flexShrink: 0 }}>{h.ticker}</span>}
                                  <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600, color: theme.colors.accentBlue, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{h.weight.toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : explorerData.holdings.length > 0 ? (
                          <div style={{ width: '100%' }}>
                            <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                              No {selectedSector} holdings
                            </span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    /* ── Desktop: three-panel grid ── */
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      gap: 24,
                      alignItems: 'start',
                      minHeight: 240,
                    }}>
                      {/* LEFT — Sector Exposure */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
                        }}>Sector Exposure</div>
                        {explorerData.sectors.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {explorerData.sectors.map(sec => {
                              const isActive = selectedSector === sec.sector;
                              const isDimmed = selectedSector && !isActive;
                              return (
                                <div key={sec.sector}
                                  onClick={() => setSelectedSector(prev => prev === sec.sector ? null : sec.sector)}
                                  style={{
                                    display: 'grid', gridTemplateColumns: '90px 1fr 40px',
                                    alignItems: 'center', gap: 6,
                                    cursor: 'pointer',
                                    opacity: isDimmed ? 0.35 : 1,
                                    transition: 'opacity 0.15s',
                                    borderRadius: 3,
                                    background: isActive ? `${sec.color}15` : 'transparent',
                                    padding: '1px 4px',
                                    margin: '0 -4px',
                                  }}>
                                  <span style={{
                                    fontSize: 11, color: isActive ? theme.colors.text : theme.colors.textMuted,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    fontWeight: isActive ? 600 : 400,
                                  }}>{sec.sector}</span>
                                  <div style={{ height: 6, borderRadius: 3, background: theme.colors.surfaceAlt, overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%', borderRadius: 3, background: sec.color,
                                      width: `${Math.min(100, (sec.weight / Math.max(...explorerData.sectors.map(x => x.weight))) * 100)}%`,
                                    }} />
                                  </div>
                                  <span style={{
                                    fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
                                    color: theme.colors.text, textAlign: 'right',
                                  }}>{sec.weight.toFixed(1)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                            No sector data
                          </span>
                        )}
                      </div>

                      {/* CENTER — Donut */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        flexShrink: 0,
                      }}>
                        {sectorSlices.length > 0 ? (
                          <DonutChart
                            slices={sectorSlices}
                            size={200}
                            title="Sector Breakdown"
                            onSliceClick={(slice) => {
                              if (slice.id === '__unclassified') return;
                              setSelectedSector(prev => prev === slice.id ? null : slice.id);
                            }}
                          />
                        ) : (
                          <div style={{
                            width: 200, height: 200, borderRadius: '50%',
                            background: theme.colors.surfaceAlt,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 12, color: theme.colors.textDim }}>No data</span>
                          </div>
                        )}
                      </div>

                      {/* RIGHT — Top Holdings (filtered by selected sector) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}>{selectedSector ? `${selectedSector} Holdings` : 'Top Holdings'}</div>
                          {selectedSector && (
                            <button
                              onClick={() => setSelectedSector(null)}
                              style={{
                                background: 'none', border: 'none', color: theme.colors.textDim,
                                cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1,
                                fontFamily: theme.fonts.body,
                              }}
                            >&times;</button>
                          )}
                        </div>
                        {(() => {
                          const filtered = selectedSector
                            ? explorerData.holdings.filter(h => h.sector === selectedSector)
                            : explorerData.holdings;
                          return filtered.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
                              {filtered.map((h, idx) => (
                                <div key={idx} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '2px 0', gap: 8,
                                }}>
                                  <span style={{
                                    fontSize: 11, color: theme.colors.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    flex: 1,
                                  }}>{h.name}</span>
                                  {h.ticker && (
                                    <span style={{
                                      fontSize: 10, fontFamily: theme.fonts.mono,
                                      color: theme.colors.textDim, flexShrink: 0,
                                    }}>{h.ticker}</span>
                                  )}
                                  <span style={{
                                    fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
                                    color: theme.colors.accentBlue, flexShrink: 0, minWidth: 36,
                                    textAlign: 'right',
                                  }}>{h.weight.toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                              {selectedSector ? `No ${selectedSector} holdings` : 'No holdings data'}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pipeline timestamp */}
      {pipelineRun && (
        <div style={{ fontSize: 12, color: theme.colors.textDim }}>
          Scores from {(() => {
            const ts = (pipelineRun as unknown as Record<string, unknown>).completedAt as string ||
                       (pipelineRun as unknown as Record<string, unknown>).started_at as string;
            if (!ts) return 'pending pipeline run';
            const d = new Date(ts);
            return isNaN(d.getTime()) ? 'unknown date' : d.toLocaleString();
          })()}
        </div>
      )}
    </div>
  );
}
