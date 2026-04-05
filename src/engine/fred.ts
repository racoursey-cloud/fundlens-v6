/**
 * FundLens v6 — FRED Macro Data Integration
 *
 * Fetches key macroeconomic indicators from the Federal Reserve Economic
 * Data (FRED) API. These data points, combined with RSS headlines, give
 * Claude the factual basis for generating the macro thesis.
 *
 * Indicators tracked (from Master Reference §5):
 *   - GDP growth
 *   - Unemployment rate
 *   - CPI (inflation)
 *   - Federal funds rate
 *   - Treasury yields (2Y, 10Y, spread)
 *   - Consumer sentiment
 *   - Industrial production
 *
 * The FRED API is free with an API key. Rate limit: 120 requests/minute.
 *
 * Session 4 deliverable. References: Master Reference §5, §8 step 10.
 */

import { FRED, PIPELINE } from './constants.js';
import { delay } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single FRED data observation */
export interface FredObservation {
  date: string;
  value: number | null;
}

/** A complete macro indicator with metadata and recent values */
export interface MacroIndicator {
  /** FRED series ID (e.g. "UNRATE") */
  seriesId: string;
  /** Human-readable name */
  name: string;
  /** Most recent value */
  latestValue: number | null;
  /** Date of most recent value */
  latestDate: string | null;
  /** Previous value (for trend direction) */
  previousValue: number | null;
  /** Change from previous to latest */
  change: number | null;
  /** Direction: "up", "down", or "flat" */
  trend: 'up' | 'down' | 'flat';
  /** Unit description (e.g. "Percent", "Billions of Dollars") */
  unit: string;
}

/** Complete macro data snapshot for the thesis prompt */
export interface MacroSnapshot {
  indicators: MacroIndicator[];
  /** Derived signals for the thesis prompt */
  signals: MacroSignals;
  /** When this snapshot was assembled */
  fetchedAt: string;
}

/** High-level macro signals derived from the raw indicators */
export interface MacroSignals {
  /** Yield curve: positive = normal, negative = inverted (recession signal) */
  yieldSpread: number | null;
  /** Fed policy direction based on recent rate changes */
  fedStance: 'tightening' | 'easing' | 'holding' | 'unknown';
  /** Inflation trend */
  inflationTrend: 'rising' | 'falling' | 'stable' | 'unknown';
  /** Employment health */
  employmentHealth: 'strong' | 'weakening' | 'weak' | 'unknown';
  /** Consumer confidence direction */
  consumerConfidence: 'improving' | 'declining' | 'stable' | 'unknown';
}

// ─── Indicator Metadata ─────────────────────────────────────────────────────

