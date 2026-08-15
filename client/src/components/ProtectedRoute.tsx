/**
 * FundLens v6 — Protected Route
 *
 * Wraps pages that require authentication. If the user is not logged in,
 * redirects to /login. If still loading auth state, shows a spinner.
 *
 * Also checks setup_completed — if the user hasn't finished the wizard,
 * redirects to /setup (except when already on /setup).
 *
 * Session 8 deliverable. Destination: client/src/components/ProtectedRoute.tsx
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  // M1 m9: the setup_completed check reads the one profile the provider
  // fetched. This component used to ask for the same row a second time.
  const { profile, loading: profileLoading } = useProfile();

  // Still determining auth state
  if (authLoading || profileLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-body)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          Loading...
        </div>
      </div>
    );
  }

  // Not logged in → send to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but hasn't completed setup → send to wizard
  // (unless already on /setup)
  if (profile && !profile.setup_completed && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
