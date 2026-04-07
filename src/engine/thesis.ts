/**
 * FundLens v6 — Macro Thesis Generator
 *
 * Uses Claude Sonnet to synthesize RSS headlines + FRED macro data into
 * a structured macro thesis. The thesis determines which sectors are
 * favored or disfavored, which directly drives the Positioning factor
 * (25% of composite score).
 *
 * The thesis is NOT a prediction — it's a structured interpretation of
 * current conditions. "Given what's happening right now, which sectors
 * are likely to benefit and which are likely to face headwinds?"
 *
 * The thesis output includes:
 *   1. A narrative summary of current macro conditions
 *   2. Sector preference scores (-2 to +2 for each sector)
 *   3. Supporting reasoning for each sector view
 *
 * MANDATORY: Claude API calls are sequential with 1.2s delays.
 * NEVER Promise.all() — has crashed production 5+ times.
 *
 * Session 4 deliverable. References: Master Reference §6, §7, §8 step 11.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from './constants.js';
import { NewsHeadline, formatHeadlinesForPrompt } from './rss.js';
import { MacroSnapshot, formatMacroForPrompt } from './fred.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Sector preference from the thesis (-2 to +2) */
export interface SectorPreference {
  /** Sector name (matches the sectors used in holdings classification) */
  sector: string;
  /**
   * Preference score:
   *  +2 = strongly favorable conditions
   *  +1 = mildly favorable
   *   0 = neutral
   *  -1 = mildly unfavorable
   *  -2 = strongly unfavorable
   */
  preference: number;
  /** Why this sector is favored/disfavored, in 1–2 sentences */
  reasoning: string;
}

/** Complete macro thesis output */
export interface MacroThesis {
  /** Narrative summary of current macro conditions (2–4 paragraphs) */
  narrative: string;
  /** Per-sector preference scores */
  sectorPreferences: SectorPreference[];
  /** Key themes identified in the current environment */
  keyThemes: string[];
  /** When the thesis was generated */
  generatedAt: string;
  /** Model used for generation */
  model: string;
}

// ─── Standard Sectors ───────────────────────────────────────────────────────
// These map to the sector classifications assigned by Claude Haiku.
// The thesis generates a preference for each of these sectors.

