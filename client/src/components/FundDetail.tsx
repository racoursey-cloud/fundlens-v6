/**
 * FundLens v6 — Fund Detail Sidebar Component
 *
 * Shows detailed breakdown for a selected fund:
 *   - Sector exposure donut (from holdings classification)
 *   - Four factor score bars with AI reasoning
 *   - Top holdings table with weight and ticker
 *   - Filing metadata (report date, coverage stats)
 *
 * Fetches data via GET /api/scores/:ticker which returns
 * { fund, score, holdings } from the server.
 *
 * Session 9 deliverable. Destination: client/src/components/FundDetail.tsx
 */

import { useEffect, useState } from 'react';
import { fetchFundScore, type FundScore, type Fund } from '../api';
import { theme } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────

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

// ─── SVG Mini Donut ───────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#3b82f6',
  Healthcare: '#06b6d4',
  Financials: '#8b5cf6',
  'Consumer Discretionary': '#f59e0b',
  'Consumer Staples': '#22c55e',
  Energy: '#ef4444',
  Industrials: '#f97316',
  Materials: '#14b8a6',
  'Real Estate': '#ec4899',
  Utilities: '#6366f1',
  'Communication Services': '#a855f7',
  Other: '#71717a',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? SECTOR_COLORS['Other'] ?? '#71717a';
}

function MiniDonut({ sectors }: { sectors: Array<{ sector: string; weight: number }> }) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const strokeWidth = size * 0.16;
  const circumference = 2 * Math.PI * r;
  const total = sectors.reduce((s, sec) => s + sec.weight, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={theme.colors.border} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  let offset = 0;
  const arcs = sectors.map((sec) => {
    const pct = sec.weight / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = (offset / total) * 360 - 90;
    offset += sec.weight;
    return { ...sec, dash, gap, rotation, pct };
  });

  return (
    <svg width={size} height={size}>
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={getSectorColor(arc.sector)} strokeWidth={strokeWidth}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          transform={`rotate(${arc.rotation} ${cx} ${cy})`}
        />
      ))}
    </svg>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 75 ? theme.colors.success :
    score >= 50 ? theme.colors.accentBlue :
    score >= 25 ? theme.colors.warning :
    theme.colors.error;

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
      }}>
        <span style={{ fontSize: '12px', color: theme.colors.textMuted }}>{label}</span>
        <span style={{
          fontSize: '12px', fontFamily: theme.fonts.mono,
          color, fontWeight: 600,
        }}>
          {score.toFixed(0)}
        </span>
      </div>
      <div style={{
        height: '6px', borderRadius: '3px',
        background: theme.colors.border, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: '3px',
          background: color, width: `${Math.min(100, Math.max(0, score))}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function FundDetail({ ticker, onClose }: Props) {
  const [fund, setFund] = useState<Fund | null>(null);
  const [score, setScore] = useState<FundScore | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

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

  // Extract sector breakdown from holdings
  const sectorBreakdown = (() => {
    const map = new Map<string, number>();
    for (const h of holdings) {
      const sector = h.sector || 'Other';
      map.set(sector, (map.get(sector) || 0) + (h.pct_of_nav || 0));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, weight]) => ({ sector, weight }));
  })();

  // Extract AI reasoning from factor_details
  const reasoning = (() => {
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
  })();

  if (loading) {
    return (
      <div style={{
        background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg, padding: '20px',
      }}>
        <span style={{ color: theme.colors.textDim, fontSize: '13px' }}>Loading {ticker}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg, padding: '20px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px',
        }}>
          <span style={{ fontWeight: 600, color: theme.colors.text }}>{ticker}</span>
          <button onClick={onClose} style={closeBtnStyle}>&times;</button>
        </div>
        <p style={{ color: theme.colors.error, fontSize: '13px', margin: 0 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{
      background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii.lg, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.text }}>
            {ticker}
          </div>
          {fund?.name && (
            <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginTop: '2px' }}>
              {fund.name}
            </div>
          )}
          {fund?.expense_ratio != null && (
            <div style={{ fontSize: '11px', color: theme.colors.textDim, marginTop: '4px' }}>
              Expense Ratio: {(fund.expense_ratio * 100).toFixed(2)}%
            </div>
          )}
        </div>
        <button onClick={onClose} style={closeBtnStyle}>&times;</button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Factor Scores */}
        {score && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={sectionTitle}>Factor Scores</h4>
            <ScoreBar label="Cost Efficiency" score={score.cost_efficiency} />
            <ScoreBar label="Holdings Quality" score={score.holdings_quality} />
            <ScoreBar label="Positioning" score={score.positioning} />
            <ScoreBar label="Momentum" score={score.momentum} />
          </div>
        )}

        {/* AI Reasoning (if any factor has it) */}
        {reasoning && Object.values(reasoning).some(Boolean) && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={sectionTitle}>AI Analysis</h4>
            {reasoning.costEfficiency && (
              <ReasoningBlock label="Cost" text={reasoning.costEfficiency} />
            )}
            {reasoning.holdingsQuality && (
              <ReasoningBlock label="Quality" text={reasoning.holdingsQuality} />
            )}
            {reasoning.positioning && (
              <ReasoningBlock label="Positioning" text={reasoning.positioning} />
            )}
            {reasoning.momentum && (
              <ReasoningBlock label="Momentum" text={reasoning.momentum} />
            )}
          </div>
        )}

        {/* Sector Donut */}
        {sectorBreakdown.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={sectionTitle}>Sector Exposure</h4>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <MiniDonut sectors={sectorBreakdown} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                {sectorBreakdown.slice(0, 6).map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '2px',
                      background: getSectorColor(s.sector), flexShrink: 0,
                    }} />
                    <span style={{ color: theme.colors.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.sector}
                    </span>
                    <span style={{ color: theme.colors.text, fontFamily: theme.fonts.mono }}>
                      {(s.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Holdings */}
        {holdings.length > 0 && (
          <div>
            <h4 style={sectionTitle}>Top Holdings</h4>
            <div style={{ fontSize: '12px' }}>
              {holdings.slice(0, 15).map((h, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: i < Math.min(holdings.length, 15) - 1
                    ? `1px solid ${theme.colors.border}` : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: theme.colors.text, fontWeight: 500,
                      marginRight: '6px', fontFamily: theme.fonts.mono,
                    }}>
                      {h.ticker || '—'}
                    </span>
                    <span style={{
                      color: theme.colors.textDim, fontSize: '11px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {h.name}
                    </span>
                  </div>
                  <span style={{
                    color: theme.colors.textMuted, fontFamily: theme.fonts.mono,
                    marginLeft: '8px', flexShrink: 0,
                  }}>
                    {(h.pct_of_nav * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
              {holdings.length > 15 && (
                <div style={{
                  color: theme.colors.textDim, fontSize: '11px',
                  textAlign: 'center', padding: '8px 0',
                }}>
                  +{holdings.length - 15} more holdings
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reasoning Block ──────────────────────────────────────────────────────

function ReasoningBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <span style={{
        fontSize: '11px', fontWeight: 600, color: theme.colors.accentBlue,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}
      </span>
      <p style={{
        margin: '4px 0 0', fontSize: '12px', lineHeight: '1.5',
        color: theme.colors.textMuted,
      }}>
        {text}
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: theme.colors.textDim,
  fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: '1',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: theme.colors.textDim,
  textTransform: 'uppercase', letterSpacing: '0.5px',
  margin: '0 0 12px',
};
