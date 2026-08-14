/**
 * FundLens v6 — App Router
 *
 * Top-level component that wires together:
 *   - ErrorBoundary (catches render errors with fallback UI)
 *   - AuthProvider (session management)
 *   - React Router (page navigation)
 *   - TierRouter (B3): routes each account by its server-enforced tier
 *   - ProtectedRoute (auth guard, full tier — untouched by B3 and by U1)
 *   - Shell (U1-A): ONE shell for every account, modules by entitlement
 *
 * Route structure:
 *   /login            — public, magic link + 6-digit code auth
 *   /auth/callback    — Supabase redirect handler
 *   everything else   — TierRouter decides:
 *     reference tier  → Funds (index) | /mymix | /help; every other path
 *                       redirects to home
 *     full tier       → the same Funds and My Mix as the shared base, plus
 *                       the modules that light up for the tier:
 *                       /brief /research /settings /pipeline (admin)
 *     gate-blocked    → the honest access-restricted screen (docket 3):
 *                       a 403 'Access restricted' account sees the truth on
 *                       every route, never a cheerful empty page
 *
 * U1-A notes (August 13, 2026):
 *   - Everyone lands on Funds (ruling 6). Your Brief, which was the full
 *     tier's index, moves one tab over to /brief; the legacy /briefs bookmark
 *     follows it there rather than to the new home.
 *   - The full tier's Help PAGE retires (ruling 1) in favour of the shell's
 *     global chat icon, so /help redirects home for that tier. The fenced
 *     reference Help page is untouched and stays the member surface.
 *   - Two page trees became one: the reference pages ARE the shared base now,
 *     mounted for both tiers from a single set of route declarations.
 *
 * U1-B notes (August 14, 2026):
 *   - FundLens retires. Its score/tier content re-homed into the one grid
 *     and the fund detail's Scores tab, so /fundlens now redirects to Funds
 *     — the page that does its job — for the full tier. Reference accounts
 *     reached that path through their catch-all before and still do.
 *
 * B3 notes (carried, still true):
 *   - Reference routing ignores setup_completed entirely (ruled July 27,
 *     2026: the DB trigger stays untouched, so reference profiles are born
 *     setup_completed=false — ProtectedRoute would bounce them into the
 *     wizard, which is why the reference tree never mounts ProtectedRoute).
 *   - The full-tier tree is still wrapped in ProtectedRoute; its own profile
 *     fetch and setup redirect behave exactly as before.
 *
 * Destination: client/src/App.tsx
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { SetupWizard } from './pages/SetupWizard';
import { AuthCallback } from './pages/AuthCallback';
import { YourBrief } from './pages/YourBrief';
import { Research } from './pages/Research';
import { Settings } from './pages/Settings';
import { Pipeline } from './pages/Pipeline';
import { ReferenceFunds } from './pages/reference/Funds';
import { ReferenceMyMix } from './pages/reference/MyMix';
import { ReferenceHelp } from './pages/reference/Help';
import { deriveCapabilities } from './capabilities';
import { fetchProfile, isAccessRestricted, type UserProfile } from './api';
import { theme } from './theme';

// ─── Shared loading spinner ────────────────────────────────────────────────

function CenteredSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: theme.colors.bg,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: `3px solid ${theme.colors.border}`,
          borderTopColor: theme.colors.accentBlue,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        Loading...
      </div>
    </div>
  );
}

// ─── Honest terminal screens (B3, docket 3) ────────────────────────────────

function FullScreenNotice({ title, body, email }: { title: string; body: string; email?: string | null }) {
  const { signOut } = useAuth();
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.colors.bg,
      fontFamily: theme.fonts.body,
      padding: '24px',
    }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ color: theme.colors.text, fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
          {title}
        </h2>
        <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          {body}
          {email ? <> You are signed in as <strong style={{ color: theme.colors.text }}>{email}</strong>.</> : null}
        </p>
        <button
          onClick={() => void signOut()}
          style={{
            padding: '10px 20px',
            borderRadius: theme.radii.md,
            border: `1px solid ${theme.colors.border}`,
            background: 'transparent',
            color: theme.colors.text,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Tier router (B3; one shell since U1-A) ────────────────────────────────
// One profile fetch decides the tree AND the capability set the shell renders
// from. Full-tier accounts then proceed into the protected structure
// (ProtectedRoute performs its own fetch as it always has — one small extra
// request, no behavior change).

function TierRouter() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    fetchProfile().then(({ data, error }) => {
      if (data?.profile) {
        setProfile(data.profile);
      } else {
        setProfileError(error || 'Could not load your account.');
      }
      setProfileLoading(false);
    });
  }, [user]);

  if (authLoading || (user && profileLoading)) {
    return <CenteredSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Docket 3: the domain gate's 403 gets the truth, on every route.
  if (profileError && isAccessRestricted(profileError)) {
    return (
      <FullScreenNotice
        title="Access restricted"
        body="FundLens is available to TerrAscend employees signing in with their company email (plus specifically approved accounts). This account isn't one of them. If you think that's a mistake, contact Robert."
        email={user.email}
      />
    );
  }

  if (profileError || !profile) {
    return (
      <FullScreenNotice
        title="Couldn't load your account"
        body={`Something went wrong loading your profile (${profileError || 'no profile returned'}). Try reloading the page; if it keeps happening, contact Robert.`}
        email={user.email}
      />
    );
  }

  // U1-A: entitlements derived in one place from access_tier + is_admin.
  const capabilities = deriveCapabilities(profile);

  // ── Reference tier: setup_completed deliberately ignored (B3) ──
  if (capabilities.tier === 'reference') {
    return (
      <Routes>
        <Route element={<Shell capabilities={capabilities} />}>
          <Route index element={<ReferenceFunds />} />
          <Route path="mymix" element={<ReferenceMyMix />} />
          <Route path="help" element={<ReferenceHelp />} />
        </Route>
        {/* Every full-tier path (/research, /fundlens, /settings, /pipeline,
            /setup, /brief, legacy /briefs and /thesis) and anything unknown
            lands on reference home. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // ── Full tier: the shared base plus its modules ──
  return (
    <Routes>
      {/* Setup wizard (protected, but outside the shell) */}
      <Route path="setup" element={
        <ProtectedRoute>
          <SetupWizard />
        </ProtectedRoute>
      } />

      {/* Main app (protected, inside the shell) */}
      <Route element={
        <ProtectedRoute>
          <Shell capabilities={capabilities} />
        </ProtectedRoute>
      }>
        {/* The shared base — the same pages reference accounts see */}
        <Route index element={<ReferenceFunds />} />
        <Route path="mymix" element={<ReferenceMyMix />} />

        {/* Modules that light up for this tier */}
        <Route path="brief" element={<YourBrief />} />
        <Route path="research" element={<Research />} />
        <Route path="settings" element={<Settings />} />
        <Route path="pipeline" element={<Pipeline />} />

        {/* Redirects for old bookmarked URLs */}
        <Route path="thesis" element={<Navigate to="/research" replace />} />
        <Route path="briefs" element={<Navigate to="/brief" replace />} />
        {/* U1-B: FundLens retired. Its evaluative content re-homed into the
            one grid (score/tier columns) and the fund detail (Scores tab),
            so the bookmark lands on Funds — the page that now does its job —
            rather than on the catch-all. */}
        <Route path="fundlens" element={<Navigate to="/" replace />} />
        {/* Ruling 1: the full-tier Help page retired — the chat icon in the
            shell header replaced it. */}
        <Route path="help" element={<Navigate to="/" replace />} />
      </Route>

      {/* Catch-all → redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Everything else routes by tier (B3) */}
            <Route path="/*" element={<TierRouter />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
