/**
 * FundLens v6 — Pipeline Page
 *
 * Full monitoring UI for the scoring pipeline. Shows run history,
 * system health, and controls for triggering/retrying runs.
 *
 * Features:
 *   - "Refresh Analysis" button with status indicator (v8 A0 item 2: one
 *     label across both trigger points — header and this tab)
 *   - Pipeline run history with status, duration, fund counts
 *   - Auto-refresh while pipeline is running (10s polling)
 *   - "Retry Failed" button for failed runs
 *   - System health section
 *
 * Session 10 deliverable. Destination: client/src/pages/Pipeline.tsx
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import {
  fetchPipelineStatus,
  triggerPipeline,
  retryPipeline,
  abortPipeline,
  fetchSystemHealth,
  fetchLatestDossiers,
  fetchProfile,
  runClassificationBenchmark,
  getBenchmarkStatus,
  type PipelineRun,
  type FundDossierRow,
  type BenchmarkRunStatus,
} from '../api';
import { theme } from '../theme';

// ─── Status Dot ────────────────────────────────────────────────────────────

// UI Honesty item 3: a run recorded as failed with this exact message was a
// deliberate stop, not a crash — every surface on this page renders it as
// "cancelled" (neutral), never as an error.
function isCancelledRun(run: PipelineRun | null | undefined): boolean {
  return run?.status === 'failed' && run?.error_message === 'Cancelled by user';
}

function StatusDot({ status, cancelled }: { status: PipelineRun['status']; cancelled?: boolean }) {
  const color =
    cancelled ? theme.colors.textDim :
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

/** Coarse "Xm ago" for the active-run card (UI Honesty item 4) */
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'under a minute ago';
  const min = Math.round(ms / 60_000);
  return `${min} minute${min === 1 ? '' : 's'} ago`;
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
  // A5 Task 4: admin gate — non-admin accounts get a clean redirect home.
  // null = still checking; false = redirect; true = render the cockpit.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    fetchProfile().then(res => {
      setIsAdmin(res.data?.profile?.is_admin === true);
    });
  }, []);

  const [latestRun, setLatestRun] = useState<PipelineRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<PipelineRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // UI Honesty item 4: live-run detail — step data exists only for runs
  // triggered from the web (the nightly reports none; the card says so)
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [totalSteps, setTotalSteps] = useState<number | null>(null);
  // UI Honesty item 3: local echo of a just-clicked Cancel, merged with the
  // server's cancel stamp so a cancel requested from ANY surface shows here
  const [cancelClicked, setCancelClicked] = useState(false);
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
      setCurrentStep(data.currentStep);
      setStepMessage(data.stepMessage);
      setTotalSteps(data.totalSteps);
      if (!data.isRunning) setCancelClicked(false);
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

  // ── v8 A0 (Gap 4): benchmark visibility ────────────────────────────────
  // Completion used to exist only as an email; now the tab shows running
  // state and the last outcome, polled while a benchmark is in flight.
  const [benchStatus, setBenchStatus] = useState<BenchmarkRunStatus | null>(null);
  const benchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBenchStatus = useCallback(async () => {
    const { data } = await getBenchmarkStatus();
    if (data) setBenchStatus(data);
  }, []);

  useEffect(() => {
    if (benchStatus?.running) {
      benchPollRef.current = setInterval(() => {
        loadBenchStatus();
      }, 10000);
    } else if (benchPollRef.current) {
      clearInterval(benchPollRef.current);
      benchPollRef.current = null;
    }
    return () => {
      if (benchPollRef.current) {
        clearInterval(benchPollRef.current);
      }
    };
  }, [benchStatus?.running, loadBenchStatus]);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    loadStatus();
    loadHealth();
    loadBenchStatus();
  }, [loadStatus, loadHealth, loadBenchStatus]);

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

  // ── A5 Task 7 (temporary): trigger the classification benchmark ────────
  const handleBenchmark = async () => {
    setActionMsg('');
    setActionError('');
    const { data, error } = await runClassificationBenchmark();
    if (error) {
      setActionError(error);
    } else {
      setActionMsg(data?.message ?? 'Benchmark started');
      // Pick up the running state promptly; the poll takes over from there
      setTimeout(() => loadBenchStatus(), 1000);
    }
  };

  // ── UI Honesty item 3: cancel the active run, whoever started it ───────
  const handleCancel = async () => {
    if (!latestRun || latestRun.status !== 'running') return;
    setActionMsg('');
    setActionError('');
    setCancelClicked(true);
    const { data, error } = await abortPipeline(latestRun.id);
    if (error) {
      // Most likely the run finished in the meantime — the next poll shows
      // the truth either way
      setActionError(error);
      setCancelClicked(false);
    } else {
      setActionMsg(data?.message ?? 'Cancel requested');
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

  // ── A5 Task 4: admin gate ──────────────────────────────────────────────
  if (isAdmin === false) {
    return <Navigate to="/" replace />;
  }
  if (isAdmin === null) {
    return null; // still checking — brief blank beats a flash of the cockpit
  }

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
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          {/* A5 Task 7 (temporary): removed once the benchmark report is filed */}
          <button
            onClick={handleBenchmark}
            disabled={isRunning}
            title="Runs ~400 FMP-labeled equities through the production classification prompts and emails the agreement report. Read-only."
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.md,
              color: theme.colors.textMuted,
              fontSize: '13px',
              fontWeight: 500,
              fontFamily: theme.fonts.body,
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.5 : 1,
            }}
          >
            Run Classification Benchmark
          </button>
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
            {isRunning ? 'Analyzing…' : 'Refresh Analysis'}
          </button>
        </div>
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

      {/* UI Honesty item 4: the active run, readable here no matter which
          surface started it — header, this tab, the nightly, or a retry */}
      {isRunning && latestRun?.status === 'running' && (() => {
        const cancelPending = cancelClicked || !!latestRun.cancel_requested_at;
        return (
          <div style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.warning}40`,
            borderRadius: theme.radii.lg,
            padding: '16px 20px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <StatusDot status="running" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text }}>
                  {cancelPending
                    ? 'Run is stopping — cancel requested'
                    : 'A run is in progress'}
                </div>
                <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginTop: '4px', lineHeight: 1.5 }}>
                  Started {fmtDateTime(latestRun.started_at)} ({fmtAgo(latestRun.started_at)})
                  {latestRun.heartbeat_at && <> · last sign of life {fmtAgo(latestRun.heartbeat_at)}</>}
                  <br />
                  {cancelPending ? (
                    <>Stops at its next checkpoint — usually under two minutes; up to ten during a first-time full scan.</>
                  ) : currentStep != null && totalSteps != null ? (
                    <>Step {currentStep}/{totalSteps}{stepMessage ? ` — ${stepMessage}` : ''}</>
                  ) : (
                    <>No step detail for this run (started by the nightly schedule or a retry) — the heartbeat above confirms it is alive.</>
                  )}
                </div>
              </div>
              <button
                onClick={handleCancel}
                disabled={cancelPending}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radii.md,
                  color: cancelPending ? theme.colors.textDim : theme.colors.textMuted,
                  fontSize: '13px',
                  fontWeight: 500,
                  fontFamily: theme.fonts.body,
                  cursor: cancelPending ? 'default' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {cancelPending ? 'Stopping…' : 'Cancel Run'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* v8 A0 (Gap 4): benchmark status — running state or last outcome */}
      {benchStatus && (benchStatus.running || benchStatus.finishedAt) && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.md,
          padding: '10px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.colors.textMuted,
        }}>
          {benchStatus.running ? (
            <>Classification benchmark running{benchStatus.startedAt ? ` since ${fmtDateTime(benchStatus.startedAt)}` : ''}…</>
          ) : (
            <>
              Last benchmark: {benchStatus.finishedAt ? fmtDateTime(benchStatus.finishedAt) : '—'} —{' '}
              <span style={{ color: benchStatus.outcome === 'success' ? theme.colors.success : theme.colors.error, fontWeight: 600 }}>
                {benchStatus.outcome === 'success' ? 'completed' : 'failed'}
              </span>
              {benchStatus.emailed === false && (
                <span style={{ color: theme.colors.error }}> · report email did not send — results are in the server log</span>
              )}
              {benchStatus.emailed === true && <span> · report emailed</span>}
              {benchStatus.outcome === 'success' && benchStatus.summary && (
                <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap', fontFamily: theme.fonts.mono, fontSize: '12px' }}>
                  {benchStatus.summary}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Latest Run Stats */}
      {latestRun && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <StatCard label="Status" value={isCancelledRun(latestRun) ? 'cancelled' : latestRun.status} color={
            isCancelledRun(latestRun) ? theme.colors.textDim :
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
            No pipeline runs yet. Click "Refresh Analysis" to score your funds.
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
                <StatusDot status={run.status} cancelled={isCancelledRun(run)} />
                <span>
                  {fmtDateTime(run.started_at)}
                  {isCancelledRun(run) && (
                    <span style={{ color: theme.colors.textDim, fontSize: '12px' }}> · cancelled by user</span>
                  )}
                </span>
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

      {/* Error details for latest failed run — a deliberate cancel is not
          an error and gets no red box (UI Honesty item 3) */}
      {latestRun?.status === 'failed' && latestRun.error_message && !isCancelledRun(latestRun) && (
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

          {/* Header row — A4 Task 6 + follow-up: the columns read left to
              right as the actual chain (Principle 1): "Examined" = % of NAV
              the cutoff walk covered; "Resolvable" = how much of that is
              structurally resolvable; "Resolved" = the v2 graded number
              (% of resolvable NAV resolved, threshold 90); "Classified". */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 90px 90px 90px 90px 90px 80px 80px',
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
            <span style={{ textAlign: 'right' }}>Examined</span>
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
                  gridTemplateColumns: '70px 1fr 90px 90px 90px 90px 90px 80px 80px',
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
                    {d.is_money_market ? '—' : `${Number(d.weight_covered_pct).toFixed(1)}%`}
                  </span>
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
