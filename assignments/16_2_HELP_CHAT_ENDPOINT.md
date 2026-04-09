# Assignment 16.2: Claude Haiku Chat Endpoint

**Session:** 16 (Optional)
**Estimate:** 30 minutes
**Depends on:** 16.1 (Help page exists)

---

## Spec Reference

- **MISSING-9** — "Claude Haiku chat scoped strictly to FundLens questions"
- **§5.3** — Claude sequential calls with 1.2s delays, all through /api/claude proxy

## Purpose

Add a server-side endpoint that accepts a user question and returns a Claude Haiku response, scoped strictly to FundLens topics. This prevents misuse (users asking Claude about unrelated topics on Robert's API key).

## Files to Read First

- `src/routes/routes.ts` — existing route patterns, auth middleware, rate limiting
- `src/engine/constants.ts` — CLAUDE configuration block
- `client/src/api.ts` — existing `fetchHelpChat` function (line 237 — it already exists!)

## Files to Change

- `src/routes/routes.ts`

## What to Do

### 1. Check if the endpoint already exists

The client API file (api.ts line 237) already has a `fetchHelpChat` function that calls `/api/help/chat`. Check if routes.ts already has this endpoint. If it does, review it and verify it matches the requirements below. If not, create it.

### 2. Create the /api/help/chat endpoint

Add to routes.ts:

```typescript
/**
 * POST /api/help/chat
 * Claude Haiku chat scoped to FundLens questions.
 * Rate limited to prevent API key abuse.
 */
const helpChatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,                   // 20 questions per hour
  message: { error: 'Help chat rate limit exceeded. Max 20 per hour.' },
  keyGenerator: (req) => (req as AuthenticatedRequest).userId || 'anonymous',
  validate: { trustProxy: false, xForwardedForHeader: false },
});

router.post('/api/help/chat', requireAuth, helpChatRateLimit, async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    res.status(400).json({ error: 'Question is required' });
    return;
  }

  if (question.length > 500) {
    res.status(400).json({ error: 'Question too long (max 500 characters)' });
    return;
  }

  // Scoping prompt: Claude must only answer FundLens-related questions
  const systemPrompt = `You are a helpful assistant for FundLens, a 401(k) fund scoring and allocation platform. You can ONLY answer questions about:
- How FundLens works (scoring, allocation, factors, risk tolerance)
- What the scores, tiers, and allocation percentages mean
- How to use the FundLens interface (sliders, donuts, fund detail, briefs)
- General 401(k) concepts (what a fund is, expense ratios, diversification)

You must NOT:
- Provide specific investment advice ("you should buy X")
- Answer questions unrelated to FundLens or 401(k) investing
- Discuss other financial products, cryptocurrencies, individual stocks, etc.
- Reveal any technical details about the scoring model (z-scores, CDF, MAD, Kelly)

If the question is outside your scope, politely say: "I can only help with questions about FundLens and your 401(k) funds. Could you rephrase your question?"

Keep answers concise (2-4 sentences). Use plain language.`;

  try {
    // Import or call Claude Haiku through the existing Claude proxy pattern
    // Use the CLASSIFICATION_MODEL (Haiku) — cheapest and fastest
    const response = await fetch(`${process.env.ANTHROPIC_API_KEY ? 'https://api.anthropic.com/v1/messages' : ''}`, {
      // ... implementation depends on existing Claude call pattern in the codebase
    });

    // Return the response
    res.json({ reply: /* Claude's response text */ });
  } catch (error) {
    console.error('[routes] Help chat error:', error);
    res.status(500).json({ error: 'Failed to get help response. Please try again.' });
  }
});
```

**IMPORTANT:** Look at how other Claude calls are made in the codebase (thesis.ts, classify.ts, brief-engine.ts) and follow the exact same pattern. Do NOT create a new Claude client — reuse the existing one. Use Claude Haiku (CLASSIFICATION_MODEL) for cost efficiency.

### 3. Respect sequential Claude call rules

Per §5.3: All Claude calls must be sequential with 1.2s delays. The help chat endpoint should not interfere with pipeline Claude calls. Since the help endpoint is user-triggered (not pipeline), and the pipeline runs on a schedule, conflicts are unlikely but the 1.2s delay should still be respected if multiple help requests come in rapid succession (the rate limiter handles this).

## What NOT to Do

- Do NOT use Claude Sonnet or Opus — use Haiku (cheapest model for Q&A)
- Do NOT allow unscoped questions — the system prompt must constrain the scope
- Do NOT expose the system prompt to the client
- Do NOT remove the rate limiter — this protects Robert's API key
- Do NOT modify any existing endpoints

## Verification

1. `tsc --noEmit` passes
2. Endpoint exists at POST /api/help/chat
3. Rate limiting configured (20/hour)
4. System prompt scopes responses to FundLens topics
5. Input validation (non-empty, max 500 chars)

## Rollback

Remove the added route from `src/routes/routes.ts`.
