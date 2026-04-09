# Session 13 Notes

## Status
All 5 assignments (13.1–13.5) completed, committed, and pushed to main. Deployed to Railway.

## OPEN ISSUE — Robert flagged a model misunderstanding

After Task 13.5 was committed, the AI provided an unsolicited explanation of the "balanced case" verification (5 funds all scoring 50 → equal 20% allocation each). Robert said:

> "That is exactly wrong. You totally misunderstood the model."
> "From where did this balanced = all funds get the same % come from? What the hell are you talking about?"

The AI was unable to identify what it got wrong. Robert was unable to explain further in the moment.

### What was said (the problematic explanation)
The AI claimed: "when all funds have identical scores, the algorithm degrades gracefully to uniform allocation when there's no differentiation signal."

### What needs investigation next session
- Robert believes the allocation model does NOT work the way the AI described
- The "balanced case" verification (from assignment 13_5, lines 59–70) may itself be flawed, OR the AI's interpretation of WHY it works that way is wrong, OR there is a deeper model misunderstanding that the AI cannot see
- **The AI does not know what is wrong.** Do NOT assume the code is correct just because tsc passes and the math traces. Robert sees something the AI missed.
- Next session should ask Robert to explain the model misunderstanding before proceeding to Session 14

### Files changed in Session 13
- `src/engine/constants.ts` — CAPTURE_HIGH/CAPTURE_STEP removed, DE_MINIMIS_PCT added (Task 13.1, prior session)
- `src/engine/allocation.ts` — Step 4 rewritten: capture threshold → de minimis floor (Task 13.2)
- `client/src/engine/allocation.ts` — NEW FILE, client-side allocation port (Task 13.3)
- `client/src/pages/Portfolio.tsx` — allocation import, useMemo, donut replaced, Alloc column added (Task 13.4)
- `FUNDLENS_SPEC.md` — §9 CRITICAL-6 resolved, MISSING-14 resolved, §10 changelog entries
- `assignments/13_*.md` — all 5 marked COMPLETED

## DEPLOYMENT FAILURE — Fixed

After Task 13.5 was committed and pushed, Railway deployment failed. The AI had been verifying with `tsc --noEmit` from the server root, which does NOT check the client build. The actual Railway build runs `npm run build` which includes `cd client && tsc -b && vite build` — stricter TypeScript checking.

### Errors (in `client/src/engine/allocation.ts`)
1. `MM_TICKERS` declared but never read (TS6133) — dead code from Task 13.3
2. `sorted[mid]` is `number | undefined`, needs non-null assertion (TS2322)
3. `sorted[mid-1]` and `sorted[mid]` possibly undefined (TS2532)

### Fix
- Removed unused `MM_TICKERS` constant
- Added `!` non-null assertion and `?? 0` nullish coalescing to median()
- Commit: `ede0184`

### Root cause
The AI verified every task with `tsc --noEmit` (server tsconfig) instead of `npm run build` (full build including client). The assignment files specified `tsc --noEmit` as the verification step, but the AI should have recognized that a new client-side file requires client-side build verification.

### Lesson for future sessions
**ALWAYS verify with `npm run build`, not `tsc --noEmit`.** The server tsconfig does not cover client code. This must be the verification step after any change to files under `client/`.

## OPEN ISSUE — Robert flagged a model misunderstanding

This is UNRESOLVED. The AI does not know what it got wrong. Next session must ask Robert before proceeding.
