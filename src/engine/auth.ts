/**
 * FundLens v6 — Auth Middleware
 *
 * Validates Supabase JWTs on incoming Express requests.
 *
 * How it works:
 *   1. User logs in via magic link (handled by Supabase JS client)
 *   2. Supabase gives the browser a JWT (JSON Web Token — a signed
 *      string that proves who the user is)
 *   3. The React client sends this JWT in the Authorization header
 *      on every API request
 *   4. This middleware checks the JWT is valid and not expired
 *   5. If valid, it attaches the user's ID to the request so route
 *      handlers know who's asking
 *
 * Session 5 deliverable. Destination: src/middleware/auth.ts
 */

import { Request, Response, NextFunction } from 'express';

// ─── Types ──────────────────────────────────────────────────────────────────

/** JWT payload from Supabase (the data inside the token) */
interface SupabaseJwtPayload {
  /** Subject — the user's UUID (same as auth.users.id and user_profiles.id) */
  sub: string;
  /** Email address */
  email?: string;
  /** Role (usually "authenticated" for logged-in users) */
  role?: string;
  /** Issued at (Unix timestamp) */
  iat?: number;
  /** Expires at (Unix timestamp) */
  exp?: number;
  /** Audience */
  aud?: string;
}

/** Extends Express Request with the authenticated user's info */
export interface AuthenticatedRequest extends Request {
  /** The authenticated user's UUID (from Supabase auth) */
  userId: string;
  /** The authenticated user's email */
  userEmail: string | null;
  /** Full decoded JWT payload */
  jwtPayload: SupabaseJwtPayload;
}

// ─── JWT Validation ─────────────────────────────────────────────────────────

/**
 * Decode and validate a Supabase JWT.
 *
 * Supabase JWTs are standard JWTs signed with the project's JWT secret.
 * We verify the signature using the SUPABASE_JWT_SECRET env var.
 *
 * For FundLens, we use a lightweight approach: decode the JWT, verify
 * the expiration, and trust Supabase's signature. The alternative
 * (importing jsonwebtoken or jose) adds a dependency — fine if needed
 * later, but this works for our ~200 user base.
 *
 * SECURITY NOTE: In production, you should verify the JWT signature
 * using the JWT secret from Supabase. For now, we validate structure
 * and expiration. The service_role key on our Supabase calls means
 * even if someone forges a JWT, they can only see data our Express
 * routes explicitly return.
 */
function decodeJwt(token: string): SupabaseJwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode the payload (middle part)
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    ) as SupabaseJwtPayload;

    // Validate required fields
    if (!payload.sub) return null;

    // Check expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) return null; // Token expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify JWT signature using Supabase JWT secret.
 * Uses Node's built-in crypto for HMAC-SHA256 verification.
 */
/**
 * Normalize a base64url string for comparison.
 * JWT signatures use base64url encoding (RFC 4648 §5) with no padding.
 * Node's digest('base64url') may or may not include trailing '=' depending
 * on version. Strip padding and normalize +/ vs -_ to ensure consistent
 * comparison regardless of source.
 */
function normalizeBase64url(str: string): string {
  return str
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Verify JWT signature using Supabase JWT secret.
 *
 * Supabase signs JWTs with HS256 (HMAC-SHA256). The JWT secret from
 * the Supabase dashboard is a raw string used directly as the HMAC key.
 *
 * Uses Node's built-in crypto — no external dependencies. Performs
 * timing-safe comparison to prevent timing attacks.
 */
async function verifyJwtSignature(token: string): Promise<boolean> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.warn('[auth] SUPABASE_JWT_SECRET not set — skipping signature verification');
    return true;
  }

  try {
    const { createHmac, timingSafeEqual } = await import('crypto');
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const tokenSignature = normalizeBase64url(parts[2]);

    // Supabase JWT secret is a raw UTF-8 string (not base64-encoded)
    const computed = normalizeBase64url(
      createHmac('sha256', secret.trim())
        .update(signatureInput)
        .digest('base64url')
    );

    // Timing-safe comparison requires equal-length buffers
    const a = Buffer.from(computed, 'utf-8');
    const b = Buffer.from(tokenSignature, 'utf-8');
    if (a.length !== b.length) {
      // Length mismatch — try with base64-decoded secret as fallback.
      // Some Supabase configurations use base64-encoded JWT secrets.
      const computedB64 = normalizeBase64url(
        createHmac('sha256', Buffer.from(secret.trim(), 'base64'))
          .update(signatureInput)
          .digest('base64url')
      );
      const c = Buffer.from(computedB64, 'utf-8');
      if (c.length !== b.length) return false;
      return timingSafeEqual(c, b);
    }

    return timingSafeEqual(a, b);
  } catch (err) {
    console.error('[auth] JWT signature verification error:', err);
    return false;
  }
}

// ─── Express Middleware ─────────────────────────────────────────────────────

/**
 * Require authentication on an Express route.
 *
 * Usage in route files:
 *
 *   import { requireAuth, AuthenticatedRequest } from './auth.js';
 *
 *   router.get('/api/profile', requireAuth, (req, res) => {
 *     const authedReq = req as AuthenticatedRequest;
 *     // authedReq.userId is the authenticated user's UUID
 *   });
 *
 * Returns 401 if:
 *   - No Authorization header
 *   - Token is malformed
 *   - Token is expired
 *   - Signature verification fails (if JWT secret is configured)
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  // Extract token from "Bearer <token>"
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  // Decode and validate
  const payload = decodeJwt(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Verify signature
  const signatureValid = await verifyJwtSignature(token);
  if (!signatureValid) {
    console.error(
      '[auth] Signature verification failed for user %s. ' +
      'JWT_SECRET length: %d, token header: %s',
      payload.sub,
      (process.env.SUPABASE_JWT_SECRET || '').length,
      token.split('.')[0]
    );
    res.status(401).json({ error: 'Invalid token signature' });
    return;
  }

  // Attach user info to request
  (req as AuthenticatedRequest).userId = payload.sub;
  (req as AuthenticatedRequest).userEmail = payload.email || null;
  (req as AuthenticatedRequest).jwtPayload = payload;

  next();
}

/**
 * Optional authentication — doesn't reject unauthenticated requests,
 * but still decodes the JWT if present. Useful for routes that behave
 * differently for logged-in vs anonymous users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const payload = decodeJwt(token);
    if (payload) {
      const signatureValid = await verifyJwtSignature(token);
      if (signatureValid) {
        (req as AuthenticatedRequest).userId = payload.sub;
        (req as AuthenticatedRequest).userEmail = payload.email || null;
        (req as AuthenticatedRequest).jwtPayload = payload;
      }
    }
  }

  next();
}
