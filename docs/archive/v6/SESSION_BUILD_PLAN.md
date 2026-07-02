# Session Task: Create Granular Build Plan
## READ SESSION_PREAMBLE.md FIRST. Follow every rule in it.

---

## CONTEXT

FundLens v6 completed a full assessment in Session 12. The scoring engine math is correct. The project has 3 remaining critical items to match v5.1 functionality, plus 2 optional items for full spec compliance. All stale documentation has been removed. The spec (FUNDLENS_SPEC.md) is now the sole source of truth and accurately reflects the current state.

Read ASSESSMENT_REPORT.md for the full findings. Read FUNDLENS_SPEC.md §9 for implementation status.

## YOUR MISSION

**Create a granular, task-level build plan for Sessions 13–17.** Each task should be small enough to complete in one focused block of work (30–90 minutes), with clear inputs, outputs, and verification steps. The goal is: any session can pick up any task and execute it without needing context beyond the spec and the task description.

**You are in Phase 1 (READ-ONLY) for this entire session.** The only file you create is the build plan itself.

## STEP-BY-STEP INSTRUCTIONS

### Step 1: Read these files completely

- `FUNDLENS_SPEC.md` — all of it, especially §3 (Allocation), §6.4 (Risk Slider), §9 (Implementation Status)
- `ASSESSMENT_REPORT.md` — the full assessment findings
- `SESSION_PREAMBLE.md` — the operational rules
- `src/engine/allocation.ts` — the file with the capture threshold bug
- `src/engine/constants.ts` — where DE_MINIMIS_PCT needs to be added
- `client/src/pages/Portfolio.tsx` — where allocation display needs to be added
- `src/routes/routes.ts` — where a new allocation endpoint may be needed

### Step 2: For each remaining session, break the work into discrete tasks

**Session 13: Allocation Fix + Portfolio Allocation Display**

This session has two deliverables:
1. Fix the allocation engine to use 5% de minimis floor (§3.5) instead of capture threshold
2. Add allocation display to the Portfolio page (matching v5.1's behavior)

Break each deliverable into tasks with this structure:

```
### Task 13.1: [Short descriptive name]

**Spec reference:** §X.Y
**Files to change:** [exact file paths]
**What to do:**
  [Precise description — what to add/remove/change, citing spec formulas]
**What NOT to do:**
  [Guardrails — things that are tempting but wrong]
**Verification:**
  [How to confirm the change is correct — tsc, manual calculation, etc.]
**Depends on:** [Task IDs this depends on, or "none"]
```

**Session 14: End-to-End Integration Testing**

This is the most important session. Break it into:
- Pre-flight checks (env vars, migrations, cache tables)
- Pipeline execution against real data
- Scoring output validation (spot-check against manual calculation)
- Brief generation test
- Allocation output validation
- Performance measurement
- Bug documentation (anything that fails)

**Session 15: HHI + Documentation + Polish**

- HHI computation and display
- Spec file inventory update for fund-summaries.ts (already done in Session 12)
- Any polish items discovered during Session 14 testing

**Session 16 (optional): Help Section**

- FAQs (static content)
- Claude Haiku chat scoped to FundLens questions
- UI component for help page

**Session 17 (optional): Fund-of-Funds Look-Through**

- Wire resolveSubFundTicker() to FMP search
- Test against real fund-of-funds tickers
- Verify recursion depth = 1

### Step 3: Add guardrails to each task

For every task, include:
- **Spec citation** — the exact section number that governs the decision
- **Anti-patterns** — specific things NOT to do (e.g., "do NOT add a capture threshold," "do NOT change scoring math")
- **Verification step** — how to prove the task was completed correctly
- **Rollback plan** — what to revert if something goes wrong

### Step 4: Write the build plan

Save it as `BUILD_PLAN.md` in the fundlens-v6 repo root. Structure:

1. **Overview** — what remains, why, and estimated effort
2. **Session 13 Tasks** (numbered 13.1, 13.2, 13.3, etc.)
3. **Session 14 Tasks** (numbered 14.1, 14.2, etc.)
4. **Session 15 Tasks** (numbered 15.1, 15.2, etc.)
5. **Session 16 Tasks** (numbered 16.1, 16.2, etc.) — marked optional
6. **Session 17 Tasks** (numbered 17.1, 17.2, etc.) — marked optional
7. **Definition of Done** — what "v6 matches v5.1" means, concretely

### Step 5: Present to Robert

Walk through the plan. Be specific about which tasks are blocking and which are independent. Flag any tasks where you're uncertain about the approach.

## RULES FOR THIS SESSION

- **READ-ONLY.** The only file you create is `BUILD_PLAN.md`. You do not edit any source code.
- **Every task must cite the spec.** If you can't point to a spec section, the task doesn't belong in the plan.
- **Tasks must be atomic.** One task = one logical change. No "fix allocation and also add HHI and also update the brief" in one task.
- **No optimistic estimates.** If a task might take 2 hours, say 2 hours. Robert prefers honest timelines over ambitious ones.
- **Flag uncertainties.** If you're not sure about an approach, say so. Robert would rather discuss it now than discover a wrong assumption in Session 15.
