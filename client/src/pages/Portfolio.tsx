/**
 * FundLens v6 — Portfolio Page (Placeholder)
 *
 * This is the main view — it will show fund scores, rankings,
 * donuts, and the factor weight sliders. The full implementation
 * comes in Session 9.
 *
 * For now it shows a welcome message and pipeline status to
 * confirm auth + API calls are working end-to-end.
 *
 * Session 8 deliverable. Destination: client/src/pages/Portfolio.tsx
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchPipelineStatus, fetchScores, type PipelineRun, type FundScore } from '../api';
import { theme } from '../theme';

export function Portfolio() {
  const { user } = useAuth();
  const [latestRun, setLatestRun] = useState<PipelineRun | null>(null);
  const [scores, setScores] = useState<FundScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPipelineStatus(), fetchScores()]).then(([statusRes, scoresRes]) => {
      if (statusRes.data?.latestRun) setLatestRun(statusRes.data.latestRun);
      if (scoresRes.data?.scores) setScores(scoresRes.data.scores);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 style={{
        fontSize: '24px',
        fontWeight: 600,
        margin: '0 0 4px',
        color: theme.colors.text,
      }}>
        Portfolio
      </h1>
      <p style={{
        fontSize: '14px',
        color: theme.colors.textMuted,
        margin: '0 0 32px',
      }}>
        Welcome, {user?.email?.split('@')[0] || 'investor'}
      </p>

      {loading ? (
        <p style={{ color: theme.colors.textMuted }}>Loading scores...</p>
      ) : scores.length === 0 ? (
        /* No scores yet */
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '32px',
          textAlign: 'center',
        }}>
          <p style={{ color: theme.colors.textMuted, margin: '0 0 8px' }}>
            No fund scores yet.
          </p>
          <p style={{ color: theme.colors.textDim, fontSize: '13px', margin: 0 }}>
            The pipeline needs to run before scores appear here.
            Check the Pipeline tab to trigger a run.
          </p>
        </div>
      ) : (
        /* Score table (basic — full version in Session 9) */
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          overflow: 'hidden',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                <th style={thStyle}>Rank</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Fund</th>
                <th style={thStyle}>Cost</th>
                <th style={thStyle}>Quality</th>
                <th style={thStyle}>Position</th>
                <th style={thStyle}>Momentum</th>
                <th style={thStyle}>Composite</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>
                    {s.funds?.ticker || s.fund_id.slice(0, 8)}
                  </td>
                  <td style={tdStyle}>{s.cost_efficiency.toFixed(0)}</td>
                  <td style={tdStyle}>{s.holdings_quality.toFixed(0)}</td>
                  <td style={tdStyle}>{s.positioning.toFixed(0)}</td>
                  <td style={tdStyle}>{s.momentum.toFixed(0)}</td>
                  <td style={{
                    ...tdStyle,
                    fontWeight: 600,
                    color: theme.colors.accentBlue,
                    fontFamily: theme.fonts.mono,
                  }}>
                    {s.composite_default.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pipeline status */}
      {latestRun && (
        <div style={{
          marginTop: '24px',
          fontSize: '12px',
          color: theme.colors.textDim,
        }}>
          Scores last updated: {new Date(latestRun.completed_at || latestRun.started_at).toLocaleString()}
          {' — '}
          {latestRun.funds_succeeded}/{latestRun.funds_processed} funds scored
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontWeight: 500,
  fontSize: '12px',
  color: theme.colors.textMuted,
  textAlign: 'right',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'right',
  color: theme.colors.text,
  fontFamily: theme.fonts.mono,
  fontSize: '13px',
};
