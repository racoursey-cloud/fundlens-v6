**STATUS: COMPLETED** — April 8, 2026 (Session 13)

# Assignment 13.2: Rewrite Allocation Step 4 — De Minimis Floor

**Session:** 13
**Estimate:** 30 minutes
**Depends on:** 13.1 (constants updated)

---

## Spec Reference

- **§3.5** — "Drop any fund with allocation < 5%. Renormalize survivors to sum to 100%."
- **§3.7** — Worked example: Fund A=99.3%, B=0.3%, C=0.3%, D=0.1% → only Fund A survives → 100% allocation.

## Files to Read First

- `src/engine/allocation.ts` — read the entire file (288 lines). Pay special attention to:
  - Line 34: destructuring import of `CAPTURE_HIGH, CAPTURE_STEP` (must be removed)
  - Lines 218–241: Step 4 capture threshold implementation (must be replaced)
  - Lines 243–246: renormalization after capture threshold (will be reused)

## Files to Change

- `src/engine/allocation.ts`

## What to Do

### 1. Fix the import (line 34)

**Remove:**
```typescript
const { CAPTURE_HIGH, CAPTURE_STEP } = ALLOCATION;
```

These constants no longer exist after Task 13.1.

### 2. Replace Step 4 (lines 218–246)

**Remove** the entire "STEP 4 — Capture Threshold Trim" block (lines 218–246).

**Replace with** this de minimis floor implementation:

```typescript
  // ── STEP 4 — De Minimis Floor (§3.5) ─────────────────────────────────
  // Drop any fund with allocation below 5% (DE_MINIMIS_PCT).
  // Renormalize survivors to sum to 100%.
  //
  // This is a single-pass operation: removing sub-threshold funds only
  // increases survivor allocations (denominator shrinks), so no fund
  // that was above 5% can drop below 5% after removal.
  const deMinimisThreshold = ALLOCATION.DE_MINIMIS_PCT * 100; // 5 (percentage points)

  for (const [ticker, pct] of allocMap) {
    if (pct < deMinimisThreshold) {
      allocMap.delete(ticker);
    }
  }

  // Renormalize survivors to 100%
  const survivorSum = Array.from(allocMap.values()).reduce((a, b) => a + b, 0) || 1;
  for (const [ticker, pct] of allocMap) {
    allocMap.set(ticker, (pct / survivorSum) * 100);
  }
```

### 3. Verify the rest of the file is untouched

Steps 1 (MAD z-score), 2 (quality gate), 3 (exponential curve), and 5 (rounding + error absorption) must remain exactly as they are. Do not modify them.

### 4. Update the file header comment

The file header (lines 8–11) already claims "5% de minimis floor" — which is now actually true. No change needed to the header. But update the Session note at line 21:

**Change:**
```
 * Session 6: Extracted from brief-engine.ts, rewritten to match spec §3.1–3.6.
```
**To:**
```
 * Session 6: Extracted from brief-engine.ts, rewritten to match spec §3.1–3.6.
 * Session 13: Replaced capture threshold (Step 4) with de minimis floor per §3.5.
```

## What NOT to Do

- Do NOT change the MAD z-score computation (Step 1)
- Do NOT change the quality gate (Step 2)
- Do NOT change the exponential curve (Step 3)
- Do NOT change the rounding logic (Step 5)
- Do NOT change the function signature or return type
- Do NOT add iteration/looping to the de minimis step — it is mathematically proven to be single-pass (removing sub-threshold funds only increases survivor allocations)
- Do NOT add a minimum fund count or any other threshold beyond DE_MINIMIS_PCT

## Verification

1. `tsc --noEmit` — must pass clean (the broken import from 13.1 is now fixed)
2. Mental walkthrough of §3.7 worked example:
   - Fund A=99.3%, B=0.3%, C=0.3%, D=0.1%
   - De minimis 5%: B, C, D all < 5% → removed
   - Survivor: A at 99.3% → renormalized to 100%
   - Round: 100% → Fund A gets 100%
   - Correct per spec
3. Mental walkthrough of a balanced case:
   - 6 funds each at ~16.7%: all above 5%, all survive, no change
   - Correct: de minimis has no effect when all funds are well-allocated

## Rollback

```
git checkout -- src/engine/allocation.ts
```
