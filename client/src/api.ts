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
  /** A5 Task 4: true only for admin accounts — gates the Pipeline nav link,
   *  the Refresh Analysis button, and the /pipeline page. Optional because
   *  rows predating the a5_task4 migration lack the column. */
  is_admin?: boolean;
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
  /** v8 A0 (Gap 5): last sign of life, stamped ~every 60s while the run's
   *  process is alive. Null/absent on pre-migration rows. */
  heartbeat_at?: string | null;
  /** UI Honesty item 3: set when a cancel has been requested; the run stops
   *  at its next checkpoint and writes "Cancelled by user". */
  cancel_requested_at?: string | null;
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
// UI Honesty item 4: the type now carries the step fields the server has
// always sent (AppShell previously cast around their absence). Step data
// exists only for runs triggered via POST /api/pipeline/run — the nightly
// and retry runners report no steps, so any surface must render honestly
// without them.
export const fetchPipelineStatus = () =>
  apiFetch<{
    latestRun: PipelineRun | null;
    isRunning: boolean;
    currentStep: number | null;
    stepMessage: string | null;
    totalSteps: number | null;
    recentRuns: PipelineRun[];
  }>('/api/pipeline/status');

export const triggerPipeline = () =>
  apiFetch<{ message: string; runId: string }>('/api/pipeline/run', { method: 'POST' });

export const retryPipeline = (failedRunId: string) =>
  apiFetch<{ message: string; newRunId: string }>('/api/pipeline/retry', {
    method: 'POST',
    body: JSON.stringify({ failedRunId }),
  });

// UI Honesty item 3: requests cancellation — the run stops at its next
// checkpoint (usually under two minutes; up to ~ten on a first-time full
// scan) and records itself "Cancelled by user". Admin-only on the server.
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

// Fund Dossiers — per-fund data-quality records (A3 Task 5)
export interface FundDossierRow {
  id: string;
  fund_id: string;
  pipeline_run_id: string;
  version: number;
  accession_number: string | null;
  report_date: string | null;
  /** Whole-percent values (e.g. 92.5 = 92.5%) */
  nav_resolved_pct: number;
  classified_pct: number;
  weight_covered_pct: number;
  /** A4 Task 6 v2 metrics — undefined/0 on rows written before the
   *  a4_task6_dossier_v2 migration */
  resolvable_pct?: number;
  resolved_of_resolvable_pct?: number;
  unresolvable_weight_pct?: number;
  short_overlay_weight_pct?: number;
  momentum_firewalled_weight_pct?: number;
  industry_fmp_pct?: number;
  industry_haiku_pct?: number;
  industry_none_pct?: number;
  holdings_included: number;
  holdings_total: number;
  lookthrough_detected: boolean;
  lookthrough_subfunds: number;
  fallback_count: number;
  coverage_scaling_applied: boolean;
  quality_coverage_pct: number;
  is_money_market: boolean;
  passes_gate: boolean;
  fail_reasons: string[];
  created_at: string;
  funds?: { ticker: string; name: string };
}

export const fetchLatestDossiers = () =>
  apiFetch<{
    dossiers: FundDossierRow[];
    runId: string | null;
    completedAt: string | null;
  }>('/api/dossiers/latest');

// A5 Task 7 (temporary): admin-only classification benchmark trigger.
// The report arrives by admin email; this just kicks it off.
export const runClassificationBenchmark = () =>
  apiFetch<{ message: string }>('/api/benchmark/classification', { method: 'POST' });

// v8 A0 (Gap 4): benchmark visibility — running state and the last run's
// outcome, so completion no longer exists only as an email. (The harness
// itself is not temporary: v8 A3's Sonnet 5 acceptance gate reuses it.)
export interface BenchmarkRunStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: 'success' | 'failed' | null;
  summary: string | null;
  /** Did the report/failure email actually send? */
  emailed: boolean | null;
}

export const getBenchmarkStatus = () =>
  apiFetch<BenchmarkRunStatus>('/api/benchmark/status');

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
