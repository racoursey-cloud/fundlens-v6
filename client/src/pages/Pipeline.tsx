/**
 * FundLens v6 — Pipeline Page
 *
 * Full monitoring UI for the scoring pipeline. Shows run history,
 * system health, and controls for triggering/retrying runs.
 *
 * Features:
 *   - "Run Pipeline Now" button with status indicator
 *   - Pipeline run history with status, duration, fund counts
 *   - Auto-refresh while pipeline is running (10s polling)
 *   - "Retry Failed" button for failed runs
 *   - System health section
 *
 * Session 10 deliverable. Destination: client/src/pages/Pipeline.tsx
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchPipelineStatus,
  triggerPipeline,
  retryPipeline,
  fetchSystemHealth,
  fetchLatestDossiers,
  type PipelineRun,
  type FundDossierRow,
} from '../api';
import { theme } from '../theme';

// ─── Status Dot ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: PipelineRun['status'] }) {
  const color =
    status === 'completed' ? theme.colors.success :
    status === 'running' ? theme.colors.warning :
    theme.colors.error;

  return (
    <span style={{
      display: 'inline-block',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      boxShadow: status === 'running' ? `0 0 8px ${color}60` : 'none',
      animation: status === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }} />
  );
}

// ─── Format Helpers ────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${min}m ${remSec}s`;
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii.md,
      padding: '16px',
      flex: 1,
      minWidth: '120px',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        color: theme.colors.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '6px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '22px',
        fontWeight: 700,
        fontFamily: theme.fonts.mono,
        color: color ?? theme.colors.text,
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function Pipeline() {
  const [latestRun, setLatestRun] = useState<PipelineRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<PipelineRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>('');
  const [healthIssues, setHealthIssues] = useState<string[]>([]);
  const [dossiers, setDossiers] = useState<FundDossierRow[]>([]);
  const [dossierRunAt, setDossierRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load pipeline status ───────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    const { data } = await fetchPipelineStatus();
    if (data) {
      setLatestRun(data.latestRun);
      setRecentRuns(data.recentRuns);
      setIsRunning(data.isRunning);
    }
    setLoading(false);
  }, []);

  // ── Load system health ─────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    const { data } = await fetchSystemHealth();
    if (data) {
      setHealthStatus(data.status);
      setHealthIssues(data.issues);
    }
  }, []);

  // ── Load fund Dossiers (A3 Task 5) ─────────────────────────────────────
  const loadDossiers = useCallback(async () => {
    const { data } = await fetchLatestDossiers();
    if (data) {
      setDossiers(data.dossiers);
      setDossierRunAt(data.completedAt);
    }
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    loadStatus();
    loadHealth();
  }, [loadStatus, loadHealth]);

  // Dossiers: load on mount and refresh whenever a run finishes
  useEffect(() => {
    if (!isRunning) loadDossiers();
  }, [isRunning, loadDossiers]);

  // ── Auto-refresh while running ─────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(() => {
        loadStatus();
      }, 10000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [isRunning, loadStatus]);

  // ── Trigger pipeline ───────────────────────────────────────────────────
  const handleRun = async () => {
    setActionMsg('');
    setActionError('');
    const { data, error } = await triggerPipeline();
    if (error) {
      setActionError(error);
    } else {
      setActionMsg(data?.message ?? 'Pipeline started');
      setIsRunning(true);
      // Refresh status after short delay
      setTimeout(() => loadStatus(), 2000);
    }
  };

  // ── Retry failed run ───────────────────────────────────────────────────
  const handleRetry = async (failedRunId: string) => {
    setActionMsg('');
    setActionError('');
    const { data, error } = await retryPipeline(failedRunId);
    if (error) {
      setActionError(error);
    } else {
      setActionMsg(data?.message ?? 'Retry started');
      setIsRunning(true);
      setTimeout(() => loadStatus(), 2000);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
          Pipeline
        </h1>
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '48px 32px',
          textAlign: 'center',
          marginTop: '24px',
        }}>
          <div style={spinnerStyle} />
          <p style={{ color: theme.colors.textMuted, margin: '16px 0 0' }}>Loading pipeline status...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
            Pipeline
          </h1>
          <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: 0 }}>
            Score all active 401(k) funds across four factors.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={isRunning}
          style={{
            padding: '10px 20px',
            background: isRunning ? theme.colors.border : theme.colors.accentBlue,
            border: 'none',
            borderRadius: theme.radii.md,
            color: theme.colors.white,
            fontSize: '14px',
            fontWeight: 500,
            fontFamily: theme.fonts.body,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          {isRunning ? 'Pipeline Running...' : 'Run Pipeline Now'}
        </button>
      </div>

      {/* Feedback messages */}
      {actionError && (
        <div style={{
          background: `${theme.colors.error}15`,
          border: `1px solid ${theme.colors.error}40`,
          borderRadius: theme.radii.md,
          padding: '10px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.colors.error,
        }}>
          {actionError}
        </div>
      )}
      {actionMsg && (
        <div style={{
          background: `${theme.colors.success}15`,
          border: `1px solid ${theme.colors.success}40`,
          borderRadius: theme.radii.md,
          padding: '10px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.colors.success,
        }}>
          {actionMsg}
        </div>
      )}

      {/* Latest Run Stats */}
      {latestRun && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <StatCard label="Status" value={latestRun.status} color={
            latestRun.status === 'completed' ? theme.colors.success :
            latestRun.status === 'running' ? theme.colors.warning :
            theme.colors.error
          } />
          <StatCard label="Funds Scored" value={`${latestRun.funds_succeeded}/${latestRun.funds_processed}`} />
          <StatCard label="Holdings" value={latestRun.total_holdings.toLocaleString()} />
          <StatCard label="Duration" value={fmtDuration(latestRun.duration_ms)} />
          {latestRun.funds_failed > 0 && (
            <StatCard label="Failed" value={latestRun.funds_failed} color={theme.colors.error} />
          )}
        </div>
      )}

      {/* Run History */}
      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        marginBottom: '24px',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: theme.colors.text,
          }}>
            Run History
          </span>
          <span style={{
            fontSize: '12px',
            color: theme.colors.textDim,
          }}>
            {recentRuns.length} run{recentRuns.length !== 1 ? 's' : ''}
          </span>
        </div>

        {recentRuns.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: theme.colors.textDim,
            fontSize: '14px',
          }}>
            No pipeline runs yet. Click "Run Pipeline Now" to score your funds.
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 100px 80px 100px 100px',
              gap: '12px',
              padding: '10px 20px',
              borderBottom: `1px solid ${theme.colors.border}`,
              fontSize: '11px',
              fontWeight: 600,
              color: theme.colors.textDim,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <span />
              <span>Started</span>
              <span>Funds</span>
              <span>Holdings</span>
              <span>Duration</span>
              <span />
            </div>

            {/* Table rows */}
            {recentRuns.map((run) => (
              <div
                key={run.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 100px 80px 100px 100px',
                  gap: '12px',
                  padding: '12px 20px',
                  borderBottom: `1px solid ${theme.colors.border}`,
                  alignItems: 'center',
                  fontSize: '13px',
                  color: theme.colors.textMuted,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = theme.colors.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <StatusDot status={run.status} />
                <span>{fmtDateTime(run.started_at)}</span>
                <span style={{ fontFamily: theme.fonts.mono }}>
                  <span style={{ color: theme.colors.success }}>{run.funds_succeeded}</span>
                  {run.funds_failed > 0 && (
                    <span style={{ color: theme.colors.error }}>/{run.funds_failed}f</span>
                  )}
                  <span style={{ color: theme.colors.textDim }}>/{run.funds_processed}</span>
                </span>
                <span style={{ fontFamily: theme.fonts.mono }}>
                  {run.total_holdings.toLocaleString()}
                </span>
                <span style={{ fontFamily: theme.fonts.mono }}>
                  {fmtDuration(run.duration_ms)}
                </span>
                <span>
                  {run.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(run.id)}
                      disabled={isRunning}
                      style={{
                        padding: '4px 12px',
                        background: 'transparent',
                        border: `1px solid ${theme.colors.error}60`,
                        borderRadius: theme.radii.sm,
                        color: theme.colors.error,
                        fontSize: '12px',
                        fontWeight: 500,
                        fontFamily: theme.fonts.body,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        opacity: isRunning ? 0.5 : 1,
                      }}
                    >
                      Retry
                    </button>
                  )}
                  {run.status === 'running' && (
                    <span style={{
                      fontSize: '12px',
                      color: theme.colors.warning,
                      fontFamily: theme.fonts.mono,
                    }}>
                      running...
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error details for latest failed run */}
      {latestRun?.status === 'failed' && latestRun.error_message && (
        <div style={{
          background: `${theme.colors.error}10`,
          border: `1px solid ${theme.colors.error}30`,
          borderRadius: theme.radii.lg,
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.colors.error,
            marginBottom: '8px',
          }}>
            Last Run Error
          </div>
          <div style={{
            fontSize: '13px',
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.mono,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}>
            {latestRun.error_message}
          </div>
        </div>
      )}

      {/* System Health */}
      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: healthStatus === 'healthy'
              ? theme.colors.success
              : healthStatus === 'degraded'
                ? theme.colors.warning
                : healthIssues.length > 0
                  ? theme.colors.error
                  : theme.colors.textDim,
          }} />
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: theme.colors.text,
          }}>
            System Health
          </span>
          {healthStatus && (
            <span style={{
              fontSize: '12px',
              fontFamily: theme.fonts.mono,
              color: theme.colors.textDim,
              textTransform: 'capitalize',
            }}>
              {healthStatus}
            </span>
          )}
        </div>

        <div style={{ padding: '16px 20px' }}>
          {healthIssues.length === 0 ? (
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: theme.colors.textMuted,
            }}>
              All systems operational. No issues detected.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {healthIssues.map((issue, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  fontSize: '13px',
                  color: theme.colors.warning,
                }}>
                  <span style={{
                    marginTop: '2px',
                    flexShrink: 0,
                    fontSize: '14px',
                  }}>
                    ⚠
                  </span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Fund Data Quality — Dossier scorecard (A3 Task 5) ═══════════════ */}
      {dossiers.length > 0 && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          overflow: 'hidden',
          marginTop: '24px',
        }}>
          <div style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${theme.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text }}>
              Fund Data Quality
            </span>
            <span style={{ fontSize: '12px', color: theme.colors.textDim }}>
              {dossiers.filter(d => d.passes_gate).length}/{dossiers.length} pass the 90/95 gate
              {dossierRunAt ? ` · run ${fmtDateTime(dossierRunAt)}` : ''}
            </span>
          </div>

          {/* Header row — A4 Task 6: "Resolvable" shows how much of the
              examined NAV is structurally resolvable; "Resolved" is the v2
              graded number (% of resolvable NAV resolved, threshold 90) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 90px 90px 90px 90px 80px 80px',
            gap: '10px',
            padding: '10px 20px',
            borderBottom: `1px solid ${theme.colors.border}`,
            fontSize: '11px',
            fontWeight: 600,
            color: theme.colors.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            <span>Fund</span>
            <span>Gate</span>
            <span style={{ textAlign: 'right' }}>Resolvable</span>
            <span style={{ textAlign: 'right' }}>Resolved</span>
            <span style={{ textAlign: 'right' }}>Classified</span>
            <span style={{ textAlign: 'right' }}>Holdings</span>
            <span style={{ textAlign: 'right' }}>Fallbacks</span>
            <span style={{ textAlign: 'right' }}>Scaled</span>
          </div>

          {dossiers.map(d => {
            const ticker = d.funds?.ticker || d.fund_id.slice(0, 8);
            const gateColor = d.is_money_market
              ? theme.colors.textDim
              : d.passes_gate ? theme.colors.success : theme.colors.error;
            const gateLabel = d.is_money_market
              ? 'MM — special case'
              : d.passes_gate ? 'PASS' : 'FAIL';
            // A4 Task 6: v2 rows grade % of RESOLVABLE NAV resolved; v1
            // rows (before the migration/deploy) fall back to the old number
            const isV2 = d.version >= 2;
            const resolvedShown = isV2
              ? Number(d.resolved_of_resolvable_pct ?? 0)
              : Number(d.nav_resolved_pct);
            // Visible v2 detail: what was excluded and why (Principle 1)
            const v2Notes: string[] = [];
            if (isV2 && Number(d.unresolvable_weight_pct ?? 0) > 0) {
              v2Notes.push(`${Number(d.unresolvable_weight_pct).toFixed(1)}% structurally unresolvable (bullion, cash/repo, derivatives, no identifier)`);
            }
            if (isV2 && Number(d.short_overlay_weight_pct ?? 0) !== 0) {
              v2Notes.push(`${Number(d.short_overlay_weight_pct).toFixed(1)}% net short/overlay legs (excluded from ratios)`);
            }
            if (isV2 && Number(d.momentum_firewalled_weight_pct ?? 0) > 0) {
              v2Notes.push(`${Number(d.momentum_firewalled_weight_pct).toFixed(1)}% liquidity-firewalled (classification only)`);
            }
            if (isV2 && (Number(d.industry_fmp_pct ?? 0) > 0 || Number(d.industry_haiku_pct ?? 0) > 0)) {
              v2Notes.push(`industry tags: FMP ${Number(d.industry_fmp_pct ?? 0).toFixed(0)}% · Haiku ${Number(d.industry_haiku_pct ?? 0).toFixed(0)}% · none ${Number(d.industry_none_pct ?? 0).toFixed(0)}%`);
            }
            return (
              <div key={d.id} style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1fr 90px 90px 90px 90px 80px 80px',
                  gap: '10px',
                  padding: '10px 20px',
                  alignItems: 'center',
                  fontSize: '13px',
                }}>
                  <span style={{
                    fontFamily: theme.fonts.mono, fontWeight: 700,
                    color: theme.colors.accentBlue,
                  }}>{ticker}</span>
                  <span style={{
                    justifySelf: 'start',
                    padding: '2px 10px', borderRadius: 4,
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                    color: gateColor, background: `${gateColor}18`,
                    border: `1px solid ${gateColor}40`,
                  }}>{gateLabel}</span>
                  <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
                    {d.is_money_market || !isV2 ? '—' : `${Number(d.resolvable_pct ?? 0).toFixed(1)}%`}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
                    {d.is_money_market ? '—' : `${resolvedShown.toFixed(1)}%`}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
                    {d.is_money_market ? '—' : `${Number(d.classified_pct).toFixed(1)}%`}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
                    {d.is_money_market ? '—' : `${d.holdings_included}/${d.holdings_total}`}
                  </span>
                  <span style={{
                    textAlign: 'right', fontFamily: theme.fonts.mono,
                    color: d.fallback_count > 0 ? theme.colors.warning : theme.colors.textMuted,
                  }}>{d.fallback_count}</span>
                  <span style={{
                    textAlign: 'right', fontFamily: theme.fonts.mono,
                    color: d.coverage_scaling_applied ? theme.colors.warning : theme.colors.textMuted,
                  }}>{d.coverage_scaling_applied ? 'yes' : 'no'}</span>
                </div>
                {/* v2 detail line: excluded slices, shown not hidden */}
                {v2Notes.length > 0 && (
                  <div style={{
                    padding: '0 20px 10px 100px',
                    fontSize: '12px',
                    color: theme.colors.textDim,
                    lineHeight: 1.5,
                  }}>
                    {v2Notes.join(' · ')}
                  </div>
                )}
                {/* Failure reasons, plain English, under the row */}
                {!d.passes_gate && d.fail_reasons.length > 0 && (
                  <div style={{
                    padding: '0 20px 10px 100px',
                    fontSize: '12px',
                    color: theme.colors.error,
                    lineHeight: 1.5,
                  }}>
                    {d.fail_reasons.join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────

const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: `3px solid ${theme.colors.border}`,
  borderTopColor: theme.colors.accentBlue,
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto',
};
