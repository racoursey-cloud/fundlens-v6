/**
 * FundLens v6 — Portfolio Page
 *
 * Main view: two SVG donuts (sector exposure + fund allocation),
 * ranked fund table with factor scores, factor weight sliders
 * with proportional redistribution, risk tolerance toggle.
 *
 * Clicking a fund row opens the Fund Detail sidebar.
 *
 * Session 9 deliverable. Destination: client/src/pages/Portfolio.tsx
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
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
import { FundDetail } from '../components/FundDetail';

// ─── Normal CDF (Abramowitz & Stegun 7.1.26) ──────────────────────────────
// Lightweight client-side implementation for slider rescore (§2.1).
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
// Client-side MAD z-score → tier, mirrors scoring.ts computeTiers().

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

// ─── SVG Donut ─────────────────────────────────────────────────────────────

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#a855f7', '#0ea5e9', '#eab308',
];

function SvgDonut({ slices, size = 160, label }: {
  slices: DonutSlice[];
  size?: number;
  label: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const strokeWidth = size * 0.18;
  const circumference = 2 * Math.PI * r;

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center' }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={theme.colors.border} strokeWidth={strokeWidth} />
        </svg>
        <div style={{ fontSize: '12px', color: theme.colors.textDim, marginTop: '8px' }}>{label}</div>
      </div>
    );
  }

  let offset = 0;
  const arcs = slices.filter(s => s.value > 0).map((slice) => {
    const pct = slice.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = (offset / total) * 360 - 90;
    offset += slice.value;
    return { ...slice, dash, gap, rotation, pct };
  });

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        {arcs.map((arc, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={arc.color} strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            transform={`rotate(${arc.rotation} ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        ))}
      </svg>
      <div style={{ fontSize: '12px', color: theme.colors.textDim, marginTop: '8px' }}>{label}</div>
    </div>
  );
}

function DonutLegend({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
      {slices.filter(s => s.value > 0).slice(0, 8).map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '10px', height: '10px', borderRadius: '2px',
            background: s.color, flexShrink: 0,
          }} />
          <span style={{ color: theme.colors.textMuted, flex: 1 }}>{s.label}</span>
          <span style={{ color: theme.colors.text, fontFamily: theme.fonts.mono }}>
            {total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Factor Weight Slider ──────────────────────────────────────────────────

interface FactorSliderProps {
  label: string;
  shortLabel: string;
  value: number;
  onChange: (val: number) => void;
}

function FactorSlider({ label, shortLabel, value, onChange }: FactorSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{
        width: '80px', fontSize: '12px', color: theme.colors.textMuted,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={label}>
        {shortLabel}
      </span>
      <input
        type="range" min={5} max={60} step={1} value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ flex: 1, accentColor: theme.colors.accentBlue }}
      />
      <span style={{
        width: '40px', textAlign: 'right', fontSize: '13px',
        fontFamily: theme.fonts.mono, color: theme.colors.text,
      }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─── Risk Slider (Continuous, §3.4 + §6.4) ────────────────────────────────

/** 7 anchor point labels from KELLY_RISK_TABLE (§3.4) */
const RISK_ANCHORS: Array<{ level: number; label: string }> = [
  { level: 1, label: 'Very Conservative' },
  { level: 2, label: 'Conservative' },
  { level: 3, label: 'Mod. Conservative' },
  { level: 4, label: 'Moderate' },
  { level: 5, label: 'Mod. Aggressive' },
  { level: 6, label: 'Aggressive' },
  { level: 7, label: 'Very Aggressive' },
];

/** Get the nearest anchor label for a continuous risk value */
function nearestRiskLabel(value: number): string {
  const nearest = Math.round(Math.min(7, Math.max(1, value)));
  return RISK_ANCHORS.find(a => a.level === nearest)?.label ?? 'Moderate';
}

