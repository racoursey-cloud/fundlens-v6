/**
 * FundLens v6 — Fund Detail Inline Expansion (Tabbed)
 *
 * Inline row expansion in the Portfolio fund table. Click a fund row →
 * expands below with three tabs:
 *
 *   OVERVIEW  — AI summary + 4 factor score bars + tier badge
 *   HOLDINGS  — Top 50 company positions by weight
 *   SECTORS   — Holdings grouped by sector (expandable)
 *
 * Combines v5.1's factor display with v6's holdings drill-in.
 *
 * Session 12 rewrite. Destination: client/src/components/FundDetail.tsx
 */

import { useEffect, useState, useMemo } from 'react';
import { fetchFundScore, type FundScore, type Fund } from '../api';
import { theme } from '../theme';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Holding {
  name: string;
  ticker: string | null;
  pct_of_nav: number;
  sector: string | null;
}

interface Props {
  ticker: string;
  onClose: () => void;
}

type Tab = 'overview' | 'holdings' | 'sectors';

// ─── Sector Colors ──────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#3b82f6', Healthcare: '#06b6d4', Financials: '#8b5cf6',
  'Consumer Discretionary': '#f59e0b', 'Consumer Staples': '#22c55e',
  Energy: '#ef4444', Industrials: '#f97316', Materials: '#14b8a6',
  'Real Estate': '#ec4899', Utilities: '#6366f1',
  'Communication Services': '#a855f7', 'Precious Metals': '#eab308',
  'Fixed Income': '#64748b', 'Cash & Equivalents': '#94a3b8',
  Other: '#71717a',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#71717a';
}

// ─── Factor display config ──────────────────────────────────────────────────

const FACTORS = [
  { key: 'cost_efficiency',   label: 'Cost Efficiency' },
  { key: 'holdings_quality',  label: 'Holdings Quality' },
  { key: 'positioning',       label: 'Positioning' },
  { key: 'momentum',          label: 'Momentum' },
] as const;

// ─── Main Component ─────────────────────────────────────────────────────────

