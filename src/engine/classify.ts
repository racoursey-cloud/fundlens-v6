/**
 * FundLens v6 — Sector Classification (Claude Haiku)
 *
 * Classifies holdings into sectors using Claude Haiku. Each holding
 * gets a sector label (Technology, Healthcare, etc.) that feeds into
 * the Positioning factor.
 *
 * MANDATORY: Sequential with 1.2s delays between Claude calls.
 * NEVER Promise.all() — has crashed production 5+ times.
 *
 * Classifications are cached in Supabase (holdings_cache.sector column)
 * so we only classify a holding once. On subsequent pipeline runs,
 * already-classified holdings are skipped.
 *
 * Session 4 deliverable. References: Master Reference §8 step 5.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE, PIPELINE } from './constants.js';
import { ResolvedHolding, delay } from './types.js';

// ─── Standard Sectors ───────────────────────────────────────────────────────
// Must match the sectors in thesis.ts for alignment scoring to work.

const VALID_SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Industrials',
  'Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
  'Precious Metals',
  'Fixed Income',
  'Cash & Equivalents',
] as const;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify holdings into sectors using Claude Haiku.
 * Modifies holdings in place (sets the .sector field).
 *
 * Only classifies holdings that don't already have a sector.
 * Uses batched prompts — sends 10–15 holdings per Claude call
 * to reduce the total number of API calls.
 *
 * @param holdings Array of resolved holdings (modified in place)
 */
export async function classifyHoldingSectors(
  holdings: ResolvedHolding[]
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Filter to holdings that need classification
  const needsClassification = holdings.filter(h => !h.sector && h.ticker);

  if (needsClassification.length === 0) {
    console.log('[classify] All holdings already classified');
    return;
  }

  console.log(`[classify] Classifying ${needsClassification.length} holdings via Claude Haiku`);

  const client = new Anthropic({ apiKey });

  // Batch holdings into groups of 15 for efficient API usage
  const batches = chunkArray(needsClassification, 15);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[classify] Batch ${i + 1}/${batches.length} (${batch.length} holdings)`);

    try {
      const classifications = await classifyBatch(client, batch);

      // Apply classifications to the holdings
      for (const holding of batch) {
        const key = holding.ticker || holding.name;
        const sector = classifications.get(key);
        if (sector && VALID_SECTORS.includes(sector as typeof VALID_SECTORS[number])) {
          holding.sector = sector;
        } else {
          // If classification didn't match a valid sector, try fuzzy matching
          holding.sector = fuzzyMatchSector(sector || '') || 'Technology';
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[classify] Batch ${i + 1} failed: ${msg}`);
      // On failure, leave sectors as null — they'll be neutral in positioning
    }

    // MANDATORY: 1.2s delay between Claude calls
    if (i < batches.length - 1) {
      await delay(PIPELINE.CLAUDE_CALL_DELAY_MS);
    }
  }

  const classified = holdings.filter(h => h.sector !== null).length;
  console.log(`[classify] Done: ${classified}/${holdings.length} holdings have sectors`);
}

// ─── Prompt Input Sanitization ─────────────────────────────────────────────
// SESSION 0 SECURITY: Prevents prompt injection via holding names from EDGAR.

function sanitizeHoldingText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\r\n]/g, ' ')
    .replace(/ignore\s+(previous|above|all)\s+instructions/gi, '[filtered]')
    .replace(/you\s+are\s+now/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    .replace(/respond\s+as/gi, '[filtered]')
    .replace(/classify\s+all\s+as/gi, '[filtered]')
    .slice(0, 100)
    .trim();
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Send a batch of holdings to Claude Haiku for sector classification.
 * Returns a Map of ticker/name → sector.
 */
async function classifyBatch(
  client: Anthropic,
  holdings: ResolvedHolding[]
): Promise<Map<string, string>> {
  // SESSION 0 SECURITY: Sanitize holding names before embedding in prompt
  const holdingsList = holdings
    .map(h => `- ${sanitizeHoldingText(h.ticker || 'N/A')}: ${sanitizeHoldingText(h.name)}`)
    .join('\n');

  const sectorList = VALID_SECTORS.join(', ');

  const response = await client.messages.create({
    model: CLAUDE.CLASSIFICATION_MODEL,
    max_tokens: 1000,
    system: `You are a financial sector classifier. Classify each company into exactly one sector from this list: ${sectorList}. Respond with ONLY a JSON object mapping ticker to sector. No explanation.`,
    messages: [
      {
        role: 'user',
        content: `Classify these holdings:\n${holdingsList}\n\nRespond as JSON: {"TICKER": "Sector", ...}`,
      },
    ],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('');

  // Parse JSON response
  const result = new Map<string, string>();

  try {
    // Try to extract JSON from the response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          result.set(key, value);
        }
      }
    }
  } catch (err) {
    console.error('[classify] Failed to parse Haiku response as JSON');
  }

  // Also map by name for holdings without tickers
  for (const h of holdings) {
    const key = h.ticker || 'N/A';
    const sector = result.get(key);
    if (sector) {
      result.set(h.name, sector);
      if (h.ticker) result.set(h.ticker, sector);
    }
  }

  return result;
}

/**
 * Fuzzy-match a sector string to the closest valid sector.
 * Handles common variations like "Tech" → "Technology",
 * "Health Care" → "Healthcare", etc.
 */
function fuzzyMatchSector(input: string): string | null {
  const lower = input.toLowerCase().trim();

  const aliases: Record<string, string> = {
    'tech': 'Technology',
    'technology': 'Technology',
    'information technology': 'Technology',
    'it': 'Technology',
    'health care': 'Healthcare',
    'healthcare': 'Healthcare',
    'health': 'Healthcare',
    'pharma': 'Healthcare',
    'biotech': 'Healthcare',
    'financial': 'Financials',
    'financials': 'Financials',
    'banks': 'Financials',
    'banking': 'Financials',
    'insurance': 'Financials',
    'consumer discretionary': 'Consumer Discretionary',
    'discretionary': 'Consumer Discretionary',
    'retail': 'Consumer Discretionary',
    'consumer staples': 'Consumer Staples',
    'staples': 'Consumer Staples',
    'consumer defensive': 'Consumer Staples',
    'energy': 'Energy',
    'oil': 'Energy',
    'oil & gas': 'Energy',
    'industrial': 'Industrials',
    'industrials': 'Industrials',
    'materials': 'Materials',
    'basic materials': 'Materials',
    'real estate': 'Real Estate',
    'reits': 'Real Estate',
    'utilities': 'Utilities',
    'utility': 'Utilities',
    'communication': 'Communication Services',
    'communication services': 'Communication Services',
    'telecom': 'Communication Services',
    'media': 'Communication Services',
    'precious metals': 'Precious Metals',
    'gold': 'Precious Metals',
    'fixed income': 'Fixed Income',
    'bonds': 'Fixed Income',
    'bond': 'Fixed Income',
    'cash': 'Cash & Equivalents',
    'money market': 'Cash & Equivalents',
    'cash & equivalents': 'Cash & Equivalents',
  };

  return aliases[lower] || null;
}

/** Split array into chunks. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
