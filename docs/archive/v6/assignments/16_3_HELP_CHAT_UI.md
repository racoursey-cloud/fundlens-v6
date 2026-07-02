# Assignment 16.3: Help Chat UI Component

**Session:** 16 (Optional)
**Estimate:** 30 minutes
**Depends on:** 16.2 (chat endpoint exists)

---

## Spec Reference

- **MISSING-9** — "Claude Haiku chat scoped strictly to FundLens questions"

## Files to Read First

- `client/src/pages/Help.tsx` — the Help page you created in 16.1
- `client/src/api.ts` — the `fetchHelpChat` function (should already exist)

## Files to Change

- `client/src/pages/Help.tsx`

## What to Do

### 1. Add a chat section below the FAQs

At the bottom of the Help page, add a simple chat interface:

- A text input for the user's question
- A "Ask" button
- A response area that shows Claude's answer
- A loading state while waiting for the response
- Error handling for failed requests or rate limit exceeded

### 2. Design requirements

- Simple, clean interface — NOT a full chat history. Just: question → answer.
- Previous question/answer clears when a new question is submitted
- Placeholder text: "Ask a question about FundLens..."
- Max input length: 500 characters (match server validation)
- Response area uses a slightly different background (surfaceAlt) to distinguish from the question
- Loading spinner or "Thinking..." text while waiting

### 3. Use the existing API function

```typescript
import { fetchHelpChat } from '../api';
```

Call it on form submit:
```typescript
const handleAsk = async () => {
  if (!question.trim()) return;
  setLoading(true);
  setError(null);
  try {
    const res = await fetchHelpChat(question);
    setAnswer(res.data?.reply || 'No response received.');
  } catch (err) {
    setError('Could not get a response. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

### 4. Header for the chat section

Add a clear header:
```
Still have questions?
Ask about anything related to FundLens or your 401(k) funds.
```

## What NOT to Do

- Do NOT implement a full conversation history — keep it simple (one Q&A at a time)
- Do NOT store chat history in localStorage or any persistent storage
- Do NOT add typing animations or other complex UI effects
- Do NOT change any other pages or components

## Verification

1. `tsc --noEmit` passes
2. Help page shows FAQs + chat section
3. Chat input accepts text, submits to API, shows response
4. Error state displays when API fails
5. Loading state shows while waiting

### After all Session 16 tasks

Update spec:
- §5.5: Add `pages/Help.tsx` to client file inventory
- §6.7: Add "Help page with FAQs and Claude Haiku Q&A" to UI components
- §9: Mark MISSING-9 as resolved
- §10: Add Session 16 changelog entry

Commit and push:
1. `Session 16: Help page with FAQs + Claude Haiku chat`
2. `Session 16: Update spec §5.5, §6.7, §9, §10`

## Rollback

```
git checkout -- client/src/pages/Help.tsx
```