export function FundDetail({ ticker, onClose }: Props) {
  const [_fund, setFund] = useState<Fund | null>(null);
  const [score, setScore] = useState<FundScore | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActiveTab('overview');
    setExpandedSector(null);

    fetchFundScore(ticker).then((res) => {
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setFund(res.data.fund);
        setScore(res.data.score);
        setHoldings((res.data.holdings || []) as Holding[]);
      }
      setLoading(false);
    });
  }, [ticker]);

  // Group holdings by sector (for Sectors tab)
  const sectorGroups = useMemo(() => {
    const map = new Map<string, { weight: number; items: Holding[] }>();
    for (const h of holdings) {
      const sector = h.sector || 'Other';
      const existing = map.get(sector) || { weight: 0, items: [] };
      existing.weight += h.pct_of_nav || 0;
      existing.items.push(h);
      map.set(sector, existing);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].weight - a[1].weight)
      .map(([sector, data]) => ({
        sector,
        weight: data.weight,
        items: data.items.sort((a, b) => (b.pct_of_nav || 0) - (a.pct_of_nav || 0)),
        color: getSectorColor(sector),
      }));
  }, [holdings]);

  const totalWeight = sectorGroups.reduce((s, g) => s + g.weight, 0);

  // AI summary from factor_details
  const summary = useMemo(() => {
    if (!score?.factor_details) return null;
    const d = score.factor_details as Record<string, unknown>;
    return typeof d.summary === 'string' ? d.summary : null;
  }, [score]);

  // ─── Loading / Error / Empty ─────────────────────────────────────────────

  if (loading) {
    return (
      <tr>
        <td colSpan={7} style={{ padding: '16px 20px', color: theme.colors.textDim, fontSize: 12 }}>
          Loading details for {ticker}…
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={7} style={{ padding: '16px 20px', color: theme.colors.error, fontSize: 12 }}>
          {error}
        </td>
      </tr>
    );
  }

  // ─── Tab bar style ───────────────────────────────────────────────────────

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0 14px', height: 32,
    fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    fontFamily: theme.fonts.body,
    color: activeTab === tab ? theme.colors.text : theme.colors.textDim,
    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
    transition: 'color 0.15s',
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0 }}>
        <div style={{
          background: theme.colors.surfaceAlt || '#1c1e23',
          borderTop: `1px solid ${theme.colors.border}`,
          borderBottom: `1px solid ${theme.colors.border}`,
          padding: '0 20px 16px',
        }}>
          {/* Header: tabs + close */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${theme.colors.border}`,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', gap: 0 }}>
              <button onClick={(e) => { e.stopPropagation(); setActiveTab('overview'); }} style={tabStyle('overview')}>
                Overview
              </button>
              <button onClick={(e) => { e.stopPropagation(); setActiveTab('holdings'); }} style={tabStyle('holdings')}>
                Holdings
              </button>
              <button onClick={(e) => { e.stopPropagation(); setActiveTab('sectors'); }} style={tabStyle('sectors')}>
                Sectors
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{
                background: 'none', border: 'none', color: theme.colors.textDim,
                cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && (
            <div style={{ padding: '0 4px' }}>
              {/* AI Summary */}
              {summary && (
                <p style={{
                  fontSize: 13, lineHeight: 1.65, color: '#d1d5db',
                  margin: '0 0 16px', padding: 0,
                  fontFamily: theme.fonts.body,
                }}>
                  {summary}
                </p>
              )}

              {/* Factor Score Bars */}
              {score && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {FACTORS.map(({ key, label }) => {
                    const value = (score as unknown as Record<string, unknown>)[key];
                    const numValue = typeof value === 'number' ? value : 0;
                    const pct = Math.min(100, Math.max(0, numValue * 10));
                    return (
                      <div key={key}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 4,
                        }}>
                          <span style={{
                            fontSize: 12, color: theme.colors.textMuted,
                            fontFamily: theme.fonts.body,
                          }}>
                            {label}
                          </span>
                          <span style={{
                            fontFamily: theme.fonts.mono, fontSize: 12,
                            color: theme.colors.text, fontWeight: 600,
                          }}>
                            {numValue.toFixed(1)}
                          </span>
                        </div>
                        <div style={{
                          height: 6, borderRadius: 3,
                          background: theme.colors.border, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: '#3b82f6',
                            width: `${pct}%`,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Composite + Tier */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    marginTop: 6, paddingTop: 10,
                    borderTop: `1px solid ${theme.colors.border}`,
                  }}>
                    <span style={{
                      fontSize: 12, color: theme.colors.textMuted,
                      fontFamily: theme.fonts.body,
                    }}>
                      Composite
                    </span>
                    <span style={{
                      fontFamily: theme.fonts.mono, fontSize: 16,
                      color: theme.colors.text, fontWeight: 700,
                    }}>
                      {score.composite_default?.toFixed(1) ?? '—'}
                    </span>
                    {score.tier && (
                      <span style={{
                        padding: '2px 10px', borderRadius: 12,
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                        background: `${score.tier_color}22`,
                        color: score.tier_color || theme.colors.textMuted,
                        border: `1px solid ${score.tier_color}44`,
                      }}>
                        {score.tier}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ HOLDINGS TAB ═══ */}
          {activeTab === 'holdings' && (
            <div style={{ padding: '0 4px' }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: theme.colors.textDim,
                marginBottom: 8,
              }}>
                Top {holdings.length} Positions
              </div>

              {/* Column headers */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 0', marginBottom: 2,
                borderBottom: `1px solid ${theme.colors.border}`,
              }}>
                <span style={{
                  flex: 1, fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: theme.colors.textDim,
                }}>
                  Name
                </span>
                <span style={{
                  fontFamily: theme.fonts.mono, fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: theme.colors.textDim, width: 50, textAlign: 'center',
                }}>
                  Ticker
                </span>
                <span style={{
                  fontFamily: theme.fonts.mono, fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: theme.colors.textDim, width: 52, textAlign: 'right',
                }}>
                  Weight
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: theme.colors.textDim, width: 90, textAlign: 'right',
                }}>
                  Sector
                </span>
              </div>

              {/* Holdings list */}
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {holdings
                  .sort((a, b) => (b.pct_of_nav || 0) - (a.pct_of_nav || 0))
                  .map((h, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 0', fontSize: 12,
                      borderBottom: idx < holdings.length - 1
                        ? `1px solid ${theme.colors.border}33`
                        : 'none',
                    }}>
                      {/* Name */}
                      <span style={{
                        flex: 1, color: '#cbd5e1',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {h.name ?? '—'}
                      </span>
                      {/* Ticker */}
                      <span style={{
                        fontFamily: theme.fonts.mono, color: theme.colors.textDim,
                        fontSize: 11, width: 50, textAlign: 'center',
                      }}>
                        {h.ticker ?? '—'}
                      </span>
                      {/* Weight */}
                      <span style={{
                        fontFamily: theme.fonts.mono, color: theme.colors.textMuted,
                        fontSize: 11, width: 52, textAlign: 'right',
                      }}>
                        {h.pct_of_nav != null ? `${h.pct_of_nav.toFixed(2)}%` : '—'}
                      </span>
                      {/* Sector pill */}
                      <span style={{
                        width: 90, textAlign: 'right',
                        fontSize: 10, color: getSectorColor(h.sector || 'Other'),
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {h.sector ?? '—'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ═══ SECTORS TAB ═══ */}
          {activeTab === 'sectors' && (
            <div style={{ padding: '0 4px' }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: theme.colors.textDim,
                marginBottom: 8,
              }}>
                {sectorGroups.length} Sectors — {holdings.length} positions
              </div>

              {sectorGroups.map(group => {
                const isExpanded = expandedSector === group.sector;
                const pct = totalWeight > 0
                  ? ((group.weight / totalWeight) * 100).toFixed(1) : '0';

                return (
                  <div key={group.sector}>
                    {/* Sector header row */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSector(prev =>
                          prev === group.sector ? null : group.sector
                        );
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 4px', cursor: 'pointer', borderRadius: 4,
                        transition: 'background 100ms',
                        background: isExpanded
                          ? 'rgba(255,255,255,0.03)'
                          : 'transparent',
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: group.color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 13, color: theme.colors.text, flex: 1,
                      }}>
                        {group.sector}
                      </span>
                      <span style={{
                        fontSize: 11, color: theme.colors.textDim,
                      }}>
                        {group.items.length}
                      </span>
                      <div style={{
                        width: 60, height: 4, borderRadius: 2,
                        background: theme.colors.border,
                        overflow: 'hidden', flexShrink: 0,
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          background: group.color,
                          width: `${Math.min(100, parseFloat(pct))}%`,
                        }} />
                      </div>
                      <span style={{
                        fontFamily: theme.fonts.mono, fontSize: 12,
                        color: theme.colors.textMuted,
                        minWidth: 40, textAlign: 'right',
                      }}>
                        {pct}%
                      </span>
                      <span style={{
                        fontSize: 11, color: theme.colors.textDim,
                        width: 12, textAlign: 'center',
                      }}>
                        {isExpanded ? '\u25BE' : '\u25B8'}
                      </span>
                    </div>

                    {/* Expanded holdings under this sector */}
                    {isExpanded && (
                      <div style={{
                        marginLeft: 16, marginBottom: 4,
                        borderLeft: `2px solid ${group.color}44`,
                        paddingLeft: 10,
                      }}>
                        {group.items.map((h, idx) => (
                          <div key={idx} style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', padding: '3px 0',
                            fontSize: 12, gap: 8,
                            borderBottom: idx < group.items.length - 1
                              ? `1px solid ${theme.colors.border}33`
                              : 'none',
                          }}>
                            <span style={{
                              color: '#cbd5e1', flex: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {h.name ?? '—'}
                            </span>
                            {h.ticker && (
                              <span style={{
                                fontFamily: theme.fonts.mono,
                                color: theme.colors.textDim,
                                fontSize: 11, flexShrink: 0,
                              }}>
                                {h.ticker}
                              </span>
                            )}
                            <span style={{
                              fontFamily: theme.fonts.mono,
                              color: theme.colors.textMuted,
                              fontSize: 11, flexShrink: 0,
                              minWidth: 48, textAlign: 'right',
                            }}>
                              {h.pct_of_nav != null
                                ? `${h.pct_of_nav.toFixed(2)}%`
                                : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
