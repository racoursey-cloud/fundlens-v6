/**
 * FundLens v6 — Auth Callback Page
 *
 * Supabase redirects here after the user clicks a magic link. On success
 * the JS client picks the tokens out of the URL hash, the session lands,
 * and we forward into the app.
 *
 * B3 (docket 2 + 6): the eternal spinner is now impossible.
 *   - Failure arrives as a URL hash like
 *     #error=access_denied&error_code=otp_expired&error_description=…
 *     (reproduced live twice at S-B2: corporate mail scanners detonate
 *     links in transit, so the human's click finds the link already used
 *     or expired). That hash now renders a plain-English error with the
 *     code fallback spelled out, instead of spinning forever.
 *   - Even with no error hash, if no session arrives within a timeout
 *     (observed on a TerrAscend workstation: verification succeeded but
 *     the browser never held the session), we say so and offer the way
 *     back — never an indefinite spinner.
 *
 * Session 8 deliverable; reworked in B3.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

/** How long the spinner may live without a session before we give up */
const NO_SESSION_TIMEOUT_MS = 10_000;

/** Parse Supabase's error fields out of the URL hash, if present */
function parseHashError(hash: string): { code: string | null; description: string | null } | null {
  if (!hash || !hash.includes('error')) return null;
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const error = params.get('error');
  if (!error) return null;
  return {
    code: params.get('error_code'),
    description: params.get('error_description'),
  };
}

export function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // Read the hash once on mount — Supabase's client may clean the URL after.
  const hashError = useMemo(() => parseHashError(window.location.hash), []);

  useEffect(() => {
    if (!loading && user) {
      // Session established — go to the app
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  // Docket 6: no error, but no session either — stop spinning eventually.
  useEffect(() => {
    if (hashError) return;
    const timer = setTimeout(() => setTimedOut(true), NO_SESSION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hashError]);

  if (hashError || (timedOut && !user)) {
    const isExpired =
      hashError?.code === 'otp_expired' ||
      (hashError?.description ?? '').toLowerCase().includes('expired');

    return (
      <div style={containerStyle}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ color: theme.colors.text, fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
            {hashError ? 'That sign-in link didn’t work' : 'We couldn’t finish signing you in'}
          </h2>
          <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
            {hashError
              ? isExpired
                ? 'The link has expired or was already used. On work computers, email security tools often use up sign-in links before you can click them.'
                : hashError.description || 'The sign-in link could not be verified.'
              : 'The sign-in didn’t complete in this browser. This can happen on managed work computers.'}
          </p>
          <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            Use the <strong style={{ color: theme.colors.text }}>6-digit code</strong> from
            the same email instead — or request a new one.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            style={{
              padding: '10px 20px',
              borderRadius: theme.radii.md,
              border: 'none',
              background: theme.colors.accentBlue,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
            }}
          >
            Back to sign-in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
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
        Signing you in...
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: theme.colors.bg,
  color: theme.colors.textMuted,
  fontFamily: theme.fonts.body,
  padding: '24px',
};
