/**
 * FundLens v6 — Macro Thesis Generator (§2.6)
 *
 * Uses Claude Sonnet to synthesize RSS headlines + FRED macro data +
 * deterministic sector priors into a structured macro thesis.
 *
 * Ported from v5.1 thesis.js with v6 TypeScript architecture:
 *   - 1.0–10.0 continuous sector scores (one decimal place)
 *   - Range anchoring: ≥2 sectors ≥7.0, ≥2 sectors ≤4.0, spread ≥4.0
 *   - Deterministic FRED-based sector priors (§2.6.2)
 *   - Structured JSON output (not text-delimited)
 *
 * Session 6: Rewrote from -2/+2 integer scale to v5.1's 1.0–10.0 continuous
 * scale per spec §2.6.1. Added deterministic sector priors per §2.6.2.
 * Added FRED commodity data to prompt context per §4.4.
 *
 * MANDATORY: Claude API calls are sequential with 1.2s delays.
 * NEVER Promise.all() — has crashed production 5+ times.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from './constants.js';
import { NewsHeadline, formatHeadlinesForPrompt } from './rss.js';
import { MacroSnapshot, formatMacroForPrompt } from './fred.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Sector score from the thesis (1.0–10.0 scale, spec §2.6.1) */
export interface SectorPreference {
  /** Sector name (matches the sectors used in holdings classification) */
  sector: string;
  /**
   * Sector score on 1.0–10.0 continuous scale (one decimal place):
   *   9.0–10.0 = sector directly captures the dominant macro theme
   *   8.0–8.9  = strong tailwind from current conditions
   *   6.0–7.9  = moderate benefit
   *   4.0–5.9  = neutral / no clear catalyst
   *   2.0–3.9  = facing meaningful headwinds
   *   1.0–1.9  = severe headwinds, avoid
   */
  score: number;
  /** Why this sector is favored/disfavored, in 1–2 sentences */
  reasoning: string;
}

/** Complete macro thesis output */
export interface MacroThesis {
  /** Narrative summary of current macro conditions (2–4 paragraphs) */
  narrative: string;
  /** Per-sector preference scores (1.0–10.0) */
  sectorPreferences: SectorPreference[];
  /** Key themes identified in the current environment */
  keyThemes: string[];
  /** Dominant theme label (2–4 words) */
  dominantTheme: string;
  /** Macro stance: risk-on, risk-off, or mixed */
  macroStance: 'risk-on' | 'risk-off' | 'mixed';
  /** Risk factors (up to 3) */
  riskFactors: string[];
  /** When the thesis was generated */
  generatedAt: string;
  /** Model used for generation */
  model: string;
}

// ─── Standard Sectors (§2.6.1) ──────────────────────────────────────────────
// 14 sectors shared between classification and thesis.

