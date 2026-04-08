/**
 * FundLens v6 — Sector Scorecard Component
 *
 * Ported directly from v5.1's SectorScorecard.jsx. Renders a grid of
 * 11–14 GICS sectors sorted by score descending, each with:
 *   - Colored dot + sector name
 *   - Score badge (JetBrains Mono, 1.0–10.0)
 *   - Progress bar (1–10 mapped to 0–100%)
 *   - One-line reasoning text
 *
 * Used by: Thesis.tsx (standalone), Briefs.tsx (inline in "Where We Stand")
 *
 * Session 11 deliverable. Destination: client/src/components/SectorScorecard.tsx
 * References: Spec §2.6.1 (14 standard sectors, 1.0–10.0 scale)
 */

import { theme } from '../theme';

// ─── Sector Colors (GICS standard) ──────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  Technology:             '#3b82f6',
  Healthcare:             '#06b6d4',
  Financials:             '#8b5cf6',
  'Consumer Discretionary': '#f59e0b',
  'Consumer Staples':     '#22c55e',
  Energy:                 '#ef4444',
  Industrials:            '#f97316',
  Materials:              '#14b8a6',
  'Real Estate':          '#ec4899',
  Utilities:              '#6366f1',
  'Communication Services': '#a855f7',
  'Precious Metals':      '#eab308',
  'Fixed Income':         '#64748b',
  'Cash & Equivalents':   '#94a3b8',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

// ─── Score → verbal label (fallback when no reasoning provided) ─────────────

function scoreLabel(score: number): string {
  if (score >= 8)   return 'Strong tailwinds';
  if (score >= 6)   return 'Favorable';
  if (score >= 4.5) return 'Neutral';
  if (score >= 3)   return 'Headwinds';
  return 'Strong headwinds';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SectorScore {
  score: number;
  reasoning?: string;
}

interface SectorScorecardProps {
  sectorScores: Record<string, SectorScore>;
  /** Compact mode for inline rendering in Briefs */
  compact?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SectorScorecard({ sectorScores, compact = false }: SectorScorecardProps) {
  if (!sectorScores || Object.keys(sectorScores).length === 0) return null;

  const sorted = Object.entries(sectorScores)
    .sort((a, b) => b[1].score - a[1].score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {sorted.map(([sector, data]) => {
        const color = getSectorColor(sector);
        const score = data.score ?? 5;
        const pct = ((score - 1) / 9) * 100; // 1–10 mapped to 0–100%

        return (
          <div
            key={sector}
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '140px 44px 1fr' : '180px 52px 1fr',
              alignItems: 'center',
              gap: compact ? 8 : 12,
              padding: compact ? '7px 10px' : '10px 14px',
              borderRadius: theme.radii.md,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
          >
            {/* Sector name with color dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: color, flexShrink: 0,
              }} />
              <span style={{
                fontSize: compact ? 12 : 13, fontWeight: 600,
                color: theme.colors.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {sector}
              </span>
            </div>

            {/* Score badge */}
            <div style={{
              fontFamily: theme.fonts.mono,
              fontSize: compact ? 12 : 13,
              fontWeight: 700,
              color: color,
              textAlign: 'right',
            }}>
              {score.toFixed(1)}
            </div>

            {/* Score bar + reasoning */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
                marginBottom: 5,
              }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 3,
                  background: color,
                  opacity: 0.85,
                  transition: 'width 0.5s ease-out',
                }} />
              </div>
              <p style={{
                fontSize: compact ? 10 : 11,
                color: theme.colors.textMuted,
                lineHeight: 1.4,
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
                title={data.reasoning || scoreLabel(score)}
              >
                {data.reasoning || scoreLabel(score)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
