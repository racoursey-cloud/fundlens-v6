/**
 * FundLens — Profile Context (M1 m9)
 *
 * ONE /api/profile request per page load, for every account and every tab.
 *
 * Before this, three independent callers each asked for the same row on
 * every load — TierRouter to decide the tier, ProtectedRoute to check
 * setup_completed, and then whichever page had mounted, for weights, risk,
 * or the admin flag. Three identical requests, three copies of one truth,
 * and no way for them to disagree usefully. This is the one place that asks.
 *
 * WHY ITS OWN CONTEXT, not a field on AuthContext (ruled August 15, 2026):
 * identity and entitlement are different concerns. AuthContext answers "who
 * is signed in"; this answers "what may they see". Entitlement is the U1
 * spine — the capability set every tab list, column and module derives from
 * — and it deserves a home of its own rather than a lodger's room in
 * whichever context happened to exist first.
 *
 * The fetch is keyed to the signed-in user: no user, no request, so the
 * login and callback routes stay silent. `error` is surfaced rather than
 * swallowed because TierRouter reads it to tell a domain-gated visitor the
 * truth instead of a generic failure.
 *
 * WRITES: this holds a cached row, so a page that changes the profile
 * pushes the new row back with `setProfile`. That is what keeps the cache
 * honest — before, every page refetched on mount and got fresh values by
 * accident of the duplication this removes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { fetchProfile, type UserProfile } from '../api';

interface ProfileContextValue {
  /** The row, or null while loading and when the load failed */
  profile: UserProfile | null;
  /** True until the one request settles. False immediately when signed out. */
  loading: boolean;
  /** The message as sent, so callers can read it (TierRouter checks the
   *  domain gate's 403 against it). Null when the load succeeded. */
  error: string | null;
  /** Replace the cached row after a successful write */
  setProfile: (profile: UserProfile) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfileState(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProfile().then(({ data, error: err }) => {
      if (cancelled) return;
      if (data?.profile) {
        setProfileState(data.profile);
      } else {
        setError(err || 'Could not load your account.');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, error, setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}
