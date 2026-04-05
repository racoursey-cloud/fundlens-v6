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
 * In-memory cache for Supabase JWKS (JSON Web Key Set).
 * Keys are fetched once and cached for 1 hour to avoid hitting
 * Supabase on every request.
 */
let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface JsonWebKey {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
  // HS256 fallback
  k?: string;
}

/**
 * Fetch the JWKS (JSON Web Key Set) from Supabase.
 * Endpoint: {SUPABASE_URL}/auth/v1/.well-known/jwks.json
 * Caches keys for 1 hour to minimize network calls.
 */
async function fetchJwks(): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (jwksCache && (now - jwksCache.fetchedAt) < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('[auth] SUPABASE_URL not set — cannot fetch JWKS');
    return [];
  }

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!resp.ok) {
      console.error(`[auth] JWKS fetch failed: ${resp.status} ${resp.statusText}`);
      return jwksCache?.keys ?? [];
    }
    const data = await resp.json() as { keys: JsonWebKey[] };
    jwksCache = { keys: data.keys, fetchedAt: now };
    console.log(`[auth] JWKS fetched: ${data.keys.length} key(s), alg(s): ${data.keys.map(k => k.alg || k.kty).join(', ')}`);
    return data.keys;
  } catch (err) {
    console.error('[auth] JWKS fetch error:', err);
    return jwksCache?.keys ?? [];
  }
}

/**
 * Verify JWT signature using Supabase's published keys.
 *
 * Supabase can sign JWTs with either:
 *   - ES256 (ECDSA with P-256 and SHA-256) — newer projects
 *   - HS256 (HMAC-SHA256) — legacy projects
 *
 * This function detects the algorithm from the token header and verifies
 * accordingly. For ES256, it fetches the public key from Supabase's JWKS
 * endpoint. For HS256, it uses the SUPABASE_JWT_SECRET env var.
 *
 * Uses Node's built-in crypto — no external dependencies.
 */
async function verifyJwtSignature(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode the header to determine the algorithm
    const header = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf-8')
    ) as { alg: string; kid?: string; typ?: string };

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signatureBytes = Buffer.from(parts[2], 'base64url');

    if (header.alg === 'ES256') {
      return await verifyES256(signatureInput, signatureBytes, header.kid);
    } else if (header.alg === 'HS256') {
      return verifyHS256(signatureInput, signatureBytes);
    } else {
      console.error(`[auth] Unsupported JWT algorithm: ${header.alg}`);
      return false;
    }
  } catch (err) {
    console.error('[auth] JWT signature verification error:', err);
    return false;
  }
}

/**
 * Verify an ES256 (ECDSA P-256 + SHA-256) JWT signature.
 * Fetches the matching public key from Supabase's JWKS endpoint.
 */
async function verifyES256(
  signatureInput: string,
  signatureBytes: Buffer,
  kid?: string
): Promise<boolean> {
  const crypto = await import('crypto');
  const keys = await fetchJwks();

  // Find the key matching the token's kid (key ID)
  const jwk = kid
    ? keys.find(k => k.kid === kid)
    : keys.find(k => k.kty === 'EC' && k.crv === 'P-256');

  if (!jwk || !jwk.x || !jwk.y) {
    console.error(`[auth] No matching EC key found in JWKS for kid: ${kid}`);
    return false;
  }

  // Import the JWK as a Node.js KeyObject
  const keyObject = crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    },
    format: 'jwk',
  });

  // ES256 JWT signatures use raw R||S format (64 bytes for P-256).
  // Node's crypto.verify expects DER-encoded ECDSA signatures.
  // Convert raw R||S to DER.
  const derSignature = rawToDer(signatureBytes);

  return crypto.verify(
    'sha256',
    Buffer.from(signatureInput, 'utf-8'),
    { key: keyObject, dsaEncoding: 'der' },
    derSignature
  );
}

/**
 * Convert a raw ECDSA signature (R||S, 64 bytes for P-256) to DER format.
 * JWTs use raw format; Node's crypto.verify expects DER.
 */
function rawToDer(raw: Buffer): Buffer {
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32, 64);

  // DER encoding: each integer is prefixed with 0x00 if high bit is set
  const rDer = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), r]) : r;
  const sDer = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), s]) : s;

  // Strip leading zeros (but keep at least one byte)
  const rTrimmed = trimLeadingZeros(rDer);
  const sTrimmed = trimLeadingZeros(sDer);

  const rLen = rTrimmed.length;
  const sLen = sTrimmed.length;
  const totalLen = 2 + rLen + 2 + sLen;

  return Buffer.from([
    0x30, totalLen,          // SEQUENCE
    0x02, rLen, ...rTrimmed, // INTEGER r
    0x02, sLen, ...sTrimmed, // INTEGER s
  ]);
}

/** Trim leading zero bytes from a DER integer, preserving sign byte. */
function trimLeadingZeros(buf: Buffer): Buffer {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0x00 && !(buf[i + 1] & 0x80)) {
    i++;
  }
  return buf.subarray(i);
}

/**
 * Verify an HS256 (HMAC-SHA256) JWT signature.
 * Uses the SUPABASE_JWT_SECRET env var as the HMAC key.
 * Performs timing-safe comparison to prevent timing attacks.
 */
function verifyHS256(signatureInput: string, signatureBytes: Buffer): boolean {
  const crypto = require('crypto') as typeof import('crypto');
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.warn('[auth] SUPABASE_JWT_SECRET not set — cannot verify HS256');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret.trim())
    .update(signatureInput)
    .digest();

  if (expected.length !== signatureBytes.length) return false;
  return crypto.timingSafeEqual(expected, signatureBytes);
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
