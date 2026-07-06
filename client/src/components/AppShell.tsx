/**
 * FundLens v6 — App Shell
 *
 * Ported from v5.1's AppShell.jsx layout:
 *   - Sticky header: logo, source badge, "Refresh Analysis" button, user name
 *   - Horizontal tab bar below header (uppercase, blue underline active state)
 *   - Full-width content area
 *   - Mobile: bottom tab bar, header collapses
 *
 * Navigation (4 tabs):
 *   Portfolio | Thesis | Brief | Settings
 *
 * Session 11/12. Destination: client/src/components/AppShell.tsx
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchPipelineStatus, triggerPipeline, abortPipeline, fetchProfile } from '../api';
import { theme } from '../theme';
import { PipelineOverlay } from './PipelineOverlay';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { path: '/',          label: 'Your Brief' },
  { path: '/fundlens',  label: 'FundLens' },
  { path: '/research',  label: 'Research' },
  { path: '/settings',  label: 'Settings' },
  { path: '/help',      label: 'Help' },
];

// A5 Task 4: the Pipeline tab exists only for admin accounts — the cockpit
// stops being findable-by-accident-only.
const ADMIN_TABS = [
  ...TABS,
  { path: '/pipeline', label: 'Pipeline' },
];

// ─── Source badge (v5.1 pattern) ──────────────────────────────────────────────

type SourceState = 'live' | 'analyzing' | 'seed';

function SourceBadge({ source }: { source: SourceState }) {
  if (source === 'live') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontFamily: theme.fonts.body,
        background: 'rgba(5,150,105,0.15)', color: '#10b981',
        border: '1px solid rgba(5,150,105,0.35)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#10b981', display: 'inline-block',
        }} />
        LIVE
      </span>
    );
  }

  if (source === 'analyzing') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontFamily: theme.fonts.body,
        background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
        border: '1px solid rgba(59,130,246,0.35)',
      }}>
        <span style={{
          width: 12, height: 12,
          border: '2px solid rgba(59,130,246,0.35)',
          borderTopColor: '#3b82f6', borderRadius: '50%',
          display: 'inline-block',
          animation: 'fl-spin 0.75s linear infinite',
          flexShrink: 0,
        }} />
        ANALYZING…
      </span>
    );
  }

  // seed
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', fontFamily: theme.fonts.body,
      background: 'rgba(107,114,128,0.15)', color: '#9ca3af',
      border: '1px solid rgba(107,114,128,0.30)',
    }}>
      SEED DATA
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Pipeline / source state
  const [source, setSource] = useState<SourceState>('seed');
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // UI Honesty item 3: true between clicking Stop and the server confirming
  // the run actually ended — the overlay shows "Stopping…" instead of
  // pretending the run vanished
  const [stopping, setStopping] = useState(false);

  // UI Honesty item 1: on the Pipeline tab, the page's own trigger is the
  // one to use — the header button stands down (presentation only)
  const onPipelineTab = location.pathname.startsWith('/pipeline');

  // A5 Task 4: admin accounts see the Pipeline tab and the Refresh Analysis
  // button; everyone else sees neither (the run endpoint already 403s them —
  // the button was dead UI for non-admins).
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchProfile().then(res => {
      if (res.data?.profile?.is_admin === true) setIsAdmin(true);
    });
  }, []);

  // Guard: prevents the poll from closing the overlay before the trigger
  // POST has completed and the DB row exists. React 18 can flush renders
  // at await boundaries, causing the poll useEffect to fire before
  // triggerPipeline() returns. The ref is updated synchronously so the
  // poll can check it without render-cycle delays.
  const triggerConfirmedRef = useRef(false);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    'User';

  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Check pipeline status on mount — set source badge but NEVER resume
  // a running pipeline overlay. The overlay only shows for runs started
  // in THIS browser session (via handleRefreshAnalysis).
  useEffect(() => {
    fetchPipelineStatus().then(res => {
      if (res.data) {
        if (res.data.latestRun?.status === 'completed') {
          setSource('live');
        }
        // Intentionally NOT setting isRunning here — opening the app
        // should never show a mid-progress overlay from a previous session
      }
    });
  }, []);

  // Poll while running — every 2s (first poll delayed until trigger confirmed)
  useEffect(() => {
    if (!isRunning) return;
    const poll = async () => {
      // Don't trust "not running" from the DB until the trigger POST has
      // completed and confirmed the run record exists. Without this guard,
      // React 18's render-at-await can fire this poll before the POST
      // returns, getting a false negative that kills the overlay.
      const res = await fetchPipelineStatus();
      if (res.data) {
        if (!res.data.isRunning) {
          if (triggerConfirmedRef.current) {
            // Trigger completed AND DB says not running → genuinely done.
            // UI Honesty item 3: the badge reflects how the run actually
            // ended — 'live' only if it completed (a cancelled or failed
            // run must not flash LIVE).
            setSource(res.data.latestRun?.status === 'completed' ? 'live' : 'seed');
            setIsRunning(false);
            setStopping(false);
            setCurrentStep(null);
            setStepMessage(null);
            setActiveRunId(null);
          }
          // else: trigger still in flight — ignore the false negative
        } else {
          if (res.data.currentStep != null) setCurrentStep(res.data.currentStep);
          if (res.data.stepMessage != null) setStepMessage(res.data.stepMessage);
        }
      }
    };
    poll(); // immediate first poll (guarded by triggerConfirmedRef)
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // UI Honesty item 3 (Robert's July 6 ruling): the browser-close abort
  // beacon is gone. It existed to prevent stale 'running' rows — the
  // heartbeat + stale-run sweep now handle that properly, and a run is a
  // server job: closing the tab should not kill it. Cancel is explicit,
  // via the Stop button here or the Pipeline tab's Cancel.

  const handleStopAnalysis = useCallback(async () => {
    // Request cancellation; the server honors it at the run's next
    // checkpoint. The overlay stays up in its "Stopping…" state until the
    // poll confirms the run actually ended — closing it early would lie.
    setStopping(true);
    if (activeRunId) {
      await abortPipeline(activeRunId).catch(() => {});
    }
  }, [activeRunId]);

  const handleRefreshAnalysis = async () => {
    triggerConfirmedRef.current = false; // reset guard — trigger in flight
    setIsRunning(true);
    setSource('analyzing');
    setCurrentStep(null);
    setStepMessage(null);
    const res = await triggerPipeline();
    if (res.error) {
      // UI Honesty item 2: before resetting (the old "flash"), check
      // whether the error was a collision with a run that is already going
      // — if so, adopt that run: show its real progress, let Stop cancel it.
      const status = await fetchPipelineStatus();
      if (status.data?.isRunning && status.data.latestRun) {
        setActiveRunId(status.data.latestRun.id);
        triggerConfirmedRef.current = true; // run row exists — poll can trust status
      } else {
        setIsRunning(false);
        setSource('seed');
        setActiveRunId(null);
        triggerConfirmedRef.current = false;
      }
    } else if (res.data) {
      setActiveRunId(res.data.runId);
      triggerConfirmedRef.current = true; // DB row confirmed — poll can now trust status
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.colors.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: theme.fonts.body,
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes fl-spin {
          to { transform: rotate(360deg); }
        }
        .fl-tab-btn {
          background: none;
          border: none;
          cursor: pointer;
          outline: none;
          text-decoration: none;
        }
        .fl-tab-btn:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
          border-radius: 2px;
        }
        .fl-run-btn:hover:not(:disabled) {
          background: #2563eb !important;
        }
        .fl-run-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* ═══ HEADER (v5.1 pattern) ════════════════════════════════════════ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 56, background: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 16, flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          fontSize: 18, fontWeight: 700,
          letterSpacing: '-0.01em', flexShrink: 0, userSelect: 'none',
        }}>
          <span style={{ color: '#f9fafb' }}>Fund</span>
          <span style={{ color: '#3b82f6' }}>Lens</span>
        </div>

        {/* Source badge */}
        <div style={{ flexShrink: 0 }}>
          <SourceBadge source={source} />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Refresh Analysis button (A5 Task 4: admin-only; UI Honesty
            item 1: hidden on the Pipeline tab — that page has its own) */}
        {!isMobile && isAdmin && !onPipelineTab && (
          <button
            className="fl-run-btn"
            disabled={isRunning}
            onClick={handleRefreshAnalysis}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '0 18px', height: 34,
              background: '#3b82f6', color: '#fff',
              fontFamily: theme.fonts.body, fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              transition: 'background 0.15s', flexShrink: 0,
              letterSpacing: '0.01em',
            }}
          >
            {isRunning && (
              <span style={{
                width: 13, height: 13,
                border: '2px solid rgba(255,255,255,0.35)',
                borderTopColor: '#fff', borderRadius: '50%',
                display: 'inline-block',
                animation: 'fl-spin 0.75s linear infinite',
                flexShrink: 0,
              }} />
            )}
            {isRunning ? 'Analyzing…' : 'Refresh Analysis'}
          </button>
        )}

        {/* User identity */}
        <div style={{
          fontSize: 12, color: '#6b7280', fontFamily: theme.fonts.body,
          flexShrink: 0, maxWidth: 160,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName}
        </div>
      </header>

      {/* ═══ TAB BAR (v5.1 pattern — horizontal, uppercase, blue underline) ═══ */}
      {!isMobile && (
        <div style={{
          background: theme.colors.bg,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex', gap: 0,
          padding: '0 20px', flexShrink: 0,
        }}>
          {(isAdmin ? ADMIN_TABS : TABS).map(({ path, label }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);
            return (
              <NavLink
                key={path}
                to={path}
                className="fl-tab-btn"
                style={{
                  padding: '0 16px', height: 40,
                  display: 'flex', alignItems: 'center',
                  fontSize: 12, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  fontFamily: theme.fonts.body, textDecoration: 'none',
                  color: isActive ? '#f9fafb' : '#6b7280',
                  borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 0.15s',
                }}
              >
                {label}
              </NavLink>
            );
          })}
        </div>
      )}

      {/* ═══ CONTENT AREA ═════════════════════════════════════════════════ */}
      <main style={{
        flex: 1, overflowY: 'auto',
        background: theme.colors.bg,
        padding: isMobile ? '16px' : '32px',
        paddingBottom: isMobile ? '72px' : '32px',
      }}>
        <Outlet />
      </main>

      {/* ═══ MOBILE BOTTOM TAB BAR ════════════════════════════════════════ */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 56, background: theme.colors.surface,
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          zIndex: 100,
        }}>
          {(isAdmin ? ADMIN_TABS : TABS).map(({ path, label }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);
            return (
              <NavLink
                key={path}
                to={path}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, flex: 1, height: '100%',
                  textDecoration: 'none',
                  color: isActive ? theme.colors.accentBlue : theme.colors.textMuted,
                  transition: 'color 0.15s',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {/* ═══ PIPELINE OVERLAY (v5.1 pattern) ══════════════════════════ */}
      <PipelineOverlay isRunning={isRunning} currentStep={currentStep} stepMessage={stepMessage} onStop={handleStopAnalysis} stopping={stopping} />

    </div>
  );
}
