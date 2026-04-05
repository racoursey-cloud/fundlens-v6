/**
 * FundLens v6 — Supabase Client (supaFetch)
 *
 * All Supabase data access routes through this module.
 * Uses the PostgREST API with the service_role key on the server side.
 *
 * The React client NEVER talks to Supabase directly (except for magic link
 * auth). Instead, client requests go through Express API routes, which use
 * this module to query Supabase on the user's behalf.
 *
 * Pattern:
 *   React client → Express route → supaFetch() → Supabase PostgREST
 *
 * Why service_role?
 *   The service_role key bypasses Row Level Security (RLS). Since our
 *   Express server IS the access control layer (it validates the user's
 *   JWT and only returns data they should see), we don't rely on RLS
 *   for primary security. RLS policies exist as defense-in-depth.
 *
 * Session 5 deliverable. References: Master Reference §3, §8, §10.
 * Destination: src/services/supabase.ts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Options for a supaFetch call */
interface SupaFetchOptions {
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** PostgREST query parameters (e.g. { select: '*', ticker: 'eq.VFIAX' }) */
  params?: Record<string, string>;
  /** Request body for POST/PATCH (will be JSON-serialized) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /**
   * If true, expect a single row (adds Accept: application/vnd.pgrst.object+json).
   * PostgREST returns a single object instead of an array.
   */
  single?: boolean;
  /**
   * If true, return the inserted/updated row(s) (adds Prefer: return=representation).
   * Without this, POST/PATCH return empty 201/204.
   */
  returning?: boolean;
  /**
   * If true, use upsert behavior (adds Prefer: resolution=merge-duplicates).
   * Requires a unique constraint on the target columns.
   */
  upsert?: boolean;
}

/** Result from a supaFetch call */
interface SupaFetchResult<T> {
  data: T | null;
  error: string | null;
  status: number;
  /** Total count if requested via Prefer: count=exact */
  count: number | null;
}

// ─── Environment ────────────────────────────────────────────────────────────

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL environment variable is not set');
  return url.replace(/\/$/, ''); // strip trailing slash
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY environment variable is not set');
  return key;
}

// ─── Core supaFetch ─────────────────────────────────────────────────────────

/**
 * Make a request to the Supabase PostgREST API.
 *
 * This is the ONLY way engine and API code should talk to Supabase.
 * All calls use the service_role key (bypasses RLS).
 *
 * @param table The Supabase table name (e.g. 'funds', 'holdings_cache')
 * @param options Request options
 *
 * @example
 * // Fetch all active funds
 * const { data, error } = await supaFetch<FundRow[]>('funds', {
 *   params: { is_active: 'eq.true', select: '*' },
 * });
 *
 * @example
 * // Insert a new fund
 * const { data, error } = await supaFetch<FundRow>('funds', {
 *   method: 'POST',
 *   body: { ticker: 'VFIAX', name: 'Vanguard 500 Index Fund' },
 *   returning: true,
 *   single: true,
 * });
 *
 * @example
 * // Upsert scores (insert or update on conflict)
 * const { data, error } = await supaFetch<FundScoresRow[]>('fund_scores', {
 *   method: 'POST',
 *   body: scoresArray,
 *   upsert: true,
 *   returning: true,
 * });
 */
export async function supaFetch<T = unknown>(
  table: string,
  options: SupaFetchOptions = {}
): Promise<SupaFetchResult<T>> {
  const { method = 'GET', params, body, headers: extraHeaders, single, returning, upsert } = options;

  const baseUrl = getSupabaseUrl();
  const serviceKey = getServiceKey();

  // Build URL with query parameters
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  // Build headers
  const headers: Record<string, string> = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  // Prefer header components
  const preferParts: string[] = [];

  if (single) {
    headers['Accept'] = 'application/vnd.pgrst.object+json';
  }

  if (returning) {
    preferParts.push('return=representation');
  }

  if (upsert) {
    preferParts.push('resolution=merge-duplicates');
  }

  if (preferParts.length > 0) {
    headers['Prefer'] = preferParts.join(', ');
  }

  // Make the request
  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Parse count from Content-Range header if present
    let count: number | null = null;
    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) count = parseInt(match[1], 10);
    }

    // Handle non-2xx responses
    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json() as { message?: string; details?: string; hint?: string };
        errorMessage = errorBody.message || errorBody.details || `HTTP ${response.status}`;
        if (errorBody.hint) errorMessage += ` (hint: ${errorBody.hint})`;
      } catch {
        errorMessage = `HTTP ${response.status} ${response.statusText}`;
      }

      console.error(`[supaFetch] ${method} ${table} failed: ${errorMessage}`);
      return { data: null, error: errorMessage, status: response.status, count };
    }

    // Handle empty responses (204 No Content from DELETE, or POST without returning)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { data: null, error: null, status: response.status, count };
    }

    const data = await response.json() as T;
    return { data, error: null, status: response.status, count };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[supaFetch] ${method} ${table} network error: ${message}`);
    return { data: null, error: message, status: 0, count: null };
  }
}

// ─── Convenience Helpers ────────────────────────────────────────────────────

/**
 * Fetch rows from a table with optional filtering.
 *
 * @example
 * const funds = await supaSelect<FundRow[]>('funds', {
 *   is_active: 'eq.true',
 *   order: 'ticker.asc',
 * });
 */
export async function supaSelect<T = unknown>(
  table: string,
  filters: Record<string, string> = {},
  select: string = '*'
): Promise<SupaFetchResult<T>> {
  return supaFetch<T>(table, {
    params: { select, ...filters },
  });
}

/**
 * Insert one or more rows into a table.
 * Returns the inserted row(s).
 */
export async function supaInsert<T = unknown>(
  table: string,
  rows: unknown,
  options: { single?: boolean; upsert?: boolean } = {}
): Promise<SupaFetchResult<T>> {
  return supaFetch<T>(table, {
    method: 'POST',
    body: rows,
    returning: true,
    single: options.single,
    upsert: options.upsert,
  });
}

/**
 * Update rows matching a filter.
 * Returns the updated row(s).
 *
 * @example
 * await supaUpdate('funds', { is_active: false }, { ticker: 'eq.OLDTICKER' });
 */
export async function supaUpdate<T = unknown>(
  table: string,
  updates: Record<string, unknown>,
  filters: Record<string, string>
): Promise<SupaFetchResult<T>> {
  return supaFetch<T>(table, {
    method: 'PATCH',
    body: updates,
    params: filters,
    returning: true,
  });
}

/**
 * Delete rows matching a filter.
 *
 * @example
 * await supaDelete('holdings_cache', { fund_id: 'eq.some-uuid' });
 */
export async function supaDelete(
  table: string,
  filters: Record<string, string>
): Promise<SupaFetchResult<null>> {
  return supaFetch<null>(table, {
    method: 'DELETE',
    params: filters,
  });
}

// ─── Supabase Auth Client (Magic Link Only) ────────────────────────────────
// The Supabase JS client is ONLY used for magic link auth on the React client.
// It is NOT used for data access — all data goes through supaFetch().
//
// The client-side auth setup will be in src/lib/supabase-auth.ts (Session 8).
// This file is server-side only.

export default supaFetch;
