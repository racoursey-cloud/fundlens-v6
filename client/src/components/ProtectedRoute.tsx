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

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchProfile, type UserProfile } from '../api';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }

    fetchProfile().then(({ data }) => {
      if (data?.profile) {
        setProfile(data.profile);
      }
      setProfileLoading(false);
    });
  }, [user]);

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
