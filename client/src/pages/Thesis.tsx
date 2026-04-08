/**
 * FundLens v6 — Thesis Page
 *
 * Ported from v5.1's ThesisTab.jsx. Two cards stacked vertically:
 *   1. Investment Thesis — macro stance badge, dominant theme, narrative text
 *   2. Sector Outlook — SectorScorecard grid (11–14 GICS sectors, scored 1–10)
 *
 * Data from GET /api/thesis/latest → thesis_cache table.
 *
 * Session 11 deliverable. Destination: client/src/pages/Thesis.tsx
 * References: Spec §2.6.1 (sector scores), v5.1 ThesisTab.jsx
 */

import { useEffect, useState } from 'react';
import { fetchThesis, type ThesisData } from '../api';
import { theme } from '../theme';
import { SectorScorecard, type SectorScore } from '../components/SectorScorecard';

// ─── Stance Configuration ───────────────────────────────────────────────────

const STANCE_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string;
}> = {
  'risk-on':  { label: 'Bullish',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)'  },
  bullish:    { label: 'Bullish',       color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)'  },
  'risk-off': { label: 'Bearish',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
  bearish:    { label: 'Bearish',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
  mixed:      { label: 'Neutral',       color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)'  },
  neutral:    { label: 'Neutral',       color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)'  },
  transitional: { label: 'Transitional', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)' },
};

function getStance(macroStance: string): { label: string; color: string; bg: string; border: string } {
  return STANCE_CONFIG[macroStance?.toLowerCase()] ?? STANCE_CONFIG['neutral']!;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function Thesis() {
  const [thesis, setThesis] = useState<ThesisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchThesis().then(res => {
      if (res.data?.thesis) setThesis(res.data.thesis);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ color: theme.colors.textMuted, padding: '32px' }}>
        Loading thesis...
      </div>
    );
  }

  if (!thesis) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke={theme.colors.textDim} strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <h2 style={{
          fontFamily: theme.fonts.serif, fontSize: 18, fontWeight: 700,
          color: theme.colors.text, margin: 0,
        }}>
          Investment Thesis
        </h2>
        <p style={{
          fontSize: 13, color: theme.colors.textDim,
          maxWidth: 360, lineHeight: 1.5,
        }}>
          Run the pipeline to generate your macro thesis and sector outlook.
        </p>
      </div>
    );
  }

  const stance = getStance(thesis.macro_stance);

  // Convert sector_preferences array → Record<string, SectorScore>
  const sectorScores: Record<string, SectorScore> = {};
  if (thesis.sector_preferences) {
    for (const sp of thesis.sector_preferences) {
      sectorScores[sp.sector] = {
        score: sp.score,
        reasoning: sp.reasoning || sp.preference,
      };
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

      {/* ── Thesis Card ──────────────────────────────────────── */}
      <div style={{
        background: theme.colors.surface,
        border: `1px solid rgba(255,255,255,0.06)`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <span style={{
            fontFamily: theme.fonts.serif, fontWeight: 700, fontSize: 15,
            color: theme.colors.text,
          }}>
            Investment Thesis
          </span>
          {thesis.generated_at && (
            <span style={{ fontSize: 11, color: theme.colors.textDim }}>
              {fmtDate(thesis.generated_at)}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stance + Theme badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Macro stance badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: stance.color, background: stance.bg,
              border: `1px solid ${stance.border}`,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                backgroundColor: stance.color,
              }} />
              {stance.label}
            </span>

            {/* Dominant theme badge */}
            {thesis.dominant_theme && thesis.dominant_theme !== 'Unavailable' && (
              <span style={{
                padding: '5px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                color: '#93c5fd',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
              }}>
                {thesis.dominant_theme}
              </span>
            )}
          </div>

          {/* Thesis narrative */}
          <p style={{
            fontSize: 14, lineHeight: 1.75,
            color: '#d1d5db', margin: 0, maxWidth: 720,
          }}>
            {thesis.narrative}
          </p>

          {/* Key themes */}
          {thesis.key_themes && thesis.key_themes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {thesis.key_themes.map((t, i) => (
                <span key={i} style={{
                  padding: '3px 10px', borderRadius: 4,
                  fontSize: 11, fontWeight: 500,
                  color: theme.colors.textMuted,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sector Scorecard Card ────────────────────────────── */}
      <div style={{
        background: theme.colors.surface,
        border: `1px solid rgba(255,255,255,0.06)`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <span style={{
            fontFamily: theme.fonts.serif, fontWeight: 700, fontSize: 15,
            color: theme.colors.text,
          }}>
            Sector Outlook
          </span>
          <span style={{ fontSize: 11, color: theme.colors.textDim }}>
            {Object.keys(sectorScores).length} sectors scored 1{'\u2013'}10
          </span>
        </div>
        <div style={{ padding: '16px 24px' }}>
          <SectorScorecard sectorScores={sectorScores} />
        </div>
      </div>
    </div>
  );
}
