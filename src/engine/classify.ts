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
  'Other',
] as const;

// ─── Pre-Classification Gate (F-1 fix) ────────────────────────────────────
// Auto-classify holdings that can be identified from EDGAR metadata alone,
// without sending to Claude Haiku. This prevents debt instruments with
// pseudo-tickers (e.g. "T 3.875 12/31/29") from being misclassified as
// equity sectors.

/**
 * NPORT-P issuerCategory codes that ALWAYS indicate debt/fixed-income.
 * These issuers ONLY issue debt — if the issuerCategory is one of these,
 * the holding is definitively Fixed Income regardless of other fields.
 *
 * CRITICAL: "CORP" is NOT in this set. In NPORT-P, issuerCategory=CORP
 * means "corporate issuer" — it applies to both corporate BONDS (assetCat=DBT)
 * and corporate EQUITIES (assetCat=EC). Treating all CORP as Fixed Income
 * would misclassify stocks like NVIDIA, Meta, Palantir as bonds.
 * CORP is handled separately in Rule 2b below.
 */
const ALWAYS_DEBT_ISSUER_CATS = new Set([
  'UST',   // U.S. Treasury — always debt
  'USGA',  // U.S. Government Agency — always debt
  'MUN',   // Municipal bonds — always debt
  'SOV',   // Sovereign — always debt
  'ABS',   // Asset-backed securities — always debt
  'AGEN',  // Agency — always debt
  'AGNCY', // Agency (alternate code) — always debt
]);

/**
 * NPORT-P assetCategory codes that indicate debt instruments.
 * Ref: SEC EDGAR NPORT-P XML schema, invstOrSec → assetCat values.
 */
const DEBT_ASSET_CATEGORIES = new Set([
  'DBT',   // Debt
  'STIV',  // Short-term investment vehicle (T-bills, commercial paper)
  'LON',   // Loan (bank loans, leveraged loans)
  'ABS-MBS',  // Asset-backed: mortgage-backed securities
  'ABS-O',    // Asset-backed: other (auto, student loan, credit card)
  'ABS-CBDO', // Asset-backed: CDO/CLO
]);

/**
 * NPORT-P assetCategory codes for derivative instruments.
 * Derivatives are classified as "Other" — they are hedges/overlays,
 * not direct sector exposure.
 */
const DERIVATIVE_ASSET_CATEGORIES = new Set([
  'DIR',   // Derivative — interest rate (swaps, swaptions, futures)
  'DFE',   // Derivative — foreign exchange (FX forwards, options)
  'DE',    // Derivative — equity (options, equity swaps)
  'DC',    // Derivative — credit (CDS)
  'DO',    // Derivative — other
]);

/**
 * Detect whether a "ticker" is actually a bond description rather than
 * a real equity ticker symbol.
 *
 * Bond pseudo-tickers from CUSIP resolution typically look like:
 *   "T 3.875 12/31/29"     (US Treasury note)
 *   "JPM V1.04 02/04/27"   (JPMorgan floating-rate bond)
 *   "BAC V3.824 01/20/28 MTN" (Bank of America medium-term note)
 *   "FNCI 5 1/12"          (Fannie Mae TBA)
 *   "DFC 1.49 08/15/31 2"  (Dev Finance Corp bond)
 *
 * Real equity tickers are 1–5 uppercase letters with no spaces, slashes,
 * or decimal points.
 */
function isBondPseudoTicker(ticker: string | null): boolean {
  if (!ticker) return false;
  // Real equity tickers: 1–5 uppercase letters, optionally with a dot class suffix (BRK.B)
  // Bond descriptions: contain spaces, slashes, or maturity dates
  return /\s/.test(ticker) || /\d{1,2}\/\d{1,2}/.test(ticker) || /V\d+\.\d+/.test(ticker);
}

