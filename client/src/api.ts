/**
 * FundLens v6 — API Client
 *
 * Typed fetch wrapper for all Express API calls. Every request
 * includes the Supabase JWT in the Authorization header so the
 * server can identify the user.
 *
 * Pattern: React component → api.ts → Express route → supaFetch() → Supabase
 *
 * In development, Vite proxies /api/* to localhost:3000 (see vite.config.ts).
 * In production, the React build is served by Express, so /api/* resolves
 * to the same origin.
 *
 * Session 8 deliverable. Destination: client/src/api.ts
 */

import { getAccessToken } from './auth';

// ─── Types (client-side mirrors of server types) ───────────────────────────

export interface Fund {
  id: string;
  ticker: string;
  name: string;
  cik: string;
  series_id: string;
  expense_ratio: number | null;
  is_active: boolean;
}

export interface FundScore {
  id: string;
  fund_id: string;
  pipeline_run_id: string;
  cost_efficiency: number;
  holdings_quality: number;
  positioning: number;
  momentum: number;
  /** Z-scores per factor (pre-computed server-side for client rescore, §2.1) */
  z_cost_efficiency: number;
  z_holdings_quality: number;
  z_positioning: number;
  z_momentum: number;
  composite_default: number;
  /** Tier label from MAD-based modified z-score (§6.3) */
  tier: string;
  /** Tier badge color hex (§6.3) */
  tier_color: string;
  factor_details: Record<string, unknown>;
  scored_at: string;
  funds?: { ticker: string; name: string; expense_ratio: number | null };
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  weight_cost: number;
  weight_quality: number;
  weight_positioning: number;
  weight_momentum: number;
  risk_tolerance: number;
  setup_completed: boolean;
  selected_fund_ids: string[];
  last_brief_sent_at: string | null;
  briefs_enabled: boolean;
}

export interface PipelineRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  funds_processed: number;
  funds_succeeded: number;
  funds_failed: number;
  total_holdings: number;
  duration_ms: number | null;
}

export interface Brief {
  id: string;
  title: string;
  content_md?: string;
  /** Full data packet used to generate this brief (includes user.riskTolerance) */
  data_packet?: Record<string, unknown>;
  status: 'generated' | 'sent' | 'failed';
  generated_at: string;
  model_used: string;
}

// ─── Core Fetch ────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * Authenticated fetch to the Express API.
 *
 * Automatically attaches the Supabase JWT. Returns a typed
 * { data, error } result — never throws.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = await getAccessToken();

    if (!token) {
      return { data: null, error: 'Not authenticated' };
    }

    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      return { data: null, error: json.error || `HTTP ${res.status}` };
    }

    return { data: json as T, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { data: null, error: msg };
  }
}

// ─── API Methods ───────────────────────────────────────────────────────────

// Funds
export const fetchFunds = () =>
  apiFetch<{ funds: Fund[] }>('/api/funds');

export const fetchFund = (ticker: string) =>
  apiFetch<{ fund: Fund }>(`/api/funds/${ticker}`);

// Scores
export const fetchScores = () =>
  apiFetch<{ scores: FundScore[]; pipelineRun: PipelineRun | null }>('/api/scores');

export const fetchFundScore = (ticker: string) =>
  apiFetch<{ fund: Fund; score: FundScore; holdings: unknown[] }>(`/api/scores/${ticker}`);

// Profile
export const fetchProfile = () =>
  apiFetch<{ profile: UserProfile }>('/api/profile');

export const updateProfile = (updates: Partial<UserProfile>) =>
  apiFetch<{ profile: UserProfile }>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

export const completeSetup = (data: {
  weights: { costEfficiency: number; holdingsQuality: number; positioning: number; momentum: number };
  riskTolerance: number;
  selectedFundIds: string[];
}) =>
  apiFetch<{ profile: UserProfile; message: string }>('/api/profile/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Pipeline
export const fetchPipelineStatus = () =>
  apiFetch<{ latestRun: PipelineRun | null; isRunning: boolean; recentRuns: PipelineRun[] }>(
    '/api/pipeline/status'
  );

export const triggerPipeline = () =>
  apiFetch<{ message: string; runId: string }>('/api/pipeline/run', { method: 'POST' });

export const retryPipeline = (failedRunId: string) =>
  apiFetch<{ message: string; newRunId: string }>('/api/pipeline/retry', {
    method: 'POST',
    body: JSON.stringify({ failedRunId }),
  });

export const abortPipeline = (runId: string) =>
  apiFetch<{ message: string }>('/api/pipeline/abort', {
    method: 'POST',
    body: JSON.stringify({ runId }),
  });

// Briefs
export const fetchBriefs = () =>
  apiFetch<{ briefs: Brief[] }>('/api/briefs');

export const fetchBrief = (id: string) =>
  apiFetch<{ brief: Brief }>(`/api/briefs/${id}`);

export const generateBrief = (sendEmail = false) =>
  apiFetch<{ message: string }>(`/api/briefs/generate?sendEmail=${sendEmail}`, {
    method: 'POST',
  });

// Thesis
export interface ThesisData {
  id: string;
  narrative: string;
  sector_preferences: Array<{
    sector: string;
    score: number;
    reasoning?: string;
    preference?: string;
  }>;
  dominant_theme: string;
  macro_stance: string;
  key_themes?: string[];
  risk_factors?: string[];
  generated_at: string;
}

export const fetchThesis = () =>
  apiFetch<{ thesis: ThesisData }>('/api/thesis/latest');

// Monitoring
export const fetchSystemHealth = () =>
  apiFetch<{ status: string; issues: string[] }>('/api/monitor/health');

// Help Agent
export interface HelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const helpChat = (message: string, history?: HelpMessage[]) =>
  apiFetch<{ reply: string }>('/api/help/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
