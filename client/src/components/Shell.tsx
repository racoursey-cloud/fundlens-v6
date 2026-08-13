/**
 * FundLens — The Shell (U1 wave A)
 *
 * ONE shell for every account. Replaces AppShell (full tier) and
 * ReferenceShell (reference tier), which drifted apart page tree by page
 * tree — the bug class U1 exists to end. Nothing here asks "which tier is
 * this?" beyond the derived capability set handed in as a prop
 * (client/src/capabilities.ts); the shell renders modules, and entitlement
 * decides which modules exist.
 *
 * What each capability lights up:
 *   tabs             — the nav list, desktop bar and mobile bottom bar
 *   dataFreshness    — the LIVE / SEED DATA badge and the one status read
 *                      that sets it (full tier, admin or not — unchanged
 *                      from AppShell)
 *   pipelineControls — Refresh Analysis, its progress polling, and the run
 *                      overlay (admin). With both flags off this shell makes
 *                      ZERO /api/pipeline/* calls, which is the property B3
 *                      gave the reference shell and this merge preserves.
 *   globalChat       — the header chat icon and its modal (U1 ruling 1)
 *   referenceTag     — the "Reference" wordmark tag
 *   disclaimerFooter — the B3 educational/not-advice footer
 *
 * Carried forward verbatim from AppShell, because each line is a ruling:
 *   - UI Honesty item 1: the header's Refresh button stands down on the
 *     Pipeline tab, which has its own trigger.
 *   - UI Honesty item 2: a trigger that collides with a running job adopts
 *     that job instead of flashing back to idle.
 *   - UI Honesty item 3: "Stopping…" holds until the server confirms the run
 *     actually ended, and the badge reflects how the run ended — a cancelled
 *     or failed run never flashes LIVE. No browser-close abort beacon.
 *   - UI Honesty item 4 / the triggerConfirmedRef guard: React 18 can flush
 *     renders at await boundaries, so the poll must not trust a "not running"
 *     answer until the trigger POST has confirmed the run row exists.
 *   - Opening the app never resumes a previous session's overlay.
 *
 * Page frames are kept as each page was built (U1-A is a shell wave, not a
 * re-layout): the shared base — Funds, My Mix, Help — keeps the reference
 * shell's centered 1100px column with the pages supplying their own padding,
 * and the full-tier-only pages keep AppShell's padded full width. Full tier
 * viewing the shared base therefore sees exactly the frame reference members
 * see, which is the point of the wave.
 *
 * Destination: client/src/components/Shell.tsx
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchPipelineStatus, triggerPipeline, abortPipeline } from '../api';
import { theme } from '../theme';
import { PipelineOverlay } from './PipelineOverlay';
import { HelpChat } from './HelpChat';
import { ReferenceFooter } from './ReferenceFooter';
import type { Capabilities } from '../capabilities';

// ─── Shared-base frame ─────────────────────────────────────────────────────
// The reference pages bring their own padding and were built for a centered
// 1100px column. Everything else was built inside AppShell's padded, full
// width main. Keying the frame to the route keeps both surfaces pixel-stable
// through a shell merge.

const SHARED_BASE_PATHS = new Set(['/', '/mymix', '/help']);

function isSharedBasePath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SHARED_BASE_PATHS.has(normalized || '/');
}

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

export function Shell({ capabilities }: { capabilities: Capabilities }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const { tabs, dataFreshness, pipelineControls, globalChat, referenceTag, disclaimerFooter } =
    capabilities;

  // U1 ruling 1: the global chat lives in the shell, not on a page — one
  // affordance reachable from every module it is entitled to.
  const [chatOpen, setChatOpen] = useState(false);

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
  //
  // U1-A: gated on the capability, not merely hidden. An account without the
  // badge issues no /api/pipeline/* request at all.
  useEffect(() => {
    if (!dataFreshness) return;
    fetchPipelineStatus().then(res => {
      if (res.data) {
        if (res.data.latestRun?.status === 'completed') {
          setSource('live');
        }
        // Intentionally NOT setting isRunning here — opening the app
        // should never show a mid-progress overlay from a previous session
      }
    });
  }, [dataFreshness]);

  // Poll while running — every 2s (first poll delayed until trigger confirmed)
  useEffect(() => {
    if (!pipelineControls) return;
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
  }, [isRunning, pipelineControls]);

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

  const sharedBaseFrame = isSharedBasePath(location.pathname);
  // Space for the fixed mobile tab bar, matching AppShell's 72px
  const mobileBarClearance = isMobile ? 72 : 0;

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
        .fl-icon-btn:hover {
          color: #e4e4e7 !important;
          border-color: #32363e !important;
        }
      `}</style>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
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

        {/* Reference wordmark tag (carried from ReferenceShell) */}
        {referenceTag && (
          <span style={{
            color: theme.colors.textMuted, fontSize: 12, fontWeight: 500,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            flexShrink: 0, marginLeft: -8,
          }}>
            Reference
          </span>
        )}

        {/* Source badge */}
        {dataFreshness && (
          <div style={{ flexShrink: 0 }}>
            <SourceBadge source={source} />
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Refresh Analysis button (A5 Task 4: admin-only; UI Honesty
            item 1: hidden on the Pipeline tab — that page has its own) */}
        {!isMobile && pipelineControls && !onPipelineTab && (
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

        {/* U1 ruling 1: the global chat affordance — small icon, top-right,
            opens a modal. Full/admin only; a reference account has no such
            control anywhere in the app. */}
        {globalChat && (
          <button
            className="fl-icon-btn"
            onClick={() => setChatOpen(true)}
            aria-label="Open FundLens chat"
            title="Ask FundLens"
            style={{
              width: 34, height: 34, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              color: theme.colors.textMuted,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              padding: 0,
            }}
          >
            {/* Speech bubble */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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

        {/* Sign out (carried from ReferenceShell — every account gets one) */}
        <button
          onClick={() => void signOut()}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            color: theme.colors.textMuted,
            fontSize: 12,
            fontFamily: theme.fonts.body,
            padding: '6px 12px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Sign out
        </button>
      </header>

      {/* ═══ TAB BAR (desktop — uppercase, blue underline) ═════════════════ */}
      {!isMobile && (
        <div style={{
          background: theme.colors.bg,
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex', gap: 0,
          padding: '0 20px', flexShrink: 0,
        }}>
          {tabs.map(({ path, label, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className="fl-tab-btn"
              style={({ isActive }) => ({
                padding: '0 16px', height: 40,
                display: 'flex', alignItems: 'center',
                fontSize: 12, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                fontFamily: theme.fonts.body, textDecoration: 'none',
                color: isActive ? '#f9fafb' : '#6b7280',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {/* ═══ CONTENT AREA ═════════════════════════════════════════════════ */}
      <main
        style={
          sharedBaseFrame
            ? {
                flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto',
                // The footer, where there is one, carries the clearance instead
                paddingBottom: disclaimerFooter ? 0 : mobileBarClearance,
              }
            : {
                flex: 1, overflowY: 'auto',
                background: theme.colors.bg,
                padding: isMobile ? '16px' : '32px',
                paddingBottom: isMobile ? '72px' : '32px',
              }
        }
      >
        <Outlet />
      </main>

      {/* The wrapper keeps the last line of the disclaimer clear of the mobile
          tab bar; the footer file itself holds legal copy and is not styled
          from here. */}
      {disclaimerFooter && (
        <div style={{ paddingBottom: mobileBarClearance }}>
          <ReferenceFooter />
        </div>
      )}

      {/* ═══ MOBILE BOTTOM TAB BAR ════════════════════════════════════════ */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 56, background: theme.colors.surface,
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          zIndex: 100,
        }}>
          {tabs.map(({ path, label, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              style={({ isActive }) => ({
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 2, flex: 1, height: '100%',
                textDecoration: 'none',
                color: isActive ? theme.colors.accentBlue : theme.colors.textMuted,
                transition: 'color 0.15s',
              })}
            >
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      )}

      {/* ═══ PIPELINE OVERLAY (admin module) ══════════════════════════════ */}
      {pipelineControls && (
        <PipelineOverlay
          isRunning={isRunning}
          currentStep={currentStep}
          stepMessage={stepMessage}
          onStop={handleStopAnalysis}
          stopping={stopping}
        />
      )}

      {/* ═══ GLOBAL CHAT MODAL (U1 ruling 1) ══════════════════════════════ */}
      {globalChat && chatOpen && <HelpChat onClose={() => setChatOpen(false)} />}
    </div>
  );
}
