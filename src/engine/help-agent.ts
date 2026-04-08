/**
 * FundLens v6 — Help Agent
 *
 * Configurable chat agent backed by Claude Haiku. The admin defines
 * the agent's scope and personality via a prompt file. This module
 * loads the prompt, manages conversation context, and streams responses.
 *
 * Designed to be project-agnostic — swap the prompt file and the agent
 * works for any product (FundLens, football project, etc.).
 *
 * Session 12 deliverable. Destination: src/engine/help-agent.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CLAUDE } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface HelpChatRequest {
  message: string;
  history?: HelpMessage[];
}

export interface HelpChatResponse {
  reply: string;
}

// ─── Prompt Loading ─────────────────────────────────────────────────────────

let cachedPrompt: string | null = null;

/**
 * Load the help agent system prompt from the prompt file.
 * Searches multiple locations to handle both dev and production builds.
 * The admin can edit this file to change the agent's scope.
 */
function loadHelpPrompt(): string {
  if (cachedPrompt) return cachedPrompt;

  const candidates = [
    join(__dirname, '../prompts/help-agent.md'),
    join(__dirname, '../../src/prompts/help-agent.md'),
    join(process.cwd(), 'src/prompts/help-agent.md'),
  ];

  for (const p of candidates) {
    try {
      cachedPrompt = readFileSync(p, 'utf-8');
      console.log(`[help-agent] Loaded prompt from ${p}`);
      return cachedPrompt;
    } catch {
      // Try next candidate
    }
  }

  // Fallback — minimal prompt
  console.warn('[help-agent] Could not load help-agent.md, using fallback');
  cachedPrompt = 'You are a helpful assistant. Answer questions concisely and clearly.';
  return cachedPrompt;
}

/**
 * Clear the cached prompt — useful if the admin updates the file at runtime.
 */
export function reloadHelpPrompt(): void {
  cachedPrompt = null;
  loadHelpPrompt();
}

// ─── Chat API ───────────────────────────────────────────────────────────────

/**
 * Send a message to the help agent and get a response.
 *
 * @param request The user's message and optional conversation history
 * @returns The agent's reply
 */
export async function helpChat(request: HelpChatRequest): Promise<HelpChatResponse> {
  const systemPrompt = loadHelpPrompt();

  // Build message history for context
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (request.history) {
    for (const msg of request.history.slice(-10)) { // Keep last 10 messages for context
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current message
  messages.push({ role: 'user', content: request.message });

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: CLAUDE.CLASSIFICATION_MODEL, // Haiku — fast + cheap
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    let reply = '';
    for (const block of response.content) {
      if (block.type === 'text') reply += block.text;
    }

    return { reply: reply || "I'm not sure how to help with that. Could you rephrase?" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[help-agent] Claude API error: ${msg}`);
    return { reply: "I'm having trouble connecting right now. Please try again in a moment." };
  }
}
