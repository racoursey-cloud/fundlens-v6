/**
 * FundLens v6 — Fund Detail Sidebar (420px Slide-In)
 *
 * Rebuilt in Session 11 to match v5.1's FundDetailSidebar.jsx layout:
 *   - 420px wide fixed right panel (spec §6.7)
 *   - Backdrop overlay with click-to-close
 *   - Slide-in animation (right → 0)
 *   - Sections: Header (name, ticker, expense ratio, tier) → Composite score →
 *     Factor bars (4 factors) → Sector donut with expandable holdings → AI reasoning
 *
 * Session 11 deliverable. Destination: client/src/components/FundDetail.tsx
 * References: Spec §6.7, v5.1 FundDetailSidebar.jsx
 */

import { useEffect, useState, useMemo } from 'react';
import { fetchFundScore, type FundScore, type Fund } from '../api';
import { theme } from '../theme';
import { MiniDonut } from './DonutChart';

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

// ─── Tier Badges ────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  Breakaway: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Breakaway' },
  Strong:    { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', label: 'Strong'    },
  Solid:     { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', label: 'Solid'     },
  Neutral:   { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Neutral'   },
  Weak:      { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', label: 'Weak'      },
  MM:        { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'MM'        },
};

// ─── Score color helper ─────────────────────────────────────────────────────

function factorBarColor(score: number): string {
  if (score >= 75) return theme.colors.success;
  if (score >= 50) return theme.colors.accentBlue;
  if (score >= 25) return theme.colors.warning;
  return theme.colors.error;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FundDetail({ ticker, onClose }: Props) {
  const [fund, setFund] = useState<Fund | null>(null);
  const [score, setScore] = useState<FundScore | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSector, setActiveSector] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActiveSector(null);

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

  // Sector breakdown from holdings
  const sectorBreakdown = useMemo(() => {
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

  // AI reasoning extraction
  const reasoning = useMemo(() => {
    if (!score?.factor_details) return null;
    const d = score.factor_details as Record<string, unknown>;
    const extract = (key: string): string | null => {
      const val = d[key];
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && val !== null) {
        const obj = val as Record<string, unknown>;
        return (obj.reasoning || obj.explanation || obj.summary || null) as string | null;
      }
      return null;
    };
    return {
      costEfficiency: extract('costEfficiency'),
      holdingsQuality: extract('holdingsQuality'),
      positioning: extract('positioning'),
      momentum: extract('momentum'),
    };
  }, [score]);

  const tierConfig = score?.tier ? (TIER_CONFIG[score.tier] ?? TIER_CONFIG.Neutral) : null;

  // ─── Loading / Error states ───────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Backdrop onClick={onClose} />
        <Panel>
          <CloseButton onClick={onClose} />
          <div style={{ padding: '60px 24px', textAlign: 'center', color: theme.colors.textDim }}>
            Loading {ticker}...
          </div>
        </Panel>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Backdrop onClick={onClose} />
        <Panel>
          <CloseButton onClick={onClose} />
          <div style={{ padding: '24px', clear: 'both' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.colors.text, marginBottom: 8 }}>{ticker}</div>
            <p style={{ color: theme.colors.error, fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        </Panel>
      </>
    );
  }

  // ─── Full render ──────────────────────────────────────────────────────

  return (
    <>
      <Backdrop onClick={onClose} />
      <Panel>
        {/* Keyframe for slide animation */}
        <style>{`
          @keyframes fl_slideRight {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
        `}</style>

        <CloseButton onClick={onClose} />

        <div style={{ padding: '20px 24px 48px', clear: 'both' }}>

          {/* ── Header: name, ticker, expense ratio, tier ─────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: '#f1f5f9',
              marginBottom: 4, paddingRight: 32, lineHeight: 1.3,
            }}>
              {fund?.name || ticker}
            </div>
            <div style={{
              fontFamily: theme.fonts.mono, color: theme.colors.accentBlue,
              fontSize: 13, marginBottom: 4,
            }}>
              {ticker}
            </div>
            {fund?.expense_ratio != null && (
              <div style={{ fontSize: 12, color: theme.colors.textDim, marginBottom: 14 }}>
                Expense Ratio: {(fund.expense_ratio * 100).toFixed(2)}%
              </div>
            )}

            {/* Composite score + tier badge */}
            {score && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    fontFamily: theme.fonts.mono, fontSize: 38, fontWeight: 700,
                    color: '#f1f5f9', lineHeight: 1,
                  }}>
                    {score.composite_default.toFixed(0)}
                  </div>
                  {tierConfig && (
                    <div style={{ paddingBottom: 3 }}>
                      <span style={{
                        display: 'inline-block',
                        background: tierConfig.bg, color: tierConfig.color,
                        border: `1px solid ${tierConfig.color}55`,
                        borderRadius: 4, padding: '2px 8px',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', fontFamily: theme.fonts.mono,
                      }}>
                        {tierConfig.label}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Factor score bars (4 factors) */}
            {score && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <FactorBar label="Cost Efficiency" score={score.cost_efficiency} />
                <FactorBar label="Holdings Quality" score={score.holdings_quality} />
                <FactorBar label="Momentum" score={score.momentum} />
                <FactorBar label="Positioning" score={score.positioning} />
              </div>
            )}
          </div>

          <PanelDivider />

          {/* ── Sector Donut with expandable holdings ─────────────────── */}
          {sectorBreakdown.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle>Sector Exposure</SectionTitle>

              <MiniDonut
                sectors={sectorBreakdown}
                size={220}
                activeSector={activeSector}
                onSectorClick={(name) => setActiveSector(prev => prev === name ? null : name)}
              />

              {/* Legend with expandable holdings */}
              <div style={{ marginTop: 8 }}>
                {sectorBreakdown.map(slice => {
                  const totalWeight = sectorBreakdown.reduce((s, sec) => s + sec.weight, 0);
                  return (
                    <div key={slice.sector}>
                      {/* Legend row */}
                      <div
                        onClick={() => setActiveSector(prev => prev === slice.sector ? null : slice.sector)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 4px', cursor: 'pointer', borderRadius: 4,
                          opacity: activeSector && activeSector !== slice.sector ? 0.4 : 1,
                          transition: 'opacity 150ms, background 100ms',
                          background: activeSector === slice.sector ? theme.colors.surfaceAlt : 'transparent',
                        }}
                      >
                        <div style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: slice.color, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 13, color: theme.colors.text, flex: 1 }}>
                          {slice.sector}
                        </span>
                        <span style={{
                          fontFamily: theme.fonts.mono, fontSize: 12,
                          color: theme.colors.textMuted,
                        }}>
                          {totalWeight > 0 ? ((slice.weight / totalWeight) * 100).toFixed(1) : 0}%
                        </span>
                        <span style={{ fontSize: 11, color: theme.colors.textDim, marginLeft: 2 }}>
                          {activeSector === slice.sector ? '\u25BE' : '\u25B8'}
                        </span>
                      </div>

                      {/* Expanded holdings list */}
                      {activeSector === slice.sector && (
                        <div style={{
                          marginLeft: 18, marginBottom: 6,
                          borderLeft: `2px solid ${slice.color}55`,
                          paddingLeft: 10,
                        }}>
                          {slice.items.map((h, idx) => {
                            const name = h.name ?? '\u2014';
                            const holdingTicker = h.ticker ?? null;
                            const wt = h.pct_of_nav != null ? `${(h.pct_of_nav * 100).toFixed(2)}%` : '\u2014';
                            return (
                              <div key={idx} style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', padding: '4px 0', fontSize: 12, gap: 8,
                                borderBottom: idx < slice.items.length - 1 ? `1px solid ${theme.colors.surfaceAlt}` : 'none',
                              }}>
                                <span style={{
                                  color: '#cbd5e1', flex: 1,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {name}
                                </span>
                                {holdingTicker && (
                                  <span style={{
                                    fontFamily: theme.fonts.mono, color: theme.colors.textDim,
                                    fontSize: 11, flexShrink: 0,
                                  }}>
                                    {holdingTicker}
                                  </span>
                                )}
                                <span style={{
                                  fontFamily: theme.fonts.mono, color: theme.colors.textMuted,
                                  fontSize: 11, flexShrink: 0,
                                }}>
                                  {wt}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <PanelDivider />

          {/* ── AI Reasoning ──────────────────────────────────────────── */}
          {reasoning && Object.values(reasoning).some(Boolean) && (
            <div style={{ marginBottom: 20 }}>
              <SectionTitle>AI Analysis</SectionTitle>
              {reasoning.costEfficiency && <ReasoningBlock label="Cost" text={reasoning.costEfficiency} />}
              {reasoning.holdingsQuality && <ReasoningBlock label="Quality" text={reasoning.holdingsQuality} />}
              {reasoning.momentum && <ReasoningBlock label="Momentum" text={reasoning.momentum} />}
              {reasoning.positioning && <ReasoningBlock label="Positioning" text={reasoning.positioning} />}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 149,
      }}
    />
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', right: 0, top: 0,
      height: '100vh', width: 420,
      background: theme.colors.surface,
      borderLeft: `1px solid ${theme.colors.border}`,
      zIndex: 150,
      overflowY: 'auto', overflowX: 'hidden',
      animation: 'fl_slideRight 200ms ease forwards',
    }}>
      {children}
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'sticky', top: 0, float: 'right',
        zIndex: 10, background: 'none', border: 'none',
        color: theme.colors.textDim, fontSize: 22,
        cursor: 'pointer', padding: '14px 16px 0', lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = theme.colors.text)}
      onMouseLeave={e => (e.currentTarget.style.color = theme.colors.textDim)}
    >
      {'\u00D7'}
    </button>
  );
}

function PanelDivider() {
  return <div style={{ height: 1, background: theme.colors.border, margin: '4px 0 24px' }} />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: theme.colors.textDim,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function FactorBar({ label, score }: { label: string; score: number }) {
  const color = factorBarColor(score);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: theme.colors.textMuted }}>{label}</span>
        <span style={{
          fontSize: 12, fontFamily: theme.fonts.mono,
          color, fontWeight: 600,
        }}>
          {score.toFixed(0)}
        </span>
      </div>
      <div style={{
        height: 6, background: theme.colors.border,
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: 6, borderRadius: 3, background: color,
          width: `${Math.min(100, Math.max(0, score))}%`,
          transition: 'width 400ms ease',
        }} />
      </div>
    </div>
  );
}

function ReasoningBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: theme.colors.accentBlue,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}
      </span>
      <p style={{
        margin: '4px 0 0', fontSize: 12, lineHeight: 1.5,
        color: theme.colors.textMuted,
      }}>
        {text}
      </p>
    </div>
  );
}
