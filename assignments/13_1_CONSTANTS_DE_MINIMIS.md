# Assignment 13.1: Replace Capture Threshold Constants with De Minimis

**Session:** 13
**Estimate:** 15 minutes
**Depends on:** None (first task in Session 13)

---

## Spec Reference

- **§3.5** — "Drop any fund with allocation < 5%. Renormalize survivors to sum to 100%."
- **§3.4** — "No hard-coded fund counts, no stair-step mapping from slider value to fund count, no inverse mapping tables."
- **§10, item 11** — "5% minimum allocation floor based on industry-standard de minimis threshold... Replaces v5.1's 1–9 slider and arbitrary 65% capture threshold."

## Files to Read First

- `src/engine/constants.ts` — read the entire ALLOCATION block (lines 88–103)
- `src/engine/allocation.ts` — read line 34 (the destructuring import of CAPTURE_HIGH, CAPTURE_STEP)

## Files to Change

- `src/engine/constants.ts`

## What to Do

1. In the `ALLOCATION` object (around line 89), **remove** these two properties:
   - `CAPTURE_HIGH: 70`
   - `CAPTURE_STEP: 5`

2. **Remove** the comment block above them that describes the capture threshold behavior (lines 95–99).

3. **Add** a new property to the `ALLOCATION` object:
   ```typescript
   /** De minimis floor (§3.5). Funds with allocation below this threshold are
    *  dropped and survivors renormalized. Industry-standard minimum position size.
    *  Single-pass: removing sub-threshold funds only increases survivor allocations. */
   DE_MINIMIS_PCT: 0.05,
   ```

4. The final `ALLOCATION` object should look like:
   ```typescript
   export const ALLOCATION = {
     /** MAD consistency constant (1/Phi^-1(0.75)) */
     MAD_CONSISTENCY: 0.6745,
     /** Quality gate: funds with this many or more fallbacks are excluded */
     QUALITY_GATE_MAX_FALLBACKS: 4,
     /** De minimis floor (§3.5). Funds with allocation below this threshold are
      *  dropped and survivors renormalized. Industry-standard minimum position size.
      *  Single-pass: removing sub-threshold funds only increases survivor allocations. */
     DE_MINIMIS_PCT: 0.05,
   } as const;
   ```

## What NOT to Do

- Do NOT change any other constants (Kelly table, tier badges, factor weights, etc.)
- Do NOT change allocation.ts yet — that is Task 13.2
- Do NOT add any new constants beyond DE_MINIMIS_PCT
- Do NOT rename the ALLOCATION object or change its export

## Verification

1. `tsc --noEmit` — should fail at this point because allocation.ts still imports CAPTURE_HIGH and CAPTURE_STEP. That's expected and will be fixed in Task 13.2.
2. Confirm the ALLOCATION object has exactly 3 properties: MAD_CONSISTENCY, QUALITY_GATE_MAX_FALLBACKS, DE_MINIMIS_PCT
3. Confirm no other file was modified

## Rollback

Revert `src/engine/constants.ts` to the previous version:
```
git checkout -- src/engine/constants.ts
```