export const SECTORS = [
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

export type Sector = typeof SECTORS[number];

// ─── Deterministic FRED-Based Sector Priors (§2.6.2) ───────────────────────

/** A single deterministic prior adjustment */
export interface SectorPrior {
  sector: string;
  adjustment: number;
  reason: string;
}

/**
 * Compute deterministic sector preference priors from hard FRED data (§2.6.2).
 *
 * These are passed to Claude as priors it must acknowledge. They ensure a
 * floor of correctness even if Claude has an off day.
 *
 * Economic relationships:
 *   - Inverted yield curve → Financials headwind
 *   - High CPI → Energy & Precious Metals tailwind
 *   - Fed tightening → Real Estate & Utilities headwind
 *   - High unemployment → Consumer Disc headwind, Consumer Staples tailwind
 */
export function computeSectorPriors(snapshot: MacroSnapshot): SectorPrior[] {
  const priors: SectorPrior[] = [];

  // Yield curve inverted → Financials headwind
  if (snapshot.signals.yieldSpread !== null && snapshot.signals.yieldSpread < 0) {
    priors.push({
      sector: 'Financials',
      adjustment: -1.0,
      reason: `Yield curve inverted (spread: ${snapshot.signals.yieldSpread.toFixed(2)}%). Net interest margins compress when long rates < short rates.`,
    });
  }

  // High inflation → Energy + Precious Metals tailwind
  // CPI YoY > 4% (we look at the CPI index change — derive approximate YoY)
  const cpi = snapshot.indicators.find(i => i.seriesId === 'CPIAUCSL');
  if (cpi?.latestValue !== null && cpi?.previousValue !== null) {
    // CPI is an index, but our derived inflationTrend signal captures direction.
    // Use the signal + the raw fed funds rate to infer if inflation is elevated.
    if (snapshot.signals.inflationTrend === 'rising') {
      priors.push({
        sector: 'Energy',
        adjustment: +1.0,
        reason: 'Inflation trending higher — energy commodities historically benefit as both a cause and a hedge.',
      });
      priors.push({
        sector: 'Precious Metals',
        adjustment: +1.0,
        reason: 'Rising inflation favors precious metals as an inflation hedge (historical correlation).',
      });
    }
  }

  // Fed tightening → Real Estate & Utilities headwind
  if (snapshot.signals.fedStance === 'tightening') {
    priors.push({
      sector: 'Real Estate',
      adjustment: -0.5,
      reason: 'Fed tightening raises borrowing costs, headwind for rate-sensitive sectors.',
    });
    priors.push({
      sector: 'Utilities',
      adjustment: -0.5,
      reason: 'Rising rates compress utility valuations (bond proxies become less attractive vs. risk-free yields).',
    });
  }

  // Weak employment → Consumer Discretionary headwind, Consumer Staples tailwind
  if (snapshot.signals.employmentHealth === 'weak') {
    priors.push({
      sector: 'Consumer Discretionary',
      adjustment: -0.5,
      reason: 'Weak employment reduces discretionary spending power.',
    });
    priors.push({
      sector: 'Consumer Staples',
      adjustment: +0.5,
      reason: 'Weak employment shifts consumer spending toward non-discretionary essentials.',
    });
  } else if (snapshot.signals.employmentHealth === 'weakening') {
    priors.push({
      sector: 'Consumer Discretionary',
      adjustment: -0.3,
      reason: 'Employment weakening — early headwind for discretionary spending.',
    });
  }

  return priors;
}

// ─── Prompt Input Sanitization ─────────────────────────────────────────────
// SESSION 0 SECURITY: Prevents prompt injection via RSS headlines or FRED data.

function sanitizePromptInput(text: string, maxLength = 200): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/```/g, '')
    .replace(/ignore\s+(previous|above|all)\s+instructions/gi, '[filtered]')
    .replace(/you\s+are\s+now/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    .slice(0, maxLength)
    .trim();
}

/**
 * Validate that parsed sector preferences only contain known sectors
 * and scores within the expected 1.0–10.0 range.
 */
function validateSectorPreferences(prefs: SectorPreference[]): SectorPreference[] {
  const validSectorSet = new Set<string>(SECTORS);
  return prefs.filter(p => {
    if (!validSectorSet.has(p.sector)) return false;
    if (typeof p.score !== 'number' || !isFinite(p.score)) return false;
    return true;
  });
}

/**
 * Validate range anchoring rules (§2.6.1):
 *   - At least 2 sectors must score 7.0 or above
 *   - At least 2 sectors must score 4.0 or below
 *   - Spread between highest and lowest must be ≥ 4.0 points
 *
 * If validation fails, log a warning but don't reject — Claude's output
 * is still usable, just less differentiated than ideal.
 */
function checkRangeAnchoring(prefs: SectorPreference[]): boolean {
  const scores = prefs.map(p => p.score);
  const highCount = scores.filter(s => s >= 7.0).length;
  const lowCount = scores.filter(s => s <= 4.0).length;
  const spread = Math.max(...scores) - Math.min(...scores);

  const valid = highCount >= 2 && lowCount >= 2 && spread >= 4.0;
  if (!valid) {
    console.warn(
      `[thesis] Range anchoring check failed: ${highCount} sectors ≥7.0 (need 2), ` +
      `${lowCount} sectors ≤4.0 (need 2), spread=${spread.toFixed(1)} (need 4.0). ` +
      `Claude's output lacks conviction — scores may cluster near neutral.`
    );
  }
  return valid;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a macro thesis from current news headlines, FRED data, and
 * deterministic sector priors.
 *
 * This is a single Claude Sonnet call with a structured prompt.
 * The response is parsed from the JSON output.
 */