function RiskSlider({ value, onChange }: {
  value: number;
  onChange: (val: number) => void;
}) {
  const fillPct = ((value - 1) / 6) * 100;
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: '6px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: theme.colors.text }}>
          {nearestRiskLabel(value)}
        </span>
        <span style={{
          fontSize: '13px', fontFamily: theme.fonts.mono,
          color: theme.colors.accentBlue, fontWeight: 600,
        }}>
          {value.toFixed(1)}/7
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={7}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 10) / 10)}
        style={{
          width: '100%',
          height: '4px',
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, ${theme.colors.accentBlue} 0%, ${theme.colors.accentBlue} ${fillPct}%, ${theme.colors.border} ${fillPct}%, ${theme.colors.border} 100%)`,
          borderRadius: '2px',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '4px',
        fontSize: '10px', color: theme.colors.textDim,
      }}>
        <span>Very Conservative</span>
        <span>Very Aggressive</span>
      </div>
    </div>
  );
}

// ─── Score Badge ───────────────────────────────────────────────────────────

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

// ─── Main Component ────────────────────────────────────────────────────────

export function Portfolio() {
  const { user } = useAuth();
  const [scores, setScores] = useState<FundScore[]>([]);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [_profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  // Local weight state (for sliders — saved on blur)
  const [weights, setWeights] = useState({
    cost: 0.25, quality: 0.30, positioning: 0.25, momentum: 0.20,
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
        setRisk(Number(p.risk_tolerance) || 4.0);
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

  // Persist weight/risk changes
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

  // Client-side rescore with custom weights using z-scores + CDF (§2.1)
  // Z-scores are pre-computed server-side; client does weighted sum + normalCDF
  const rankedScores = useMemo(() => {
    // First pass: compute composites
    const withComposites = scores.map(s => {
      const zComposite =
        (s.z_cost_efficiency ?? 0) * weights.cost +
        (s.z_holdings_quality ?? 0) * weights.quality +
        (s.z_positioning ?? 0) * weights.positioning +
        (s.z_momentum ?? 0) * weights.momentum;
      const composite = Math.round(Math.max(0, Math.min(100, 100 * normalCDF(zComposite))));
      return { ...s, userComposite: composite };
    });

    // Second pass: compute tier badges from MAD z-scores (§6.3)
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
      .sort((a, b) => b.userComposite - a.userComposite);
  }, [scores, weights]);

  // Sector exposure donut (aggregate from factor_details)
  const sectorSlices = useMemo((): DonutSlice[] => {
    const sectorMap = new Map<string, number>();
    for (const s of scores) {
      const details = s.factor_details as Record<string, unknown> | undefined;
      const sectors = (details?.sectorExposure || details?.sectors) as Record<string, number> | undefined;
      if (sectors) {
        for (const [sector, weight] of Object.entries(sectors)) {
          sectorMap.set(sector, (sectorMap.get(sector) || 0) + weight);
        }
      }
    }
    return [...sectorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] ?? '#71717a' }));
  }, [scores]);

  // Fund allocation donut (by composite score weight)
  const fundSlices = useMemo((): DonutSlice[] => {
    if (rankedScores.length === 0) return [];
    const top = rankedScores.slice(0, 10);
    return top.map((s, i) => ({
      label: s.funds?.ticker || s.fund_id.slice(0, 6),
      value: Math.max(0, s.userComposite),
      color: DONUT_COLORS[i % DONUT_COLORS.length] ?? '#71717a',
    }));
  }, [rankedScores]);

  if (loading) {
    return <div style={{ color: theme.colors.textMuted, padding: '32px' }}>Loading portfolio...</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 4px', color: theme.colors.text }}>
          Portfolio
        </h1>
        <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: '0 0 24px' }}>
          Welcome, {user?.email?.split('@')[0] || 'investor'}
        </p>

        {scores.length === 0 ? (
          <div style={{
            background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.lg, padding: '32px', textAlign: 'center',
          }}>
            <p style={{ color: theme.colors.textMuted, margin: '0 0 8px' }}>No fund scores yet.</p>
            <p style={{ color: theme.colors.textDim, fontSize: '13px', margin: 0 }}>
              Run the pipeline from the Pipeline tab to generate scores.
            </p>
          </div>
        ) : (
          <>
            {/* Donuts Row */}
            <div style={{
              display: 'flex', gap: '32px', marginBottom: '24px', flexWrap: 'wrap',
              background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg, padding: '24px',
            }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <SvgDonut slices={sectorSlices} label="Sector Exposure" />
                <DonutLegend slices={sectorSlices} />
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <SvgDonut slices={fundSlices} label="Fund Allocation" />
                <DonutLegend slices={fundSlices} />
              </div>
            </div>

            {/* Fund Table */}
            <div style={{
              background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg, overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Fund</th>
                    <th style={thStyle}>Cost</th>
                    <th style={thStyle}>Quality</th>
                    <th style={thStyle}>Position</th>
                    <th style={thStyle}>Momentum</th>
                    <th style={thStyle}>Score</th>
                    <th style={thStyle}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedScores.map((s, i) => {
                    const ticker = s.funds?.ticker || s.fund_id.slice(0, 8);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedFund(ticker)}
                        style={{
                          borderBottom: `1px solid ${theme.colors.border}`,
                          cursor: 'pointer',
                          background: selectedFund === ticker ? theme.colors.surfaceHover : 'transparent',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedFund !== ticker) e.currentTarget.style.background = theme.colors.surfaceHover;
                        }}
                        onMouseLeave={(e) => {
                          if (selectedFund !== ticker) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={{ ...tdStyle, color: theme.colors.textDim, width: '40px' }}>{i + 1}</td>
                        <td style={{ ...tdStyle, textAlign: 'left' }}>
                          <span style={{ fontWeight: 500, color: theme.colors.text }}>{ticker}</span>
                          {s.funds?.name && (
                            <span style={{ marginLeft: '8px', fontSize: '12px', color: theme.colors.textDim }}>
                              {s.funds.name}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: scoreColor(s.cost_efficiency) }}>{s.cost_efficiency.toFixed(0)}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: scoreColor(s.holdings_quality) }}>{s.holdings_quality.toFixed(0)}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: scoreColor(s.positioning) }}>{s.positioning.toFixed(0)}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: scoreColor(s.momentum) }}>{s.momentum.toFixed(0)}</span>
                        </td>
                        <td style={{
                          ...tdStyle, fontWeight: 600, fontSize: '14px',
                        }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '6px',
                            background: scoreBg(s.userComposite),
                            color: scoreColor(s.userComposite),
                          }}>
                            {s.userComposite.toFixed(1)}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                            fontWeight: 600, letterSpacing: '0.03em',
                            color: s.userTierColor,
                            background: `${s.userTierColor}18`,
                            border: `1px solid ${s.userTierColor}40`,
                          }}>
                            {s.userTier}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pipeline timestamp */}
            {pipelineRun && (
              <div style={{ marginTop: '16px', fontSize: '12px', color: theme.colors.textDim }}>
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
      </div>

      {/* Right sidebar — controls + fund detail */}
      <div style={{ width: '300px', flexShrink: 0 }}>
        {/* Factor Weights */}
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, padding: '20px', marginBottom: '16px',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, margin: '0 0 16px' }}>
            Factor Weights
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FactorSlider label="Cost Efficiency" shortLabel="Cost" value={weights.cost}
              onChange={(v) => handleWeightChange('cost', v)} />
            <FactorSlider label="Holdings Quality" shortLabel="Quality" value={weights.quality}
              onChange={(v) => handleWeightChange('quality', v)} />
            <FactorSlider label="Positioning" shortLabel="Position" value={weights.positioning}
              onChange={(v) => handleWeightChange('positioning', v)} />
            <FactorSlider label="Momentum" shortLabel="Momentum" value={weights.momentum}
              onChange={(v) => handleWeightChange('momentum', v)} />
          </div>
          <button
            onClick={savePreferences}
            style={{
              marginTop: '16px', width: '100%', padding: '8px', border: 'none',
              borderRadius: theme.radii.md, background: theme.colors.accentBlue,
              color: theme.colors.white, fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Save Weights
          </button>
        </div>

        {/* Risk Tolerance */}
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, padding: '20px', marginBottom: '16px',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text, margin: '0 0 12px' }}>
            Risk Tolerance
          </h3>
          <RiskSlider value={risk} onChange={handleRiskChange} />
          <p style={{ fontSize: '11px', color: theme.colors.textDim, margin: '8px 0 0' }}>
            Affects allocation sizing, not scoring.
          </p>
        </div>

        {/* Fund Detail (if selected) */}
        {selectedFund && (
          <FundDetail
            ticker={selectedFund}
            onClose={() => setSelectedFund(null)}
          />
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', fontWeight: 500, fontSize: '11px',
  color: theme.colors.textDim, textAlign: 'right',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'right',
  color: theme.colors.text, fontFamily: theme.fonts.mono, fontSize: '13px',
};
