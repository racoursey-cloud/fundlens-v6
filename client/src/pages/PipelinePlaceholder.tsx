/**
 * FundLens v6 — Pipeline Placeholder
 *
 * Placeholder for the Pipeline status tab. Full implementation
 * comes in Session 10.
 *
 * For now, shows basic pipeline status and a "Run Pipeline Now" button
 * to confirm the API route is working.
 *
 * Session 8 deliverable. Destination: client/src/pages/PipelinePlaceholder.tsx
 */

import { useEffect, useState } from 'react';
import { fetchPipelineStatus, triggerPipeline, type PipelineRun } from '../api';
import { theme } from '../theme';

export function PipelinePlaceholder() {
  const [latestRun, setLatestRun] = useState<PipelineRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    const { data } = await fetchPipelineStatus();
    if (data) {
      setLatestRun(data.latestRun);
      setIsRunning(data.isRunning);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRun = async () => {
    setMessage('');
    const { data, error } = await triggerPipeline();
    if (error) {
      setMessage(error);
    } else {
      setMessage(data?.message || 'Pipeline started');
      setIsRunning(true);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
        Pipeline
      </h1>
      <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: '0 0 24px' }}>
        Score all active 401(k) funds. Full monitoring UI coming in Session 10.
      </p>

      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        padding: '24px',
      }}>
        {loading ? (
          <p style={{ color: theme.colors.textMuted, margin: 0 }}>Loading...</p>
        ) : latestRun ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: latestRun.status === 'completed'
                  ? theme.colors.success
                  : latestRun.status === 'running'
                    ? theme.colors.warning
                    : theme.colors.error,
              }} />
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                {latestRun.status}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: theme.colors.textMuted, lineHeight: 1.6 }}>
              <div>Started: {new Date(latestRun.started_at).toLocaleString()}</div>
              {latestRun.completed_at && (
                <div>Completed: {new Date(latestRun.completed_at).toLocaleString()}</div>
              )}
              <div>Funds: {latestRun.funds_succeeded}/{latestRun.funds_processed} succeeded</div>
              {latestRun.duration_ms && (
                <div>Duration: {(latestRun.duration_ms / 1000).toFixed(1)}s</div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: theme.colors.textMuted, margin: 0 }}>
            No pipeline runs yet.
          </p>
        )}

        <button
          onClick={handleRun}
          disabled={isRunning}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: isRunning ? theme.colors.border : theme.colors.accentBlue,
            border: 'none',
            borderRadius: theme.radii.md,
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            fontFamily: theme.fonts.body,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? 'Pipeline running...' : 'Run Pipeline Now'}
        </button>

        {message && (
          <p style={{ color: theme.colors.textMuted, fontSize: '13px', marginTop: '8px' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