export async function generateMacroThesis(
  headlines: NewsHeadline[],
  macroSnapshot: MacroSnapshot
): Promise<MacroThesis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({ apiKey });

  // Compute deterministic sector priors from FRED data (§2.6.2)
  const sectorPriors = computeSectorPriors(macroSnapshot);

  // SESSION 0 SECURITY: Sanitize all external inputs before embedding in prompt
  const rawHeadlines = formatHeadlinesForPrompt(headlines);
  const headlinesText = rawHeadlines
    .split('\n')
    .map(line => sanitizePromptInput(line, 250))
    .join('\n');
  const macroText = formatMacroForPrompt(macroSnapshot);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(headlinesText, macroText, sectorPriors);

  console.log(`[thesis] Generating macro thesis via Claude Sonnet (${sectorPriors.length} sector priors)...`);

  const response = await client.messages.create({
    model: CLAUDE.THESIS_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  });

  // Extract text from response
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('');

  // Parse the structured thesis from Claude's response
  const thesis = parseThesisResponse(text);

  // SESSION 0 SECURITY: Validate sector preferences contain only known sectors
  thesis.sectorPreferences = validateSectorPreferences(thesis.sectorPreferences);

  // Check range anchoring (warn only, don't reject)
  checkRangeAnchoring(thesis.sectorPreferences);

  // Re-fill any missing sectors after validation filtering (default to neutral 5.0)
  for (const sector of SECTORS) {
    if (!thesis.sectorPreferences.find(sp => sp.sector === sector)) {
      thesis.sectorPreferences.push({
        sector,
        score: 5.0,
        reasoning: 'No specific thesis view — neutral positioning.',
      });
    }
  }

  console.log(
    `[thesis] Thesis generated: ${thesis.sectorPreferences.length} sector views, ` +
    `${thesis.keyThemes.length} key themes, dominant: "${thesis.dominantTheme}"`
  );

  return thesis;
}

// ─── Prompt Construction (ported from v5.1 thesis.js) ─────────────────────

function buildSystemPrompt(): string {
  return `You are FundLens's macro research analyst. Your job is to synthesize current economic data and news headlines into a structured macro thesis that drives sector positioning for a 401(k) fund scoring engine.

Your output must be ONLY valid JSON. No markdown, no backticks, no preamble.

Rules:
- Base every claim on specific data points or headlines provided in the input
- Never predict specific price targets or returns
- Use language like "conditions favor" or "headwinds for" rather than "will go up/down"
- Be specific about WHY a sector is favored or disfavored — cite the mechanism
- If the data is mixed or unclear for a sector, score it in the 4.0–5.9 neutral range and say so
- The narrative should be 2–4 paragraphs, written for an informed non-expert
- You are an analyst, not a cheerleader — state negatives plainly
- When deterministic priors are provided, acknowledge them in your reasoning. You may adjust them based on nuance (e.g. "this inflation is supply-driven, so Energy benefits less") but you must explain any deviation.`;
}

