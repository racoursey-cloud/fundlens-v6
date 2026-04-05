/**
 * FundLens v6 — Auth Callback Page
 *
 * Supabase redirects here after the user clicks a magic link.
 * The Supabase JS client automatically picks up the tokens from
 * the URL hash and establishes the session. We just need to wait
 * for onAuthStateChange to fire, then redirect to the app.
 *
 * Session 8 deliverable. Destination: client/src/pages/AuthCallback.tsx
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

export function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      // Session established — go to the app
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
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
        Signing you in...
      </div>
    </div>
  );
}
