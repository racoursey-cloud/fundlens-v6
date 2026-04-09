# Session 13 Notes

## Status
All 5 assignments (13.1–13.5) completed, committed, and pushed to main. `tsc --noEmit` passes.

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

### Dead code note
`client/src/engine/allocation.ts` line 32 defines `MM_TICKERS` but it is never used within that module. The `isMoneyMarket` flag is passed in as input from Portfolio.tsx instead. This is harmless but sloppy.
