/**
 * FundLens v6 — Supabase Auth Client
 *
 * This is the ONLY place the Supabase JS client is used directly
 * in the React app. Everything else goes through the Express API
 * via api.ts. Magic link auth must talk to Supabase directly because
 * the auth flow involves redirects and session management.
 *
 * The auth flow:
 *   1. User enters email on Login page
 *   2. Supabase sends a magic link via Resend SMTP
 *   3. User clicks the link → Supabase redirects back with tokens
 *   4. onAuthStateChange fires → we store the session
 *   5. All subsequent API calls include the JWT in Authorization header
 *
 * Session 8 deliverable. Destination: client/src/auth.ts
 * References: Master Reference §3 (Auth), §10 (Technology).
 */

import { createClient, Session, User } from '@supabase/supabase-js';

// ─── Supabase Client ───────────────────────────────────────────────────────
// These are public keys — safe to embed in client code.
// The anon key only has access to what RLS policies allow.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Auth will not work. Check your .env file.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// ─── Auth Functions ────────────────────────────────────────────────────────

/**
 * Send a magic link to the user's email.
 *
 * Supabase sends the email via the configured SMTP provider (Resend).
 * The link redirects back to the app's callback URL.
 */
export async function signInWithMagicLink(
  email: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Where Supabase redirects after clicking the magic link
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Sign out the current user.
 * Clears the Supabase session and tokens.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Get the current session (if any).
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Get the current user (if any).
 */
export async function getUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current JWT access token.
 * Used by api.ts to attach to Authorization headers.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}