function buildUserPrompt(
  headlinesText: string,
  macroText: string,
  sectorPriors: SectorPrior[]
): string {
  const sectorList = SECTORS.join(', ');

  // Format deterministic priors for the prompt
  let priorsBlock = '';
  if (sectorPriors.length > 0) {
    priorsBlock = '\n## Deterministic Sector Priors (from FRED data)\n' +
      'These priors are computed from hard economic data. Acknowledge them in your sector scoring.\n' +
      'You may adjust if you have specific reason to deviate, but explain why.\n\n';
    for (const prior of sectorPriors) {
      const direction = prior.adjustment > 0 ? 'TAILWIND' : 'HEADWIND';
      priorsBlock += `- ${prior.sector}: ${direction} (${prior.adjustment > 0 ? '+' : ''}${prior.adjustment.toFixed(1)}) — ${prior.reason}\n`;
    }
  }

  return `Here is the current economic data and recent news. Generate a macro thesis.

${macroText}
${priorsBlock}
## Recent News Headlines
${headlinesText}

---

=== SECTOR SCORING INSTRUCTIONS ===
Score each sector from 1.0 to 10.0 (one decimal place):
  9.0–10.0 = sector directly captures the dominant macro theme
  8.0–8.9  = strong tailwind from current conditions
  6.0–7.9  = moderate benefit
  4.0–5.9  = neutral / no clear catalyst
  2.0–3.9  = facing meaningful headwinds
  1.0–1.9  = severe headwinds, avoid

RANGE ANCHORING (mandatory):
  Use the FULL 1.0–10.0 range with one decimal place (e.g. 7.3, not 7).
  At least 2 sectors MUST score 7.0 or higher.
  At least 2 sectors MUST score 4.0 or lower.
  If all sectors cluster between 4.0–7.0, your analysis lacks conviction.
  Differentiate clearly: the spread between your best and worst sector
  should be at least 4.0 points.

You must include a score for each of these sectors: ${sectorList}

Respond with ONLY valid JSON. No markdown, no backticks, no preamble.
Exact structure required:
{
  "narrative": "2-4 paragraph macro assessment",
  "sectorPreferences": {
    "Technology": { "score": 7.3, "reason": "one-sentence explanation" },
    "Healthcare": { "score": 5.8, "reason": "..." },
    ...all 14 sectors
  },
  "dominantTheme": "2-4 word label",
  "macroStance": "risk-on | risk-off | mixed",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "riskFactors": ["risk1", "risk2", "risk3"]
}`;
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Parse Claude's JSON response into a MacroThesis.
 * Handles both the structured JSON format and text-delimited fallback.
 */
function parseThesisResponse(text: string): MacroThesis {
  // Try to parse as pure JSON first (preferred — v5.1 style)
  let parsed: Record<string, unknown> | null = null;

  try {
    // Strip any backticks or markdown wrapper Claude might add despite instructions
    const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON from a code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {
        console.error('[thesis] Failed to parse thesis JSON from code block');
      }
    }
  }

  if (!parsed) {
    // Last resort: try to find any JSON object in the text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        parsed = JSON.parse(objMatch[0]);
      } catch {
        console.error('[thesis] Failed to extract any valid JSON from thesis response');
      }
    }
  }

  // Extract narrative
  const narrative = typeof parsed?.narrative === 'string'
    ? parsed.narrative
    : (typeof parsed?.thesis === 'string' ? parsed.thesis : '');

  // Extract sector preferences — handle both array and object formats
  let sectorPreferences: SectorPreference[] = [];

  const rawPrefs = parsed?.sectorPreferences ?? parsed?.sectorScores ?? {};
  if (Array.isArray(rawPrefs)) {
    // Array format: [{ sector, score, reason }, ...]
    sectorPreferences = rawPrefs.map((item: Record<string, unknown>) => ({
      sector: String(item.sector || ''),
      score: clampScore(Number(item.score || 5.0)),
      reasoning: String(item.reason || item.reasoning || ''),
    }));
  } else if (typeof rawPrefs === 'object' && rawPrefs !== null) {
    // Object format (v5.1 style): { "Technology": { score: 7.3, reason: "..." } }
    for (const [sector, data] of Object.entries(rawPrefs)) {
      const d = data as Record<string, unknown>;
      sectorPreferences.push({
        sector,
        score: clampScore(Number(d?.score ?? 5.0)),
        reasoning: String(d?.reason || d?.reasoning || ''),
      });
    }
  }

  // Ensure all standard sectors have a score (default to neutral 5.0 if missing)
  for (const sector of SECTORS) {
    if (!sectorPreferences.find(sp => sp.sector === sector)) {
      sectorPreferences.push({
        sector,
        score: 5.0,
        reasoning: 'No specific thesis view — neutral positioning.',
      });
    }
  }

  // Extract other fields
  const keyThemes = Array.isArray(parsed?.keyThemes)
    ? (parsed.keyThemes as string[]).map(String)
    : [];

  const dominantTheme = typeof parsed?.dominantTheme === 'string'
    ? parsed.dominantTheme
    : '';

  const macroStanceRaw = String(parsed?.macroStance || 'mixed');
  const macroStance: MacroThesis['macroStance'] =
    macroStanceRaw === 'risk-on' ? 'risk-on' :
    macroStanceRaw === 'risk-off' ? 'risk-off' :
    'mixed';

  const riskFactors = Array.isArray(parsed?.riskFactors)
    ? (parsed.riskFactors as string[]).map(String)
    : [];

  return {
    narrative,
    sectorPreferences,
    keyThemes,
    dominantTheme,
    macroStance,
    riskFactors,
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  };
}

/** Clamp score to 1.0–10.0 range with one decimal place (§2.6.1). */
function clampScore(val: number): number {
  if (!isFinite(val)) return 5.0;
  return parseFloat(Math.max(1.0, Math.min(10.0, val)).toFixed(1));
}
