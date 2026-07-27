/**
 * FundLens v6 — Login Page
 *
 * Magic link authentication. User enters their email, receives a
 * login link from Supabase (sent via Resend SMTP), clicks it, and
 * gets redirected back to the app with a valid session.
 *
 * No passwords. No sign-up form. The on_auth_user_created trigger
 * in Supabase auto-creates a user_profiles row on first login.
 *
 * Session 8 deliverable. Destination: client/src/pages/Login.tsx
 * References: Master Reference §3 (Auth), §10 (Technology).
 */

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { verifyEmailCode } from '../auth';
import { theme } from '../theme';

export function Login() {
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // B3 (docket 1): the 6-digit code path — the scanner-proof factor.
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [codeError, setCodeError] = useState('');

  // Already logged in → go to app
  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus('sending');
    setErrorMsg('');

    const { success, error } = await signIn(email.trim());

    if (success) {
      setStatus('sent');
      setCode('');
      setCodeStatus('idle');
      setCodeError('');
    } else {
      setStatus('error');
      // B3: with self-signup open (shouldCreateUser: true), the old
      // "unknown email" refusal no longer occurs at send time — access is
      // decided server-side after sign-in. Whatever error arrives here is
      // a real delivery/service problem, shown as such.
      setErrorMsg(error || 'Something went wrong. Try again.');
    }
  };

  // B3 (docket 1): a typed code signs in even when the emailed link was
  // already detonated by a corporate mail scanner.
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setCodeStatus('verifying');
    setCodeError('');

    const { success, error } = await verifyEmailCode(email.trim(), trimmed);

    if (!success) {
      setCodeStatus('error');
      const raw = (error || '').toLowerCase();
      if (raw.includes('expired') || raw.includes('invalid')) {
        setCodeError('That code didn’t work — it may have expired or been mistyped. Request a new email and try the fresh code.');
      } else {
        setCodeError(error || 'Could not verify the code. Try again.');
      }
    }
    // On success, onAuthStateChange sets the user and the redirect above
    // leaves this page — no state update needed here.
  };

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
      <div style={{
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: theme.radii.lg,
            background: theme.colors.accentBlue,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '22px',
            color: '#fff',
            marginBottom: '16px',
          }}>
            FL
          </div>
          <h1 style={{
            color: theme.colors.text,
            fontSize: '24px',
            fontWeight: 600,
            margin: '0 0 8px',
          }}>
            FundLens
          </h1>
          <p style={{
            color: theme.colors.textMuted,
            fontSize: '14px',
            margin: '0 0 6px',
          }}>
            401(k) fund information for TerrAscend
          </p>
          {/* B3 (docket 7): who this is for, stated up front and visibly —
              access is decided by company email, not at this form. */}
          <p style={{
            color: theme.colors.text,
            fontSize: '13px',
            fontWeight: 500,
            margin: 0,
          }}>
            For TerrAscend employees — sign in with your{' '}
            <strong>@terrascend.com</strong> email.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '32px',
        }}>
          {status === 'sent' ? (
            /* ── Check your email: code entry first (scanner-proof), link second ── */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '40px',
                marginBottom: '16px',
              }}>
                ✉
              </div>
              <h2 style={{
                color: theme.colors.text,
                fontSize: '18px',
                fontWeight: 600,
                margin: '0 0 8px',
              }}>
                Check your email
              </h2>
              <p style={{
                color: theme.colors.textMuted,
                fontSize: '14px',
                margin: '0 0 16px',
                lineHeight: 1.5,
              }}>
                We sent a 6-digit code and a sign-in link to{' '}
                <strong style={{ color: theme.colors.text }}>{email}</strong>.
                Type the code below — or click the link.
              </p>

              <form onSubmit={handleVerifyCode} style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: theme.colors.bg,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radii.md,
                    color: theme.colors.text,
                    fontSize: '18px',
                    fontFamily: theme.fonts.mono,
                    textAlign: 'center',
                    letterSpacing: '0.3em',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: '12px',
                  }}
                />
                {codeStatus === 'error' && (
                  <p style={{
                    color: theme.colors.error,
                    fontSize: '13px',
                    margin: '0 0 12px',
                    textAlign: 'left',
                  }}>
                    {codeError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={codeStatus === 'verifying' || code.trim().length < 6}
                  style={{
                    ...buttonBase,
                    background: theme.colors.accentBlue,
                    color: '#fff',
                    opacity: (codeStatus === 'verifying' || code.trim().length < 6) ? 0.6 : 1,
                    cursor: (codeStatus === 'verifying' || code.trim().length < 6) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {codeStatus === 'verifying' ? 'Verifying...' : 'Sign in with code'}
                </button>
              </form>

              <p style={{
                color: theme.colors.textDim,
                fontSize: '12px',
                margin: '0 0 16px',
                lineHeight: 1.5,
              }}>
                On a work computer? Email security tools sometimes use up
                sign-in links before you can click them — the code always
                works.
              </p>

              <button
                onClick={() => { setStatus('idle'); setEmail(''); setCode(''); setCodeStatus('idle'); setCodeError(''); }}
                style={{
                  ...buttonBase,
                  background: 'transparent',
                  color: theme.colors.accentBlue,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* ── Email form ── */
            <form onSubmit={handleSubmit}>
              <label style={{
                display: 'block',
                color: theme.colors.textMuted,
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '6px',
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@terrascend.com"
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: theme.colors.bg,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radii.md,
                  color: theme.colors.text,
                  fontSize: '14px',
                  fontFamily: theme.fonts.body,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                }}
              />

              {status === 'error' && (
                <p style={{
                  color: theme.colors.error,
                  fontSize: '13px',
                  margin: '0 0 12px',
                }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                style={{
                  ...buttonBase,
                  background: theme.colors.accentBlue,
                  color: '#fff',
                  opacity: (status === 'sending' || !email.trim()) ? 0.6 : 1,
                  cursor: (status === 'sending' || !email.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'sending' ? 'Sending...' : 'Send sign-in link'}
              </button>
            </form>
          )}
        </div>

        <p style={{
          textAlign: 'center',
          color: theme.colors.textDim,
          fontSize: '12px',
          marginTop: '24px',
        }}>
          No password needed. We&apos;ll email you a 6-digit code and a
          sign-in link — either one signs you in.
        </p>
      </div>
    </div>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────

const buttonBase: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: theme.radii.md,
  border: 'none',
  fontSize: '14px',
  fontWeight: 500,
  fontFamily: theme.fonts.body,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};
