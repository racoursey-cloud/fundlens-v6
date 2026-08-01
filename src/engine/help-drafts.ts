/**
 * FundLens — Help Grounding-Corpus Drafting (B-series B10 c7)
 *
 * Drafts the §6 topic list into help_entries as status='draft' rows, in
 * the B9 Translation register (explain, never evaluate) — the B9 explainer
 * copy's long-form home (ruling 3). The translations.ts template governs:
 * one Claude call per topic on CLAUDE.PROSE_MODEL, strictly sequential
 * with CLAUDE.CALL_DELAY_MS (1.2s) between calls — never in parallel —
 * banned vocabulary in-prompt AND post-checked in code, per-item failures
 * logged without aborting the batch.
 *
 * Invoked only by the admin-only generate route (routes.ts, B10 c8c).
 * Robert approves rows himself in the Supabase dashboard (status →
 * approved); only approved rows ever ground the agent (c6). A topic whose
 * slug already has a row — any status — is skipped, so Robert's edits and
 * approvals are never overwritten by a re-click. The nightly pipeline
 * never writes any Help table.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from './constants.js';
import { BANNED_VOCABULARY, findBannedWord } from './fund-summaries.js';
import { supaSelect, supaInsert } from './supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HelpDraftRunResult {
  /** Topics whose draft was generated and stored this run */
  drafted: string[];
  /** Topics whose draft hit the banned-vocabulary check — nothing written */
  rejected: Array<{ slug: string; word: string }>;
  /** Topics skipped (row already exists, or the Claude call failed) */
  skipped: Array<{ slug: string; reason: string }>;
  /** Topics considered */
  total: number;
}

// ─── The §6 topic list (ruling 3) ───────────────────────────────────────────
// The question log grows this list from real demand; additions arrive by
// assignment, not by edit-in-passing.

const GROUNDING_TOPICS: ReadonlyArray<{ slug: string; question: string }> = [
  { slug: 'expense-ratios', question: 'What is an expense ratio?' },
  { slug: 'diversification', question: 'What does diversification mean?' },
  { slug: 'index-vs-active', question: 'What is the difference between an index fund and an actively managed fund?' },
  { slug: 'money-market-funds', question: 'What is a money market fund?' },
  { slug: 'duration-bond-basics', question: 'How do bond funds work, and what does duration mean?' },
  { slug: 'shorts-and-leverage', question: 'What are short positions and leverage in a fund?' },
  { slug: 'what-is-an-nport-filing', question: 'What is an N-PORT filing?' },
  { slug: 'reading-the-about-tab', question: 'How do I read the About tab on a fund?' },
  { slug: 'why-holdings-data-lags', question: 'Why is the holdings data a few months old?' },
  { slug: 'what-concentration-means', question: 'What does concentration mean?' },
];

// ─── The Translation-register drafting prompt ───────────────────────────────

const DRAFT_PROMPT = `You write plain-English explainers of general investment concepts for members of a 401(k) plan. Register: explain, never evaluate. You are a patient, neutral teacher — you help a reader understand what a concept means; you never judge any investment, compare anything as better or worse, or advise the reader.

RULES:
- Plain English for a smart coworker who does not work in finance. Short sentences. Concrete nouns.
- If a term of art is unavoidable, explain it in the same breath, once.
- Dollar figures alongside percents where they help ("0.45% is about $45 a year on a $10,000 balance").
- No judgment, no comparison, no advice verbs. Never tell the reader to do, consider, or watch anything.
- Neither is a concept's presence in a fund a plus or a minus in your telling — describe what it is and how it works, and stop there.

BANNED WORDS (never use these, in ANY form or inflection — no "cheaper", no "strongest", no "recommended", no "topped"):
${BANNED_VOCABULARY.join(', ')}

Write one compact explainer (a short paragraph or two, under 250 words) answering the question. Return ONLY the explainer text — no heading, no preamble.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── The run ────────────────────────────────────────────────────────────────

/**
 * Draft every §6 topic that has no help_entries row yet. Sequential with
 * 1.2s delays; per-topic failures never abort the batch. Returns per-topic
 * outcomes for the route response (B7 route pattern).
 */
export async function generateHelpDrafts(): Promise<HelpDraftRunResult> {
  const result: HelpDraftRunResult = {
    drafted: [],
    rejected: [],
    skipped: [],
    total: GROUNDING_TOPICS.length,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[help-drafts] No ANTHROPIC_API_KEY — skipping draft run');
    return result;
  }

  // Existing rows are never touched — a re-click only fills gaps, so
  // Robert's approvals and edits stand.
  const { data: existingRows, error: existingError } = await supaSelect<Array<{ slug: string }>>(
    'help_entries',
    {},
    'slug',
  );
  if (existingError) {
    console.error('[help-drafts] Failed to fetch existing help_entries:', existingError);
    return result;
  }
  const existingSlugs = new Set((existingRows || []).map(r => r.slug));

  const client = new Anthropic({ apiKey });

  // Sequential by law — one topic at a time, 1.2s between calls.
  let madeCall = false;
  for (const topic of GROUNDING_TOPICS) {
    if (existingSlugs.has(topic.slug)) {
      result.skipped.push({ slug: topic.slug, reason: 'row already exists' });
      continue;
    }

    if (madeCall) await delay(CLAUDE.CALL_DELAY_MS);
    madeCall = true;

    let text = '';
    try {
      const response = await client.messages.create({
        model: CLAUDE.PROSE_MODEL,
        max_tokens: 12000,
        system: DRAFT_PROMPT,
        messages: [{ role: 'user', content: topic.question }],
      });
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      text = text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[help-drafts] Claude API error for ${topic.slug}: ${msg}`);
      result.skipped.push({ slug: topic.slug, reason: 'Claude call failed' });
      continue;
    }

    if (!text) {
      result.skipped.push({ slug: topic.slug, reason: 'empty response' });
      continue;
    }

    // Post-check: B7's banned-vocabulary rejection — a hit writes nothing.
    const word = findBannedWord(text);
    if (word !== null) {
      result.rejected.push({ slug: topic.slug, word });
      continue;
    }

    const { error: insertError } = await supaInsert('help_entries', {
      tier: 'reference',
      slug: topic.slug,
      question: topic.question,
      answer_text: text,
      status: 'draft',
      drafted_by: CLAUDE.PROSE_MODEL,
    });
    if (insertError) {
      console.error(`[help-drafts] Write failed for ${topic.slug}:`, insertError);
      result.skipped.push({ slug: topic.slug, reason: 'database write failed' });
    } else {
      result.drafted.push(topic.slug);
    }
  }

  console.log(
    `[help-drafts] Run complete: ${result.drafted.length} drafted, ` +
    `${result.rejected.length} rejected, ${result.skipped.length} skipped, ` +
    `${result.total} topics`
  );
  return result;
}