const INDICATOR_META: Record<string, { name: string; unit: string }> = {
  [FRED.SERIES.GDP]: { name: 'Real GDP', unit: 'Billions of Dollars (annualized)' },
  [FRED.SERIES.UNEMPLOYMENT]: { name: 'Unemployment Rate', unit: 'Percent' },
  [FRED.SERIES.CPI]: { name: 'Consumer Price Index (All Urban)', unit: 'Index (1982-84=100)' },
  [FRED.SERIES.FED_FUNDS_RATE]: { name: 'Federal Funds Effective Rate', unit: 'Percent' },
  [FRED.SERIES.YIELD_10Y]: { name: '10-Year Treasury Yield', unit: 'Percent' },
  [FRED.SERIES.YIELD_2Y]: { name: '2-Year Treasury Yield', unit: 'Percent' },
  [FRED.SERIES.YIELD_SPREAD]: { name: '10Y-2Y Treasury Spread', unit: 'Percent' },
  [FRED.SERIES.CONSUMER_SENTIMENT]: { name: 'Consumer Sentiment (UMich)', unit: 'Index (1966=100)' },
  [FRED.SERIES.INDUSTRIAL_PRODUCTION]: { name: 'Industrial Production Index', unit: 'Index (2017=100)' },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch all macro indicators and assemble a snapshot.
 * Calls are sequential with delays to stay under FRED's rate limit.
 */
export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const seriesIds = Object.values(FRED.SERIES);
  const indicators: MacroIndicator[] = [];

  console.log(`[fred] Fetching ${seriesIds.length} macro indicators...`);

  for (let i = 0; i < seriesIds.length; i++) {
    const seriesId = seriesIds[i];
    try {
      const indicator = await fetchIndicator(seriesId);
      indicators.push(indicator);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fred] Failed to fetch ${seriesId}: ${message}`);
      // Add a placeholder so the thesis prompt knows data is missing
      const meta = INDICATOR_META[seriesId] || { name: seriesId, unit: '' };
      indicators.push({
        seriesId,
        name: meta.name,
        latestValue: null,
        latestDate: null,
        previousValue: null,
        change: null,
        trend: 'flat',
        unit: meta.unit,
      });
    }

    // Delay between calls (except after the last one)
    if (i < seriesIds.length - 1) {
      await delay(PIPELINE.API_CALL_DELAY_MS);
    }
  }

  const signals = deriveSignals(indicators);

  console.log(`[fred] Snapshot complete: ${indicators.filter(i => i.latestValue !== null).length}/${indicators.length} indicators fetched`);

  return {
    indicators,
    signals,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Format the macro snapshot for Claude's thesis prompt.
 * Produces a structured text block with current values, trends, and signals.
 */
export function formatMacroForPrompt(snapshot: MacroSnapshot): string {
  const lines: string[] = ['## Current Macroeconomic Data (FRED)'];

  for (const ind of snapshot.indicators) {
    if (ind.latestValue !== null) {
      const arrow = ind.trend === 'up' ? '↑' : ind.trend === 'down' ? '↓' : '→';
      const changeStr = ind.change !== null
        ? ` (${ind.change > 0 ? '+' : ''}${ind.change.toFixed(2)})`
        : '';
      lines.push(
        `- **${ind.name}**: ${ind.latestValue.toFixed(2)} ${ind.unit} ${arrow}${changeStr} (as of ${ind.latestDate})`
      );
    } else {
      lines.push(`- **${ind.name}**: data unavailable`);
    }
  }

  lines.push('');
  lines.push('## Derived Macro Signals');
  lines.push(`- Yield curve spread: ${snapshot.signals.yieldSpread?.toFixed(2) ?? 'N/A'}%`);
  lines.push(`- Fed stance: ${snapshot.signals.fedStance}`);
  lines.push(`- Inflation trend: ${snapshot.signals.inflationTrend}`);
  lines.push(`- Employment health: ${snapshot.signals.employmentHealth}`);
  lines.push(`- Consumer confidence: ${snapshot.signals.consumerConfidence}`);

  return lines.join('\n');
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Fetch the two most recent observations for a FRED series.
 * We fetch the last 2 to calculate trend direction.
 */
async function fetchIndicator(seriesId: string): Promise<MacroIndicator> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error('FRED_API_KEY environment variable is not set');
  }

  // Fetch recent observations (last 90 days should get at least 2 data points
  // even for quarterly series like GDP)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const url = new URL(FRED.BASE_URL);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', '5');
  url.searchParams.set('observation_start', startDate);
  url.searchParams.set('observation_end', endDate);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`FRED API returned HTTP ${response.status} for ${seriesId}`);
  }

  const data = await response.json();
  const observations: Array<{ date: string; value: string }> =
    data.observations || [];

  // Filter out "." values (FRED uses "." for missing/unreported data)
  const valid = observations.filter(o => o.value !== '.');

  const meta = INDICATOR_META[seriesId] || { name: seriesId, unit: '' };

  if (valid.length === 0) {
    return {
      seriesId,
      name: meta.name,
      latestValue: null,
      latestDate: null,
      previousValue: null,
      change: null,
      trend: 'flat',
      unit: meta.unit,
    };
  }

  const latest = parseFloat(valid[0].value);
  const previous = valid.length > 1 ? parseFloat(valid[1].value) : null;
  const change = previous !== null ? latest - previous : null;

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (change !== null) {
    if (change > 0.01) trend = 'up';
    else if (change < -0.01) trend = 'down';
  }

  return {
    seriesId,
    name: meta.name,
    latestValue: latest,
    latestDate: valid[0].date,
    previousValue: previous,
    change,
    trend,
    unit: meta.unit,
  };
}

/**
 * Derive high-level macro signals from the raw indicators.
 * These give Claude structured context beyond raw numbers.
 */
function deriveSignals(indicators: MacroIndicator[]): MacroSignals {
  const find = (id: string) => indicators.find(i => i.seriesId === id);

  // Yield spread
  const spread = find(FRED.SERIES.YIELD_SPREAD);
  const yieldSpread = spread?.latestValue ?? null;

  // Fed stance: based on recent fed funds rate changes
  const fedRate = find(FRED.SERIES.FED_FUNDS_RATE);
  let fedStance: MacroSignals['fedStance'] = 'unknown';
  if (fedRate != null && fedRate.change !== null) {
    if (fedRate.change > 0.1) fedStance = 'tightening';
    else if (fedRate.change < -0.1) fedStance = 'easing';
    else fedStance = 'holding';
  }

  // Inflation trend: based on CPI movement
  const cpi = find(FRED.SERIES.CPI);
  let inflationTrend: MacroSignals['inflationTrend'] = 'unknown';
  if (cpi != null && cpi.change !== null) {
    if (cpi.change > 0.3) inflationTrend = 'rising';
    else if (cpi.change < -0.1) inflationTrend = 'falling';
    else inflationTrend = 'stable';
  }

  // Employment health: based on unemployment rate level and trend
  const unemp = find(FRED.SERIES.UNEMPLOYMENT);
  let employmentHealth: MacroSignals['employmentHealth'] = 'unknown';
  if (unemp != null && unemp.latestValue !== null) {
    if (unemp.latestValue < 4.5 && unemp.trend !== 'up') employmentHealth = 'strong';
    else if (unemp.latestValue < 5.5) employmentHealth = 'weakening';
    else employmentHealth = 'weak';
  }

  // Consumer confidence: based on UMich sentiment trend
  const sentiment = find(FRED.SERIES.CONSUMER_SENTIMENT);
  let consumerConfidence: MacroSignals['consumerConfidence'] = 'unknown';
  if (sentiment != null && sentiment.change !== null) {
    if (sentiment.change > 1) consumerConfidence = 'improving';
    else if (sentiment.change < -1) consumerConfidence = 'declining';
    else consumerConfidence = 'stable';
  }

  return {
    yieldSpread,
    fedStance,
    inflationTrend,
    employmentHealth,
    consumerConfidence,
  };
}