/**
 * Pre-classify holdings using EDGAR metadata, before the Claude Haiku step.
 * Modifies holdings in place (sets the .sector field).
 *
 * Classification rules (in priority order):
 *   0a. assetCategory is derivative (DIR, DFE, DE, DC, DO) → "Other"
 *   0b. isInvestmentCompany with cash/money-market name → "Cash & Equivalents"
 *   1.  isDebt === true → "Fixed Income"
 *   2a. issuerCategory in ALWAYS_DEBT_ISSUER_CATS → "Fixed Income"
 *   2b. issuerCategory=CORP + debt assetCategory → "Fixed Income"
 *   3.  assetCategory in DEBT_ASSET_CATEGORIES → "Fixed Income"
 *   4.  Bond pseudo-ticker detected → "Fixed Income"
 *   5.  Name contains treasury/bond/note keywords → "Fixed Income"
 *
 * Returns the count of holdings pre-classified.
 */
function preClassifyByMetadata(holdings: ResolvedHolding[]): number {
  let preClassified = 0;

  for (const h of holdings) {
    if (h.sector) continue; // Already classified

    // Rule 0a: Derivative instruments → "Other"
    // Derivatives (interest rate swaps, FX forwards, equity options, CDS) are
    // hedging overlays, not direct sector exposure. Many have name "N/A".
    if (h.assetCategory && DERIVATIVE_ASSET_CATEGORIES.has(h.assetCategory.toUpperCase())) {
      h.sector = 'Other';
      preClassified++;
      continue;
    }

    // Rule 0b: Internal fund holdings (investment company flag)
    // Cash/money-market internal funds → Cash & Equivalents
    // Other internal funds (bond funds used as sweep vehicles) → based on name
    if (h.isInvestmentCompany) {
      const nameLower = (h.name || '').toLowerCase();
      if (
        nameLower.includes('cash') ||
        nameLower.includes('money market') ||
        nameLower.includes('liquidity') ||
        nameLower.includes('government reserve') ||
        nameLower.includes('treasury fund') ||
        nameLower.includes('state street') // Common sweep account in fund-of-fund structures
      ) {
        h.sector = 'Cash & Equivalents';
        preClassified++;
        continue;
      }
      // Other investment company holdings (e.g., "TCW Central Cash Fund") that
      // don't match cash keywords — skip to let Claude classify by name
    }

    // Rule 1: Explicit debt flag from NPORT-P
    if (h.isDebt) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // Rule 2a: Issuer category is ALWAYS debt (UST, USGA, MUN, SOV, ABS, AGEN, AGNCY)
    if (h.issuerCategory && ALWAYS_DEBT_ISSUER_CATS.has(h.issuerCategory.toUpperCase())) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // Rule 2b: CORP issuerCategory — only Fixed Income if also flagged as debt.
    // NPORT-P issuerCategory=CORP means "corporate issuer" and applies to BOTH
    // stocks (assetCat=EC) and bonds (assetCat=DBT). We must cross-check.
    // isDebt is already caught by Rule 1, so this catches CORP+DBT without isDebt flag.
    if (
      h.issuerCategory?.toUpperCase() === 'CORP' &&
      h.assetCategory &&
      DEBT_ASSET_CATEGORIES.has(h.assetCategory.toUpperCase())
    ) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // Rule 3: Asset category indicates debt
    if (h.assetCategory && DEBT_ASSET_CATEGORIES.has(h.assetCategory.toUpperCase())) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // Rule 4: Ticker looks like a bond description, not a real equity ticker
    if (isBondPseudoTicker(h.ticker)) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // Rule 5: Name-based heuristic for common fixed-income holdings
    const nameLower = (h.name || '').toLowerCase();
    if (
      nameLower.includes('treasury') ||
      nameLower.includes('t-bill') ||
      nameLower.includes('t-note') ||
      nameLower.includes('umbs') ||
      nameLower.includes('gnma') ||
      nameLower.includes('fhlmc') ||
      nameLower.includes('fnma') ||
      /\bbond\b/.test(nameLower) ||
      /\bbonds\b/.test(nameLower) ||
      /\bdebenture\b/.test(nameLower) ||
      /\bmortgage\b/.test(nameLower) ||
      /\bmbs\b/.test(nameLower) ||
      /\bcdo\b/.test(nameLower) ||
      /\bclo\b/.test(nameLower) ||
      /\bmtn\b/.test(nameLower) ||
      /\bsovereign\b/.test(nameLower)
    ) {
      h.sector = 'Fixed Income';
      preClassified++;
      continue;
    }

    // (Rule 6 moved to Rule 0b above — investment company detection now runs first)
  }

  return preClassified;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify holdings into sectors using Claude Haiku.
 * Modifies holdings in place (sets the .sector field).
 *
 * F-1 fix: Before sending to Claude, pre-classify debt/bond holdings
 * using EDGAR metadata (isDebt, issuerCategory, assetCategory) and
 * pseudo-ticker detection. This prevents bond descriptions like
 * "T 3.875 12/31/29" from being misclassified as equity sectors.
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

  // ── F-1 fix: Pre-classify debt/bond holdings from EDGAR metadata ──
  // This gate runs BEFORE the Claude Haiku step to catch holdings that
  // have pseudo-tickers (bond descriptions) that would confuse the LLM.
  const preClassifiedCount = preClassifyByMetadata(holdings);
  if (preClassifiedCount > 0) {
    console.log(`[classify] Pre-classified ${preClassifiedCount} holdings from EDGAR metadata (debt/bond/cash)`);
  }

  // Filter to holdings that still need classification.
  // Include holdings with a ticker OR a name — bond holdings often have names
  // but no ticker after the pre-classification gate filters out pseudo-tickers.
  const needsClassification = holdings.filter(h => !h.sector && (h.ticker || h.name));

  if (needsClassification.length === 0) {
    console.log('[classify] All holdings already classified');
    return;
  }

  console.log(`[classify] Classifying ${needsClassification.length} holdings via Claude Haiku`);

  const client = new Anthropic({ apiKey });

  // Batch holdings into groups of 25 for efficient API usage
  // Session 10: Increased from 15 to 25 to match v5.1 (fewer Claude calls = faster)
  const batches = chunkArray(needsClassification, 25);

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
          holding.sector = fuzzyMatchSector(sector || '') || 'Other';
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
  // Use ticker as the key when available, otherwise use the holding name.
  // This ensures the JSON response keys match what we use for lookup.
  const holdingsList = holdings
    .map(h => {
      const key = sanitizeHoldingText(h.ticker || h.name);
      const label = h.ticker ? sanitizeHoldingText(h.name) : '(classify by name)';
      return `- ${key}: ${label}`;
    })
    .join('\n');

  const sectorList = VALID_SECTORS.join(', ');

  const response = await client.messages.create({
    model: CLAUDE.CLASSIFICATION_MODEL,
    max_tokens: 1000,
    system: `You are a financial sector classifier. Classify each holding into exactly one sector from this list: ${sectorList}. Respond with ONLY a JSON object mapping the key (ticker or name) to sector. No explanation.`,
    messages: [
      {
        role: 'user',
        content: `Classify these holdings:\n${holdingsList}\n\nRespond as JSON: {"KEY": "Sector", ...} where KEY is the identifier before the colon on each line.`,
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
    'silver': 'Precious Metals',
    'bullion': 'Precious Metals',
    'mining': 'Precious Metals',
    'fixed income': 'Fixed Income',
    'bonds': 'Fixed Income',
    'bond': 'Fixed Income',
    'treasury': 'Fixed Income',
    'treasuries': 'Fixed Income',
    'government bonds': 'Fixed Income',
    'sovereign': 'Fixed Income',
    'corporate bonds': 'Fixed Income',
    'municipal bonds': 'Fixed Income',
    'debt': 'Fixed Income',
    'cash': 'Cash & Equivalents',
    'money market': 'Cash & Equivalents',
    'cash & equivalents': 'Cash & Equivalents',
    'cash equivalents': 'Cash & Equivalents',
    'currency': 'Cash & Equivalents',
    't-bills': 'Fixed Income',
    't-bill': 'Fixed Income',
    'notes': 'Fixed Income',
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