const SECTORS = [
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

// ─── Prompt Input Sanitization ─────────────────────────────────────────────
// SESSION 0 SECURITY: Prevents prompt injection via RSS headlines or FRED data.

/**
 * Sanitize text before embedding in a Claude prompt.
 * Strips control characters, limits length, and removes patterns
 * that look like prompt injection attempts.
 */
function sanitizePromptInput(text: string, maxLength = 200): string {
  return text
    // Strip control characters (except newline/tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove anything that looks like prompt delimiter injection
    .replace(/```/g, '')
    .replace(/NARRATIVE:|KEY_THEMES:|SECTOR_PREFERENCES:/gi, '')
    // Remove instruction-like patterns
    .replace(/ignore\s+(previous|above|all)\s+instructions/gi, '[filtered]')
    .replace(/you\s+are\s+now/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    // Limit length per headline
    .slice(0, maxLength)
    .trim();
}

/**
 * Validate that parsed sector preferences only contain known sectors
 * and scores within the expected range. Rejects injection attempts
 * that produce out-of-bounds values.
 */
function validateSectorPreferences(prefs: SectorPreference[]): SectorPreference[] {
  const validSectorSet = new Set<string>(SECTORS);
  return prefs.filter(p => {
    if (!validSectorSet.has(p.sector)) return false;
    if (typeof p.preference !== 'number' || !isFinite(p.preference)) return false;
    return true;
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a macro thesis from current news headlines and FRED data.
 *
 * This is a single Claude Sonnet call with a structured prompt.
 * The response is parsed from JSON embedded in the text output.
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

  // SESSION 0 SECURITY: Sanitize all external inputs before embedding in prompt
  const rawHeadlines = formatHeadlinesForPrompt(headlines);
  const headlinesText = rawHeadlines
    .split('\n')
    .map(line => sanitizePromptInput(line, 250))
    .join('\n');
  const macroText = formatMacroForPrompt(macroSnapshot);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(headlinesText, macroText);

  console.log('[thesis] Generating macro thesis via Claude Sonnet...');

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

  // Re-fill any missing sectors after validation filtering
  for (const sector of SECTORS) {
    if (!thesis.sectorPreferences.find(sp => sp.sector === sector)) {
      thesis.sectorPreferences.push({
        sector,
        preference: 0,
        reasoning: 'No specific thesis view — neutral positioning.',
      });
    }
  }

  console.log(
    `[thesis] Thesis generated: ${thesis.sectorPreferences.length} sector views, ` +
    `${thesis.keyThemes.length} key themes`
  );

  return thesis;
}

// ─── Prompt Construction ────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are FundLens's macro research analyst. Your job is to synthesize current economic data and news headlines into a structured macro thesis that drives sector positioning for a 401(k) fund scoring engine.

Your output will be parsed programmatically, so you MUST follow the exact format specified.

Rules:
- Base every claim on specific data points or headlines provided in the input
- Never predict specific price targets or returns
- Use language like "conditions favor" or "headwinds for" rather than "will go up/down"
- Be specific about WHY a sector is favored or disfavored — cite the mechanism
- If the data is mixed or unclear for a sector, score it 0 (neutral) and say so
- The narrative should be 2–4 paragraphs, written for an informed non-expert
- You are an analyst, not a cheerleader — state negatives plainly`;
}

function buildUserPrompt(
  headlinesText: string,
  macroText: string
): string {
  const sectorList = SECTORS.join(', ');

  return `Here is the current economic data and recent news. Generate a macro thesis.

${macroText}

## Recent News Headlines
${headlinesText}

---

Respond in EXACTLY this format (the JSON block must be valid JSON):

NARRATIVE:
[2–4 paragraphs summarizing current macro conditions and what they mean for investors]

KEY_THEMES:
[comma-separated list of 3–5 key themes, e.g. "Fed rate cuts, AI capital spending, China slowdown"]

SECTOR_PREFERENCES:
\`\`\`json
[
  {"sector": "Technology", "preference": 0, "reasoning": "..."},
  {"sector": "Healthcare", "preference": 0, "reasoning": "..."},
  ...
]
\`\`\`

You must include a preference for each of these sectors: ${sectorList}

Preference scale: -2 (strongly unfavorable), -1 (mildly unfavorable), 0 (neutral), +1 (mildly favorable), +2 (strongly favorable)`;
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Parse Claude's structured response into a MacroThesis.
 * The response format is:
 *   NARRATIVE: ... text ...
 *   KEY_THEMES: ... comma list ...
 *   SECTOR_PREFERENCES: ```json [ ... ] ```
 */
function parseThesisResponse(text: string): MacroThesis {
  // Extract narrative (between NARRATIVE: and KEY_THEMES:)
  const narrativeMatch = text.match(
    /NARRATIVE:\s*([\s\S]*?)(?=KEY_THEMES:|SECTOR_PREFERENCES:|$)/i
  );
  const narrative = narrativeMatch?.[1]?.trim() || '';

  // Extract key themes
  const themesMatch = text.match(
    /KEY_THEMES:\s*([\s\S]*?)(?=SECTOR_PREFERENCES:|$)/i
  );
  const themesRaw = themesMatch?.[1]?.trim() || '';
  const keyThemes = themesRaw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  // Extract sector preferences JSON
  let sectorPreferences: SectorPreference[] = [];
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        sectorPreferences = parsed.map(item => ({
          sector: item.sector || '',
          preference: clampPreference(item.preference || 0),
          reasoning: item.reasoning || '',
        }));
      }
    } catch (err) {
      console.error('[thesis] Failed to parse sector preferences JSON:', err);
    }
  }

  // Ensure all standard sectors have a preference (default to 0 if missing)
  for (const sector of SECTORS) {
    if (!sectorPreferences.find(sp => sp.sector === sector)) {
      sectorPreferences.push({
        sector,
        preference: 0,
        reasoning: 'No specific thesis view — neutral positioning.',
      });
    }
  }

  return {
    narrative,
    sectorPreferences,
    keyThemes,
    generatedAt: new Date().toISOString(),
    model: CLAUDE.THESIS_MODEL,
  };
}

/** Clamp preference to -2 to +2 range. */
function clampPreference(val: number): number {
  return Math.max(-2, Math.min(2, Math.round(val)));
}
