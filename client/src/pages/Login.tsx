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
import { theme } from '../theme';

export function Login() {
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
    } else {
      setStatus('error');
      setErrorMsg(error || 'Something went wrong. Try again.');
    }
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
            margin: 0,
          }}>
            401(k) fund scoring for TerrAscend
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
            /* ── Check your email ── */
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
                margin: '0 0 24px',
                lineHeight: 1.5,
              }}>
                We sent a sign-in link to <strong style={{ color: theme.colors.text }}>{email}</strong>.
                Click the link in the email to sign in.
              </p>
              <button
                onClick={() => { setStatus('idle'); setEmail(''); }}
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
          No password needed. We&apos;ll email you a secure sign-in link.
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
